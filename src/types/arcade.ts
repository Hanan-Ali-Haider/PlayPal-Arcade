export type PlayerId = 'p1' | 'p2';

export type GameId =
  | 'chess'
  | 'carrom'
  | 'headball'
  | 'football'
  | 'racing'
  | 'airhockey';

export type MatchWinner = PlayerId | 'draw';

export type AvatarEmblem = 'arcade' | 'rocket' | 'crown' | 'shield' | 'star' | 'swords';

export interface PlayerProfile {
  id: PlayerId;
  name: string;
  accentColor: string;
  secondaryColor: string;
  emblem: AvatarEmblem;
  photoUrl?: string;
  winTaunt: string;
  leadTaunt: string;
}

export interface UserAccountDoc {
  uid: string;
  displayName: string;
  username: string;
  accentColor: string;
  emblem: AvatarEmblem;
  photoUrl?: string;
  winTaunt: string;
}

export interface FriendRelationDoc {
  id: string;
  fromUid: string;
  fromUsername: string;
  fromName: string;
  fromColor: string;
  fromEmblem: AvatarEmblem;
  fromPhoto?: string;
  toUid: string;
  toUsername: string;
  toName: string;
  toColor: string;
  toEmblem: AvatarEmblem;
  toPhoto?: string;
  status: 'pending' | 'accepted' | 'declined';
  inviteRoomCode: string;
  invitedByUid: string;
  createdAtMs: number;
}

export interface ArcadeRoomDoc {
  roomCode: string;
  hostUid: string;
  guestUid: string;
  p1Uid: string;
  p1Name: string;
  p1Photo?: string;
  p2Uid: string;
  p2Name: string;
  p2Photo?: string;
  activeGame: GameId | 'lobby';
  matchSeed: number;
  p1Wins: number;
  p2Wins: number;
  draws: number;
  status: 'open' | 'playing';
}

export interface RoomMessageDoc {
  id: string;
  senderUid: string;
  senderName: string;
  senderSide: PlayerId | 'guest';
  msgType?: 'text' | 'voice';
  text: string;
  audioData?: string;
  audioDurationSec?: number;
  createdAtMs: number;
}

export interface RoomMatchDoc {
  id: string;
  gameId: GameId;
  gameName: string;
  winner: MatchWinner;
  scoreLabel: string;
  summary: string;
  durationSeconds: number;
  recordedByUid: string;
  createdAtMs: number;
}

export interface AudioSettings {
  muted: boolean;
  volume: number;
}

export interface MatchResultPayload {
  winner: MatchWinner;
  scoreLabel: string;
  summary: string;
  durationSeconds: number;
  p1Score?: number;
  p2Score?: number;
}

export interface OnlineContextInfo {
  roomCode: string;
  myUid: string;
  mySide: PlayerId | null;
  isHost: boolean;
  opponentJoined: boolean;
  p1Uid: string;
  p2Uid: string;
}

export interface GameComponentProps {
  p1: PlayerProfile; // Side 1 (Left / White)
  p2: PlayerProfile; // Side 2 (Right / Black)
  online: OnlineContextInfo;
  onMatchEnd: (result: MatchResultPayload) => void;
  matchSeed: number;
}

export interface GameMeta {
  id: GameId;
  name: string;
  subtitle: string;
  genre: string;
  playStyle: string;
  durationHint: string;
  controlsSummary: {
    p1Label: string;
    p1Controls: string[];
    p2Label: string;
    p2Controls: string[];
    rules: string[];
  };
}
