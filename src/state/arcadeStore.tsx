import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/client';
import {
  ArcadeRoomDoc,
  AudioSettings,
  AvatarEmblem,
  FriendRelationDoc,
  GameId,
  MatchResultPayload,
  OnlineContextInfo,
  PlayerId,
  PlayerProfile,
  RoomMatchDoc,
  RoomMessageDoc,
  UserAccountDoc,
} from '../types/arcade';
import { sound } from '../utils/sound';

const LOCAL_AUDIO_KEY = 'playpal_arcade_audio_v1';
const LAST_ROOM_KEY = 'playpal_arcade_last_room_v1';

export function normalizeEmblem(
  raw: unknown,
  fallback: AvatarEmblem = 'arcade'
): AvatarEmblem {
  if (raw === 'bolt') return 'arcade';
  if (raw === 'flame') return 'rocket';
  if (
    raw === 'arcade' ||
    raw === 'rocket' ||
    raw === 'crown' ||
    raw === 'shield' ||
    raw === 'star' ||
    raw === 'swords'
  ) {
    return raw;
  }
  return fallback;
}

const DEFAULT_PROFILES: Record<PlayerId, PlayerProfile> = {
  p1: {
    id: 'p1',
    name: 'Player 1',
    accentColor: '#FFE17C',
    secondaryColor: '#171E19',
    emblem: 'arcade',
    photoUrl: '',
    winTaunt: 'Player 1 wins the match!',
    leadTaunt: 'Player 1 takes the lead!',
  },
  p2: {
    id: 'p2',
    name: 'Player 2',
    accentColor: '#B7C6C2',
    secondaryColor: '#171E19',
    emblem: 'rocket',
    photoUrl: '',
    winTaunt: 'Player 2 wins the match!',
    leadTaunt: 'Player 2 takes the lead!',
  },
};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
  if (cleaned.length >= 3) return cleaned;
  return `player_${Math.random().toString(36).slice(2, 6)}`;
}

function buildDefaultHandle(user: User): string {
  const emailBase = user.email ? user.email.split('@')[0] : '';
  const raw = emailBase || user.displayName || 'player';
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 16);
  const suffix = user.uid.slice(-4).toLowerCase().replace(/[^a-z0-9]/g, '7');
  const combined = `${base.length >= 3 ? base : 'player'}_${suffix}`.slice(0, 24);
  return combined;
}

interface ArcadeContextValue {
  authReady: boolean;
  user: User | null;
  account: UserAccountDoc | null;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateAccount: (
    patch: Partial<Omit<UserAccountDoc, 'uid'>>
  ) => Promise<{ ok: boolean; error?: string }>;

  // Rooms
  myRooms: ArcadeRoomDoc[];
  room: ArcadeRoomDoc | null;
  roomError: string | null;
  clearRoomError: () => void;
  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  deleteRoom: (code: string) => Promise<void>;
  claimSide: (side: PlayerId) => Promise<void>;
  swapSidesInRoom: () => Promise<void>;
  launchRoomGame: (gameId: GameId) => Promise<void>;
  restartRoomGame: () => Promise<void>;
  exitRoomGameToLobby: () => Promise<void>;

  // Friends
  friends: FriendRelationDoc[];
  incomingRequests: FriendRelationDoc[];
  outgoingRequests: FriendRelationDoc[];
  roomInvites: FriendRelationDoc[];
  sendFriendRequest: (targetUsername: string) => Promise<{ ok: boolean; message: string }>;
  respondFriendRequest: (reqId: string, accept: boolean) => Promise<void>;
  removeFriendOrRequest: (reqId: string) => Promise<void>;
  inviteFriendToRoom: (reqId: string, roomCode: string) => Promise<void>;
  clearRoomInvite: (reqId: string) => Promise<void>;

  // Chat & Matches inside Room
  messages: RoomMessageDoc[];
  sendChatMessage: (text: string) => Promise<void>;
  sendVoiceMessage: (audioData: string, durationSec: number) => Promise<void>;
  matches: RoomMatchDoc[];
  recordRoomMatch: (gameId: GameId, gameName: string, payload: MatchResultPayload) => Promise<void>;

  // Derived Profiles & Online Context
  p1: PlayerProfile;
  p2: PlayerProfile;
  mySide: PlayerId | null;
  onlineContext: OnlineContextInfo | null;

  // Audio
  audio: AudioSettings;
  setAudio: (patch: Partial<AudioSettings>) => void;
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

function hasLegacyRoomFields(raw: Record<string, unknown>): boolean {
  return (
    'hananUid' in raw ||
    'hananName' in raw ||
    'rehanUid' in raw ||
    'rehanName' in raw ||
    'hananWins' in raw ||
    'rehanWins' in raw ||
    !('p1Uid' in raw) ||
    !('p1Name' in raw) ||
    !('p2Uid' in raw) ||
    !('p2Name' in raw) ||
    !('p1Wins' in raw) ||
    !('p2Wins' in raw)
  );
}

function buildLegacyMigrationPatch(normalized: ArcadeRoomDoc): Record<string, unknown> {
  return {
    p1Uid: normalized.p1Uid,
    p1Name: normalized.p1Name,
    p2Uid: normalized.p2Uid,
    p2Name: normalized.p2Name,
    p1Wins: normalized.p1Wins,
    p2Wins: normalized.p2Wins,
    draws: normalized.draws,
    hananUid: deleteField(),
    hananName: deleteField(),
    rehanUid: deleteField(),
    rehanName: deleteField(),
    hananWins: deleteField(),
    rehanWins: deleteField(),
  };
}

function normalizeRoomDoc(raw: Record<string, unknown>): ArcadeRoomDoc {
  const activeRaw = String(raw.activeGame ?? 'lobby');
  const validGames: GameId[] = ['chess', 'carrom', 'headball', 'football', 'racing', 'airhockey'];
  const activeGame = validGames.includes(activeRaw as GameId) ? (activeRaw as GameId) : 'lobby';

  return {
    roomCode: String(raw.roomCode ?? ''),
    hostUid: String(raw.hostUid ?? ''),
    guestUid: String(raw.guestUid ?? ''),
    p1Uid: String(raw.p1Uid ?? raw.hananUid ?? ''),
    p1Name: String(raw.p1Name ?? raw.hananName ?? ''),
    p1Photo: String(raw.p1Photo ?? ''),
    p2Uid: String(raw.p2Uid ?? raw.rehanUid ?? ''),
    p2Name: String(raw.p2Name ?? raw.rehanName ?? ''),
    p2Photo: String(raw.p2Photo ?? ''),
    activeGame,
    matchSeed: Math.max(1, Number(raw.matchSeed ?? 1) || 1),
    p1Wins: Math.max(0, Number(raw.p1Wins ?? raw.hananWins ?? 0) || 0),
    p2Wins: Math.max(0, Number(raw.p2Wins ?? raw.rehanWins ?? 0) || 0),
    draws: Math.max(0, Number(raw.draws ?? 0) || 0),
    status: raw.status === 'playing' ? 'playing' : 'open',
  };
}

export const ArcadeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<UserAccountDoc | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [myRooms, setMyRooms] = useState<ArcadeRoomDoc[]>([]);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_ROOM_KEY);
    } catch {
      return null;
    }
  });
  const [room, setRoom] = useState<ArcadeRoomDoc | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessageDoc[]>([]);
  const [matches, setMatches] = useState<RoomMatchDoc[]>([]);
  const [friendRelations, setFriendRelations] = useState<FriendRelationDoc[]>([]);

  const [audio, setAudioState] = useState<AudioSettings>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_AUDIO_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { muted: false, volume: 0.65 };
  });

  useEffect(() => {
    sound.setConfig(audio.muted, audio.volume);
    try {
      localStorage.setItem(LOCAL_AUDIO_KEY, JSON.stringify(audio));
    } catch {}
  }, [audio]);

  const setAudio = useCallback((patch: Partial<AudioSettings>) => {
    setAudioState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (!u) {
        setAccount(null);
        setRoom(null);
        setMyRooms([]);
        setMessages([]);
        setMatches([]);
        setFriendRelations([]);
      }
    });
    return () => unsub();
  }, []);

  // Load or bootstrap /users/{uid} and /handles/{username}
  useEffect(() => {
    if (!authReady || !user) return;
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);

    const ensureHandleClaimed = async (handle: string, prof: UserAccountDoc) => {
      const handlePath = `handles/${handle}`;
      try {
        const hRef = doc(db, 'handles', handle);
        const hSnap = await getDoc(hRef);
        if (!hSnap.exists() || hSnap.data()?.uid === user.uid) {
          await setDoc(hRef, {
            handle,
            uid: user.uid,
            displayName: prof.displayName,
            accentColor: prof.accentColor,
            emblem: normalizeEmblem(prof.emblem),
            photoUrl: (prof.photoUrl ?? '').slice(0, 65000),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, handlePath);
      }
    };

    const ensureUserProfile = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const displayName = (user.displayName || 'Player').slice(0, 40);
          let candidateHandle = buildDefaultHandle(user);
          // Ensure candidate handle isn't taken by another uid
          const hCheck = await getDoc(doc(db, 'handles', candidateHandle));
          if (hCheck.exists() && hCheck.data()?.uid !== user.uid) {
            candidateHandle = `${candidateHandle.slice(0, 18)}_${Math.random()
              .toString(36)
              .slice(2, 6)}`.slice(0, 24);
          }

          const initialPhoto = (user.photoURL ?? '').slice(0, 2000);
          const initialDoc: UserAccountDoc = {
            uid: user.uid,
            displayName,
            username: candidateHandle,
            accentColor: '#FFE17C',
            emblem: 'arcade',
            photoUrl: initialPhoto,
            winTaunt: `${displayName} wins the match!`,
          };
          await setDoc(userRef, {
            ...initialDoc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await ensureHandleClaimed(candidateHandle, initialDoc);
        } else {
          const data = snap.data() as Partial<UserAccountDoc>;
          const normalizedEmb = normalizeEmblem(data.emblem, 'arcade');
          const resolvedPhoto =
            typeof data.photoUrl === 'string' ? data.photoUrl : (user.photoURL ?? '').slice(0, 2000);
          if (!data.username || data.emblem !== normalizedEmb) {
            let candidateHandle = data.username || buildDefaultHandle(user);
            if (!data.username) {
              const hCheck = await getDoc(doc(db, 'handles', candidateHandle));
              if (hCheck.exists() && hCheck.data()?.uid !== user.uid) {
                candidateHandle = `${candidateHandle.slice(0, 18)}_${Math.random()
                  .toString(36)
                  .slice(2, 6)}`.slice(0, 24);
              }
            }
            await updateDoc(userRef, {
              username: candidateHandle,
              emblem: normalizedEmb,
              photoUrl: resolvedPhoto,
              updatedAt: serverTimestamp(),
            });
            await ensureHandleClaimed(candidateHandle, {
              uid: user.uid,
              displayName: data.displayName || user.displayName || 'Player',
              username: candidateHandle,
              accentColor: data.accentColor || '#FFE17C',
              emblem: normalizedEmb,
              photoUrl: resolvedPhoto,
              winTaunt: data.winTaunt || 'Wins the match!',
            });
          } else {
            await ensureHandleClaimed(data.username, {
              uid: user.uid,
              displayName: data.displayName || user.displayName || 'Player',
              username: data.username,
              accentColor: data.accentColor || '#FFE17C',
              emblem: normalizedEmb,
              photoUrl: resolvedPhoto,
              winTaunt: data.winTaunt || 'Wins the match!',
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }
    };

    ensureUserProfile();

    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as Partial<UserAccountDoc>;
          setAccount({
            uid: d.uid || user.uid,
            displayName: d.displayName || user.displayName || 'Player',
            username: d.username || buildDefaultHandle(user),
            accentColor: d.accentColor || '#FFE17C',
            emblem: normalizeEmblem(d.emblem, 'arcade'),
            photoUrl: typeof d.photoUrl === 'string' ? d.photoUrl : '',
            winTaunt: d.winTaunt || `${d.displayName || 'Player'} wins the match!`,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, userPath)
    );

    return () => unsub();
  }, [authReady, user]);

  // Listen to rooms the user hosts or joined
  useEffect(() => {
    if (!authReady || !user) return;
    const roomsPath = 'rooms';
    let hostedMap = new Map<string, ArcadeRoomDoc>();
    let joinedMap = new Map<string, ArcadeRoomDoc>();

    const syncMerged = () => {
      const merged = new Map<string, ArcadeRoomDoc>();
      hostedMap.forEach((v, k) => merged.set(k, v));
      joinedMap.forEach((v, k) => merged.set(k, v));
      setMyRooms(Array.from(merged.values()));
    };

    const qHost = query(collection(db, 'rooms'), where('hostUid', '==', user.uid), limit(12));
    const qGuest = query(collection(db, 'rooms'), where('guestUid', '==', user.uid), limit(12));

    const unsubHost = onSnapshot(
      qHost,
      (snap) => {
        hostedMap = new Map();
        snap.forEach((d) => {
          const r = normalizeRoomDoc(d.data() as Record<string, unknown>);
          hostedMap.set(r.roomCode, r);
        });
        syncMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, roomsPath)
    );

    const unsubGuest = onSnapshot(
      qGuest,
      (snap) => {
        joinedMap = new Map();
        snap.forEach((d) => {
          const r = normalizeRoomDoc(d.data() as Record<string, unknown>);
          joinedMap.set(r.roomCode, r);
        });
        syncMerged();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, roomsPath)
    );

    return () => {
      unsubHost();
      unsubGuest();
    };
  }, [authReady, user]);

  // Listen to Friend Requests & Accepted Friends
  useEffect(() => {
    if (!authReady || !user) return;
    const path = 'friendRequests';
    let incomingMap = new Map<string, FriendRelationDoc>();
    let outgoingMap = new Map<string, FriendRelationDoc>();

    const syncFriends = () => {
      const merged = new Map<string, FriendRelationDoc>();
      incomingMap.forEach((v, k) => merged.set(k, v));
      outgoingMap.forEach((v, k) => merged.set(k, v));
      const arr = Array.from(merged.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
      setFriendRelations(arr);
    };

    const parseDoc = (raw: Record<string, unknown>): FriendRelationDoc => {
      const ts = raw.createdAt as Timestamp | undefined;
      return {
        id: String(raw.id ?? ''),
        fromUid: String(raw.fromUid ?? ''),
        fromUsername: String(raw.fromUsername ?? ''),
        fromName: String(raw.fromName ?? 'Player'),
        fromColor: String(raw.fromColor ?? '#FFE17C'),
        fromEmblem: normalizeEmblem(raw.fromEmblem, 'arcade'),
        fromPhoto: String(raw.fromPhoto ?? ''),
        toUid: String(raw.toUid ?? ''),
        toUsername: String(raw.toUsername ?? ''),
        toName: String(raw.toName ?? 'Player'),
        toColor: String(raw.toColor ?? '#B7C6C2'),
        toEmblem: normalizeEmblem(raw.toEmblem, 'rocket'),
        toPhoto: String(raw.toPhoto ?? ''),
        status: (raw.status as FriendRelationDoc['status']) || 'pending',
        inviteRoomCode: String(raw.inviteRoomCode ?? ''),
        invitedByUid: String(raw.invitedByUid ?? ''),
        createdAtMs: ts ? ts.toMillis() : Date.now(),
      };
    };

    const qIn = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      limit(40)
    );
    const qOut = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', user.uid),
      limit(40)
    );

    const unsubIn = onSnapshot(
      qIn,
      (snap) => {
        incomingMap = new Map();
        snap.forEach((d) => {
          const item = parseDoc(d.data() as Record<string, unknown>);
          incomingMap.set(item.id, item);
        });
        syncFriends();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );

    const unsubOut = onSnapshot(
      qOut,
      (snap) => {
        outgoingMap = new Map();
        snap.forEach((d) => {
          const item = parseDoc(d.data() as Record<string, unknown>);
          outgoingMap.set(item.id, item);
        });
        syncFriends();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );

    return () => {
      unsubIn();
      unsubOut();
    };
  }, [authReady, user]);

  // Subscribe to active room + messages + matches
  useEffect(() => {
    if (!authReady || !user || !activeRoomCode) {
      setRoom(null);
      setMessages([]);
      setMatches([]);
      return;
    }

    const code = activeRoomCode;
    const roomPath = `rooms/${code}`;
    const roomRef = doc(db, 'rooms', code);

    let migratedRoomOnce = false;
    const unsubRoom = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          setRoom(null);
          setActiveRoomCode(null);
          try {
            localStorage.removeItem(LAST_ROOM_KEY);
          } catch {}
          return;
        }
        const rawData = snap.data() as Record<string, unknown>;
        const r = normalizeRoomDoc(rawData);
        if (r.hostUid !== user.uid && r.guestUid !== user.uid) {
          setRoom(null);
          return;
        }
        setRoom(r);

        if (!migratedRoomOnce && !snap.metadata.hasPendingWrites && hasLegacyRoomFields(rawData)) {
          migratedRoomOnce = true;
          updateDoc(roomRef, {
            ...buildLegacyMigrationPatch(r),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, roomPath)
    );

    const msgPath = `rooms/${code}/messages`;
    const msgQ = query(
      collection(db, 'rooms', code, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(120)
    );
    const unsubMsgs = onSnapshot(
      msgQ,
      (snap) => {
        const list: RoomMessageDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as {
            id: string;
            senderUid: string;
            senderName: string;
            senderSide?: PlayerId | 'guest';
            senderPersona?: string;
            msgType?: 'text' | 'voice';
            text: string;
            audioData?: string;
            audioDurationSec?: number;
            createdAt?: Timestamp;
          };
          const side: PlayerId | 'guest' =
            data.senderSide === 'p1' || data.senderSide === 'p2'
              ? data.senderSide
              : data.senderPersona === 'hanan'
                ? 'p1'
                : data.senderPersona === 'rehan'
                  ? 'p2'
                  : 'guest';
          list.push({
            id: data.id,
            senderUid: data.senderUid,
            senderName: data.senderName,
            senderSide: side,
            msgType: data.msgType === 'voice' ? 'voice' : 'text',
            text: data.text,
            audioData: typeof data.audioData === 'string' ? data.audioData : undefined,
            audioDurationSec:
              typeof data.audioDurationSec === 'number' ? data.audioDurationSec : undefined,
            createdAtMs: data.createdAt ? data.createdAt.toMillis() : Date.now(),
          });
        });
        setMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, msgPath)
    );

    const matchPath = `rooms/${code}/matches`;
    const matchQ = query(
      collection(db, 'rooms', code, 'matches'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubMatches = onSnapshot(
      matchQ,
      (snap) => {
        const list: RoomMatchDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as {
            id: string;
            gameId: GameId;
            gameName: string;
            winner: string;
            scoreLabel: string;
            summary: string;
            durationSeconds: number;
            recordedByUid: string;
            createdAt?: Timestamp;
          };
          const validWinner: RoomMatchDoc['winner'] =
            data.winner === 'p1' || data.winner === 'hanan'
              ? 'p1'
              : data.winner === 'p2' || data.winner === 'rehan'
                ? 'p2'
                : 'draw';
          list.push({
            id: data.id,
            gameId: data.gameId,
            gameName: data.gameName,
            winner: validWinner,
            scoreLabel: data.scoreLabel,
            summary: data.summary,
            durationSeconds: data.durationSeconds,
            recordedByUid: data.recordedByUid,
            createdAtMs: data.createdAt ? data.createdAt.toMillis() : Date.now(),
          });
        });
        setMatches(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, matchPath)
    );

    return () => {
      unsubRoom();
      unsubMsgs();
      unsubMatches();
    };
  }, [authReady, user, activeRoomCode]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      sound.playSwap();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      setAuthError(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    sound.playClick();
    setActiveRoomCode(null);
    try {
      localStorage.removeItem(LAST_ROOM_KEY);
    } catch {}
    await signOut(auth);
  }, []);

  const updateAccount = useCallback(
    async (
      patch: Partial<Omit<UserAccountDoc, 'uid'>>
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!user || !account) return { ok: false, error: 'Not signed in' };
      const path = `users/${user.uid}`;
      const nextDisplayName = (patch.displayName ?? account.displayName).trim().slice(0, 40);
      const nextColor = patch.accentColor ?? account.accentColor;
      const nextEmblem = normalizeEmblem(patch.emblem ?? account.emblem);
      const nextPhoto = (patch.photoUrl ?? account.photoUrl ?? '').slice(0, 65000);
      const nextTaunt = (patch.winTaunt ?? account.winTaunt).trim().slice(0, 60);

      let nextUsername = account.username;
      if (patch.username !== undefined) {
        const cleaned = patch.username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(cleaned)) {
          return {
            ok: false,
            error: 'Username must be 3–24 characters using lowercase letters, numbers, or _',
          };
        }
        nextUsername = cleaned;
      }

      try {
        // Check & claim new handle if changed
        if (nextUsername !== account.username) {
          const newHandleRef = doc(db, 'handles', nextUsername);
          const existingHandle = await getDoc(newHandleRef);
          if (existingHandle.exists() && existingHandle.data()?.uid !== user.uid) {
            return { ok: false, error: `Username @${nextUsername} is already taken.` };
          }
          await setDoc(newHandleRef, {
            handle: nextUsername,
            uid: user.uid,
            displayName: nextDisplayName,
            accentColor: nextColor,
            emblem: nextEmblem,
            photoUrl: nextPhoto,
            updatedAt: serverTimestamp(),
          });
          // Delete old handle
          if (account.username) {
            try {
              await deleteDoc(doc(db, 'handles', account.username));
            } catch {}
          }
        } else {
          await setDoc(doc(db, 'handles', nextUsername), {
            handle: nextUsername,
            uid: user.uid,
            displayName: nextDisplayName,
            accentColor: nextColor,
            emblem: nextEmblem,
            photoUrl: nextPhoto,
            updatedAt: serverTimestamp(),
          });
        }

        await updateDoc(doc(db, 'users', user.uid), {
          displayName: nextDisplayName,
          username: nextUsername,
          accentColor: nextColor,
          emblem: nextEmblem,
          photoUrl: nextPhoto,
          winTaunt: nextTaunt,
          updatedAt: serverTimestamp(),
        });

        // Also update room display name & photo if currently in a room
        if (room) {
          const roomUpdates: Record<string, unknown> = {
            ...buildLegacyMigrationPatch(room),
          };
          if (room.p1Uid === user.uid) {
            roomUpdates.p1Name = nextDisplayName;
            roomUpdates.p1Photo = nextPhoto;
          }
          if (room.p2Uid === user.uid) {
            roomUpdates.p2Name = nextDisplayName;
            roomUpdates.p2Photo = nextPhoto;
          }
          if (room.p1Uid === user.uid || room.p2Uid === user.uid) {
            roomUpdates.updatedAt = serverTimestamp();
            await updateDoc(doc(db, 'rooms', room.roomCode), roomUpdates);
          }
        }

        return { ok: true };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [account, room, user]
  );

  const createRoom = useCallback(async (): Promise<string | null> => {
    if (!user || !account) return null;
    setRoomError(null);
    const code = generateRoomCode();
    const path = `rooms/${code}`;
    const displayName = account.displayName || user.displayName || 'Player 1';
    const myPhoto = (account.photoUrl ?? '').slice(0, 65000);

    const newRoom: ArcadeRoomDoc = {
      roomCode: code,
      hostUid: user.uid,
      guestUid: '',
      p1Uid: user.uid,
      p1Name: displayName,
      p1Photo: myPhoto,
      p2Uid: '',
      p2Name: '',
      p2Photo: '',
      activeGame: 'lobby',
      matchSeed: 1,
      p1Wins: 0,
      p2Wins: 0,
      draws: 0,
      status: 'open',
    };

    try {
      await setDoc(doc(db, 'rooms', code), {
        ...newRoom,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveRoomCode(code);
      try {
        localStorage.setItem(LAST_ROOM_KEY, code);
      } catch {}
      sound.playPowerUp();
      return code;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  }, [account, user]);

  const joinRoom = useCallback(
    async (rawCode: string): Promise<boolean> => {
      if (!user || !account) return false;
      setRoomError(null);
      const code = rawCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        setRoomError('Enter a valid 6-character room code.');
        return false;
      }

      const roomRef = doc(db, 'rooms', code);

      try {
        const snap = await getDoc(roomRef);
        if (!snap.exists()) {
          setRoomError(`Room "${code}" not found. Check the code and try again.`);
          return false;
        }
        const rawData = snap.data() as Record<string, unknown>;
        const r = normalizeRoomDoc(rawData);
        const legacy = hasLegacyRoomFields(rawData);

        if (r.hostUid === user.uid || r.guestUid === user.uid) {
          if (legacy) {
            await updateDoc(roomRef, {
              ...buildLegacyMigrationPatch(r),
              updatedAt: serverTimestamp(),
            });
          }
          setActiveRoomCode(code);
          try {
            localStorage.setItem(LAST_ROOM_KEY, code);
          } catch {}
          sound.playSwap();
          return true;
        }

        if (r.guestUid !== '') {
          setRoomError(`Room "${code}" already has 2 players.`);
          return false;
        }

        const myName = account.displayName || user.displayName || 'Player 2';
        const myPhoto = (account.photoUrl ?? '').slice(0, 65000);
        const updates: Record<string, unknown> = {
          ...(legacy ? buildLegacyMigrationPatch(r) : {}),
          guestUid: user.uid,
          updatedAt: serverTimestamp(),
        };
        if (r.p1Uid === '') {
          updates.p1Uid = user.uid;
          updates.p1Name = myName;
          updates.p1Photo = myPhoto;
        } else if (r.p2Uid === '') {
          updates.p2Uid = user.uid;
          updates.p2Name = myName;
          updates.p2Photo = myPhoto;
        }

        await updateDoc(roomRef, updates);
        setActiveRoomCode(code);
        try {
          localStorage.setItem(LAST_ROOM_KEY, code);
        } catch {}
        sound.playPowerUp();
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not join room.';
        setRoomError(msg);
        return false;
      }
    },
    [account, user]
  );

  const leaveRoom = useCallback(async () => {
    if (!user || !room) {
      setActiveRoomCode(null);
      return;
    }
    const code = room.roomCode;
    const path = `rooms/${code}`;
    try {
      if (room.guestUid === user.uid) {
        const updates: Record<string, unknown> = {
          guestUid: '',
          updatedAt: serverTimestamp(),
        };
        if (room.p1Uid === user.uid) {
          updates.p1Uid = '';
          updates.p1Name = '';
          updates.p1Photo = '';
        }
        if (room.p2Uid === user.uid) {
          updates.p2Uid = '';
          updates.p2Name = '';
          updates.p2Photo = '';
        }
        await updateDoc(doc(db, 'rooms', code), updates);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setActiveRoomCode(null);
      setRoom(null);
      try {
        localStorage.removeItem(LAST_ROOM_KEY);
      } catch {}
    }
  }, [room, user]);

  const deleteRoom = useCallback(
    async (code: string) => {
      if (!user) return;
      const path = `rooms/${code}`;
      try {
        await deleteDoc(doc(db, 'rooms', code));
        if (activeRoomCode === code) {
          setActiveRoomCode(null);
          setRoom(null);
          try {
            localStorage.removeItem(LAST_ROOM_KEY);
          } catch {}
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [activeRoomCode, user]
  );

  const claimSide = useCallback(
    async (side: PlayerId) => {
      if (!user || !account || !room) return;
      const myName = account.displayName || user.displayName || 'Player';
      const myPhoto = (account.photoUrl ?? '').slice(0, 65000);
      const updates: Record<string, unknown> = {
        ...buildLegacyMigrationPatch(room),
        updatedAt: serverTimestamp(),
      };

      if (side === 'p1') {
        if (room.p1Uid !== '' && room.p1Uid !== user.uid) return;
        updates.p1Uid = user.uid;
        updates.p1Name = myName;
        updates.p1Photo = myPhoto;
        if (room.p2Uid === user.uid) {
          updates.p2Uid = '';
          updates.p2Name = '';
          updates.p2Photo = '';
        }
      } else {
        if (room.p2Uid !== '' && room.p2Uid !== user.uid) return;
        updates.p2Uid = user.uid;
        updates.p2Name = myName;
        updates.p2Photo = myPhoto;
        if (room.p1Uid === user.uid) {
          updates.p1Uid = '';
          updates.p1Name = '';
          updates.p1Photo = '';
        }
      }

      try {
        sound.playSwap();
        await updateDoc(doc(db, 'rooms', room.roomCode), updates);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not claim side.';
        setRoomError(msg);
      }
    },
    [account, room, user]
  );

  const swapSidesInRoom = useCallback(async () => {
    if (!user || !room) return;
    try {
      sound.playSwap();
      await updateDoc(doc(db, 'rooms', room.roomCode), {
        ...buildLegacyMigrationPatch(room),
        p1Uid: room.p2Uid,
        p1Name: room.p2Name,
        p1Photo: room.p2Photo ?? '',
        p2Uid: room.p1Uid,
        p2Name: room.p1Name,
        p2Photo: room.p1Photo ?? '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not swap sides.';
      setRoomError(msg);
    }
  }, [room, user]);

  const launchRoomGame = useCallback(
    async (gameId: GameId) => {
      if (!user || !room) return;
      setRoomError(null);
      try {
        sound.playClick();
        await updateDoc(doc(db, 'rooms', room.roomCode), {
          ...buildLegacyMigrationPatch(room),
          activeGame: gameId,
          status: 'playing',
          matchSeed: room.matchSeed + 1,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not start game.';
        setRoomError(msg);
      }
    },
    [room, user]
  );

  const restartRoomGame = useCallback(async () => {
    if (!user || !room) return;
    setRoomError(null);
    try {
      sound.playClick();
      await updateDoc(doc(db, 'rooms', room.roomCode), {
        ...buildLegacyMigrationPatch(room),
        matchSeed: room.matchSeed + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not restart game.';
      setRoomError(msg);
    }
  }, [room, user]);

  const exitRoomGameToLobby = useCallback(async () => {
    if (!user || !room) return;
    setRoomError(null);
    try {
      sound.playClick();
      await updateDoc(doc(db, 'rooms', room.roomCode), {
        ...buildLegacyMigrationPatch(room),
        activeGame: 'lobby',
        status: 'open',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not return to room.';
      setRoomError(msg);
    }
  }, [room, user]);

  // Friend Request Actions
  const sendFriendRequest = useCallback(
    async (rawUsername: string): Promise<{ ok: boolean; message: string }> => {
      if (!user || !account) return { ok: false, message: 'Sign in first.' };
      const clean = rawUsername.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]{3,24}$/.test(clean)) {
        return {
          ok: false,
          message: 'Enter a valid username (3–24 chars: letters, numbers, or _).',
        };
      }
      if (clean === account.username) {
        return { ok: false, message: 'You cannot add yourself as a friend.' };
      }

      try {
        const handleSnap = await getDoc(doc(db, 'handles', clean));
        if (!handleSnap.exists()) {
          return { ok: false, message: `No player found with username @${clean}.` };
        }
        const target = handleSnap.data() as {
          handle: string;
          uid: string;
          displayName: string;
          accentColor: string;
          emblem: AvatarEmblem;
          photoUrl?: string;
        };

        const reqId =
          user.uid < target.uid ? `${user.uid}_${target.uid}` : `${target.uid}_${user.uid}`;
        const reqRef = doc(db, 'friendRequests', reqId);
        const existingSnap = await getDoc(reqRef);

        if (existingSnap.exists()) {
          const ex = existingSnap.data() as { status: string; fromUid: string };
          if (ex.status === 'accepted') {
            return { ok: false, message: `You and @${clean} are already friends!` };
          }
          if (ex.status === 'pending') {
            if (ex.fromUid === target.uid) {
              // Auto-accept mutual request!
              await updateDoc(reqRef, {
                status: 'accepted',
                toName: account.displayName,
                toUsername: account.username,
                toColor: account.accentColor,
                toEmblem: normalizeEmblem(account.emblem),
                toPhoto: (account.photoUrl ?? '').slice(0, 65000),
                updatedAt: serverTimestamp(),
              });
              sound.playPowerUp();
              return { ok: true, message: `Accepted ${target.displayName}'s pending request!` };
            }
            return { ok: false, message: `Friend request to @${clean} is already pending.` };
          }
          // Declined previously: delete old doc so a fresh request can be sent
          await deleteDoc(reqRef);
        }

        await setDoc(reqRef, {
          id: reqId,
          fromUid: user.uid,
          fromUsername: account.username,
          fromName: account.displayName,
          fromColor: account.accentColor,
          fromEmblem: normalizeEmblem(account.emblem),
          fromPhoto: (account.photoUrl ?? '').slice(0, 65000),
          toUid: target.uid,
          toUsername: target.handle,
          toName: target.displayName,
          toColor: target.accentColor,
          toEmblem: normalizeEmblem(target.emblem, 'rocket'),
          toPhoto: (target.photoUrl ?? '').slice(0, 65000),
          status: 'pending',
          inviteRoomCode: '',
          invitedByUid: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        sound.playPowerUp();
        return { ok: true, message: `Friend request sent to ${target.displayName} (@${target.handle})!` };
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `friendRequests | handles/${clean}`);
      }
    },
    [account, user]
  );

  const respondFriendRequest = useCallback(
    async (reqId: string, accept: boolean) => {
      if (!user || !account) return;
      const path = `friendRequests/${reqId}`;
      try {
        await updateDoc(doc(db, 'friendRequests', reqId), {
          status: accept ? 'accepted' : 'declined',
          toName: account.displayName,
          toUsername: account.username,
          toColor: account.accentColor,
          toEmblem: normalizeEmblem(account.emblem),
          toPhoto: (account.photoUrl ?? '').slice(0, 65000),
          updatedAt: serverTimestamp(),
        });
        if (accept) sound.playPowerUp();
        else sound.playClick();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [account, user]
  );

  const removeFriendOrRequest = useCallback(
    async (reqId: string) => {
      if (!user) return;
      const path = `friendRequests/${reqId}`;
      try {
        sound.playClick();
        await deleteDoc(doc(db, 'friendRequests', reqId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const inviteFriendToRoom = useCallback(
    async (reqId: string, roomCode: string) => {
      if (!user) return;
      const path = `friendRequests/${reqId}`;
      try {
        sound.playSwap();
        await updateDoc(doc(db, 'friendRequests', reqId), {
          inviteRoomCode: roomCode,
          invitedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const clearRoomInvite = useCallback(
    async (reqId: string) => {
      if (!user) return;
      const path = `friendRequests/${reqId}`;
      try {
        await updateDoc(doc(db, 'friendRequests', reqId), {
          inviteRoomCode: '',
          invitedByUid: '',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const friends = useMemo(
    () => friendRelations.filter((r) => r.status === 'accepted'),
    [friendRelations]
  );
  const incomingRequests = useMemo(
    () => friendRelations.filter((r) => r.status === 'pending' && r.toUid === user?.uid),
    [friendRelations, user?.uid]
  );
  const outgoingRequests = useMemo(
    () => friendRelations.filter((r) => r.status === 'pending' && r.fromUid === user?.uid),
    [friendRelations, user?.uid]
  );
  const roomInvites = useMemo(
    () =>
      friendRelations.filter(
        (r) =>
          r.status === 'accepted' &&
          r.inviteRoomCode !== '' &&
          r.invitedByUid !== '' &&
          r.invitedByUid !== user?.uid
      ),
    [friendRelations, user?.uid]
  );

  const mySide: PlayerId | null = useMemo(() => {
    if (!user || !room) return null;
    if (room.p1Uid === user.uid) return 'p1';
    if (room.p2Uid === user.uid) return 'p2';
    return null;
  }, [room, user]);

  const sendChatMessage = useCallback(
    async (rawText: string) => {
      if (!user || !account || !room) return;
      const text = rawText.trim().slice(0, 400);
      if (!text) return;
      const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `rooms/${room.roomCode}/messages/${msgId}`;
      try {
        await setDoc(doc(db, 'rooms', room.roomCode, 'messages', msgId), {
          id: msgId,
          senderUid: user.uid,
          senderName: (account.displayName || 'Player').slice(0, 40),
          senderSide: mySide ?? 'guest',
          msgType: 'text',
          text,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [account, mySide, room, user]
  );

  const sendVoiceMessage = useCallback(
    async (audioData: string, durationSec: number) => {
      if (!user || !account || !room) return;
      if (!audioData.startsWith('data:audio/') || audioData.length > 180000) return;
      const clampedDuration = Math.max(1, Math.min(30, Math.round(durationSec)));
      const msgId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const path = `rooms/${room.roomCode}/messages/${msgId}`;
      try {
        await setDoc(doc(db, 'rooms', room.roomCode, 'messages', msgId), {
          id: msgId,
          senderUid: user.uid,
          senderName: (account.displayName || 'Player').slice(0, 40),
          senderSide: mySide ?? 'guest',
          msgType: 'voice',
          text: 'Voice message',
          audioData,
          audioDurationSec: clampedDuration,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [account, mySide, room, user]
  );

  const recordRoomMatch = useCallback(
    async (gameId: GameId, gameName: string, payload: MatchResultPayload) => {
      if (!user || !room) return;
      const matchId = `m-${room.matchSeed}-${gameId}`;
      const matchPath = `rooms/${room.roomCode}/matches/${matchId}`;
      const roomPath = `rooms/${room.roomCode}`;

      try {
        const existingSnap = await getDoc(doc(db, 'rooms', room.roomCode, 'matches', matchId));
        if (existingSnap.exists()) return;

        await setDoc(doc(db, 'rooms', room.roomCode, 'matches', matchId), {
          id: matchId,
          gameId,
          gameName: gameName.slice(0, 40),
          winner: payload.winner,
          scoreLabel: payload.scoreLabel.slice(0, 80),
          summary: payload.summary.slice(0, 200),
          durationSeconds: Math.max(0, Math.round(payload.durationSeconds)),
          recordedByUid: user.uid,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'rooms', room.roomCode), {
          p1Wins: room.p1Wins + (payload.winner === 'p1' ? 1 : 0),
          p2Wins: room.p2Wins + (payload.winner === 'p2' ? 1 : 0),
          draws: room.draws + (payload.winner === 'draw' ? 1 : 0),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${matchPath} | ${roomPath}`);
      }
    },
    [room, user]
  );

  const p1: PlayerProfile = useMemo(() => {
    const base = { ...DEFAULT_PROFILES.p1 };
    if (room?.p1Name) {
      base.name = room.p1Name;
      base.winTaunt = `${room.p1Name} wins!`;
    }
    if (room?.p1Photo) {
      base.photoUrl = room.p1Photo;
    }
    if (mySide === 'p1' && account) {
      base.name = account.displayName;
      base.accentColor = account.accentColor || base.accentColor;
      base.emblem = normalizeEmblem(account.emblem, base.emblem);
      base.photoUrl = account.photoUrl ?? base.photoUrl;
      if (account.winTaunt) base.winTaunt = account.winTaunt;
    } else if (!room && account) {
      base.name = account.displayName;
      base.accentColor = account.accentColor || base.accentColor;
      base.emblem = normalizeEmblem(account.emblem, base.emblem);
      base.photoUrl = account.photoUrl ?? '';
    }
    return base;
  }, [account, mySide, room]);

  const p2: PlayerProfile = useMemo(() => {
    const base = { ...DEFAULT_PROFILES.p2 };
    if (room?.p2Name) {
      base.name = room.p2Name;
      base.winTaunt = `${room.p2Name} wins!`;
    }
    if (room?.p2Photo) {
      base.photoUrl = room.p2Photo;
    }
    if (mySide === 'p2' && account) {
      base.name = account.displayName;
      base.accentColor = account.accentColor || base.accentColor;
      base.emblem = normalizeEmblem(account.emblem, base.emblem);
      base.photoUrl = account.photoUrl ?? base.photoUrl;
      if (account.winTaunt) base.winTaunt = account.winTaunt;
    }
    return base;
  }, [account, mySide, room?.p2Name, room?.p2Photo]);

  const onlineContext: OnlineContextInfo | null = useMemo(() => {
    if (!user || !room) return null;
    return {
      roomCode: room.roomCode,
      myUid: user.uid,
      mySide,
      isHost: room.hostUid === user.uid,
      opponentJoined: Boolean(room.p1Uid && room.p2Uid),
      p1Uid: room.p1Uid,
      p2Uid: room.p2Uid,
    };
  }, [mySide, room, user]);

  const value: ArcadeContextValue = {
    authReady,
    user,
    account,
    authError,
    signInWithGoogle,
    logout,
    updateAccount,
    myRooms,
    room,
    roomError,
    clearRoomError: () => setRoomError(null),
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    claimSide,
    swapSidesInRoom,
    launchRoomGame,
    restartRoomGame,
    exitRoomGameToLobby,
    friends,
    incomingRequests,
    outgoingRequests,
    roomInvites,
    sendFriendRequest,
    respondFriendRequest,
    removeFriendOrRequest,
    inviteFriendToRoom,
    clearRoomInvite,
    messages,
    sendChatMessage,
    sendVoiceMessage,
    matches,
    recordRoomMatch,
    p1,
    p2,
    mySide,
    onlineContext,
    audio,
    setAudio,
  };

  return <ArcadeContext.Provider value={value}>{children}</ArcadeContext.Provider>;
};

export const useArcade = () => {
  const ctx = useContext(ArcadeContext);
  if (!ctx) throw new Error('useArcade must be used within ArcadeProvider');
  return ctx;
};
