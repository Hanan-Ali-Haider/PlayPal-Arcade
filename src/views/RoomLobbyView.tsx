import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  DoorOpen,
  Gamepad2,
  LogIn,
  Play,
  Plus,
  Shuffle,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ArcadeLogo } from '../components/ArcadeLogo';
import { GameArtwork } from '../components/GameArtwork';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RoomChat } from '../components/RoomChat';
import { GAME_REGISTRY } from '../games/registry';
import { useArcade } from '../state/arcadeStore';
import { sound } from '../utils/sound';

interface RoomLobbyViewProps {
  onOpenFriends?: () => void;
}

export const RoomLobbyView: React.FC<RoomLobbyViewProps> = ({
  onOpenFriends,
}) => {
  const {
    user,
    account,
    authError,
    signInWithGoogle,
    myRooms,
    room,
    roomError,
    clearRoomError,
    createRoom,
    joinRoom,
    leaveRoom,
    deleteRoom,
    claimSide,
    swapSidesInRoom,
    launchRoomGame,
    friends,
    roomInvites,
    inviteFriendToRoom,
    clearRoomInvite,
    p1,
    p2,
    mySide,
  } = useArcade();

  const [joinCode, setJoinCode] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [inviteToast, setInviteToast] = useState<string | null>(null);

  // 1. Clean Direct 1v1 Arcade Sign-In Screen (Zero marketing clutter)
  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-2xl border-2 border-black bg-white p-6 neo-shadow-xl sm:p-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-4 sm:items-center">
              <ArcadeLogo size="lg" />
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-[#ffe17c] px-2.5 py-0.5 text-[11px] font-extrabold text-black">
                  <Gamepad2 className="h-3.5 w-3.5" />
                  1V1 ONLINE GAMES
                </span>
                <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-black sm:text-5xl">
                  PlayPal Arcade
                </h1>
                <p className="mt-1.5 max-w-xl text-sm font-medium text-black/75">
                  Sign in with Google, pick your @username in Settings, add friends, and hop into a room to play 6 fast 1v1 games on phone or PC.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                signInWithGoogle();
              }}
              className="neo-btn-lg inline-flex shrink-0 items-center gap-2.5 bg-black px-6 py-3.5 text-sm font-bold text-white cursor-pointer"
            >
              <LogIn className="h-4 w-4 text-[#ffe17c]" />
              Sign In with Google
            </button>
          </div>

          {authError && (
            <div className="mt-4 rounded-xl border-2 border-black bg-[#ffe17c] px-4 py-2.5 text-xs font-bold text-black">
              {authError}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-black">
              Pick a Game &amp; Play
            </h2>
            <span className="rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black">
              6 Games · Mobile &amp; PC
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_REGISTRY.map(({ meta }) => (
              <motion.article
                key={meta.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.14 }}
                onClick={() => {
                  sound.playClick();
                  signInWithGoogle();
                }}
                className="group flex flex-col justify-between rounded-2xl border-2 border-black bg-white p-4 neo-shadow-sm cursor-pointer hover:bg-[#ffe17c]/30"
              >
                <div>
                  <GameArtwork gameId={meta.id} />

                  <div className="mt-3.5 flex items-center justify-between text-[11px] font-bold">
                    <span className="rounded-md border border-black bg-[#b7c6c2] px-2 py-0.5 text-black">
                      {meta.genre}
                    </span>
                    <span className="tabular-nums text-black/65">{meta.durationHint}</span>
                  </div>

                  <h3 className="mt-2.5 font-display text-xl font-extrabold tracking-tight text-black">
                    {meta.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-black/75">{meta.subtitle}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t-2 border-black pt-3 text-xs font-bold text-black">
                  <span className="inline-flex items-center gap-1.5 text-black/70">
                    <Users className="h-3.5 w-3.5" />
                    {meta.playStyle}
                  </span>
                  <span className="inline-flex items-center gap-1 font-extrabold text-black group-hover:underline">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Sign in to Play
                  </span>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // 2. Signed-In Create or Join Room Lobby
  if (!room) {
    const handleCreate = async () => {
      if (busyAction) return;
      setBusyAction('create');
      clearRoomError();
      try {
        await createRoom();
      } finally {
        setBusyAction(null);
      }
    };

    const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      if (busyAction || !joinCode.trim()) return;
      setBusyAction('join');
      try {
        await joinRoom(joinCode);
      } finally {
        setBusyAction(null);
      }
    };

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black neo-shadow-sm">
              WELCOME, {(account?.displayName ?? user.displayName ?? 'PLAYER').toUpperCase()} (@
              {account?.username ?? 'player'})
            </span>
            <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tighter text-black sm:text-5xl">
              Play Online Together
            </h1>
            <p className="mt-1.5 text-sm font-medium text-black/75">
              Start a room, invite an accepted friend, or enter a 6-character code.
            </p>
          </div>

          {onOpenFriends && (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onOpenFriends();
              }}
              className="neo-btn inline-flex items-center gap-2 bg-white px-4 py-2.5 text-xs font-bold text-black cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Manage Friends ({friends.length})
            </button>
          )}
        </div>

        {/* Pending Room Invites Strip */}
        {roomInvites.length > 0 && (
          <section className="rounded-2xl border-2 border-black bg-[#ffe17c] p-4 neo-shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-wider text-black">
              Friend Room Invites
            </p>
            <div className="mt-2.5 flex flex-wrap gap-3">
              {roomInvites.map((inv) => {
                const iAmFrom = inv.fromUid === user.uid;
                const inviterName = iAmFrom ? inv.toName : inv.fromName;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 rounded-xl border-2 border-black bg-white px-3.5 py-2"
                  >
                    <span className="text-xs font-bold text-black">
                      {inviterName} invited you to{' '}
                      <strong className="font-mono-num">{inv.inviteRoomCode}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearRoomInvite(inv.id);
                        await joinRoom(inv.inviteRoomCode);
                      }}
                      className="neo-btn bg-black px-3 py-1 text-xs font-bold text-[#ffe17c] cursor-pointer"
                    >
                      Join
                    </button>
                    <button
                      type="button"
                      onClick={() => clearRoomInvite(inv.id)}
                      aria-label="Dismiss invite"
                      className="text-black/60 hover:text-black cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {roomError && (
          <div className="rounded-xl border-2 border-black bg-white px-4 py-3 text-xs font-bold text-black neo-shadow-sm">
            {roomError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create Room Card */}
          <section className="flex flex-col justify-between rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg sm:p-7">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-black">
                Create a New Room
              </h2>
              <p className="mt-1.5 text-xs font-medium text-black/75">
                Open a private 2-player room under your name ({account?.displayName ?? 'Player'}). You start in Side 1 and can swap sides anytime.
              </p>

              <div className="mt-5 rounded-xl border-2 border-black bg-[#ffe17c] p-4 flex items-center gap-3.5">
                <PlayerAvatar profile={p1} size="md" />
                <div>
                  <p className="font-display text-base font-extrabold text-black">
                    {account?.displayName ?? user.displayName ?? 'Player'}
                  </p>
                  <p className="text-xs font-bold text-black/70">
                    @{account?.username ?? 'player'} · Host (Side 1)
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={busyAction === 'create'}
              className="neo-btn mt-6 inline-flex w-full items-center justify-center gap-2 bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50 cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#ffe17c]" />
              {busyAction === 'create' ? 'Creating Room...' : 'Create Room'}
            </button>
          </section>

          {/* Join Room Card */}
          <section className="flex flex-col justify-between rounded-2xl border-2 border-black bg-[#b7c6c2] p-6 neo-shadow-lg sm:p-7">
            <div>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-black">
                Join with a Code
              </h2>
              <p className="mt-1 text-xs font-medium text-black/75">
                Enter the 6-character code from your friend to connect to their room.
              </p>

              <form onSubmit={handleJoin} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="room-code-input" className="block text-xs font-bold text-black">
                    Room Code
                  </label>
                  <input
                    id="room-code-input"
                    type="text"
                    value={joinCode}
                    maxLength={6}
                    onChange={(e) => {
                      clearRoomError();
                      setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                    }}
                    placeholder="e.g. PP8K42"
                    className="mt-1.5 w-full rounded-xl border-2 border-black bg-white px-4 py-3 font-mono-num text-lg font-extrabold tracking-[0.25em] text-black placeholder:tracking-normal placeholder:text-sm placeholder:font-medium placeholder:text-black/40 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={joinCode.trim().length !== 6 || busyAction === 'join'}
                  className="neo-btn inline-flex w-full items-center justify-center gap-2 bg-[#ffe17c] px-5 py-3 text-sm font-bold text-black disabled:opacity-45 cursor-pointer"
                >
                  <DoorOpen className="h-4 w-4" />
                  {busyAction === 'join' ? 'Joining...' : 'Join Room'}
                </button>
              </form>
            </div>

            <p className="mt-5 text-xs font-bold text-black/75">
              You automatically take the open seat and can switch sides anytime.
            </p>
          </section>
        </div>

        {/* Active Rooms List */}
        {myRooms.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-xl font-extrabold text-black">Your Rooms</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myRooms.map((r) => (
                <div
                  key={r.roomCode}
                  className="flex items-center justify-between rounded-xl border-2 border-black bg-white p-4 neo-shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="font-mono-num text-base font-extrabold tracking-wider text-black">
                      {r.roomCode}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-black/70">
                      {r.p1Name || 'Open'} vs {r.p2Name || 'Open'}{' '}
                      <span aria-hidden="true">·</span>{' '}
                      <span className="tabular-nums font-bold text-black">
                        {r.p1Wins}:{r.p2Wins}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => joinRoom(r.roomCode)}
                      className="neo-btn bg-[#ffe17c] px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                    >
                      Enter
                    </button>
                    {r.hostUid === user.uid && (
                      <button
                        type="button"
                        onClick={() => deleteRoom(r.roomCode)}
                        aria-label={`Delete room ${r.roomCode}`}
                        className="rounded-lg border-2 border-black bg-[#f4f4f5] p-1.5 text-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // 3. Active Room: Side Picker + Friend Invite + 6-Game Launcher + Live Chat
  const p1TakenByOther = Boolean(room.p1Uid && room.p1Uid !== user.uid);
  const p2TakenByOther = Boolean(room.p2Uid && room.p2Uid !== user.uid);
  const bothSeated = Boolean(room.p1Uid && room.p2Uid);

  const handleCopyCode = async () => {
    sound.playClick();
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {}
  };

  const handleRandomGame = () => {
    sound.playClick();
    const pick = GAME_REGISTRY[Math.floor(Math.random() * GAME_REGISTRY.length)];
    launchRoomGame(pick.meta.id);
  };

  const handleQuickInvite = async (reqId: string, name: string) => {
    sound.playPowerUp();
    await inviteFriendToRoom(reqId, room.roomCode);
    setInviteToast(`Invite sent to ${name}!`);
    setTimeout(() => setInviteToast(null), 2200);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {roomError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#ffe17c] px-4 py-3 text-xs font-bold text-black neo-shadow-sm">
          <span>{roomError}</span>
          <button
            type="button"
            onClick={clearRoomError}
            aria-label="Dismiss error"
            className="text-black hover:opacity-70 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Room Header & Side Picker */}
      <section className="rounded-2xl border-2 border-black bg-white p-4 neo-shadow-lg sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-black/65">
              Room Code <span aria-hidden="true">·</span>{' '}
              {bothSeated ? 'Both players connected' : 'Share this code or invite a friend'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="font-mono-num text-3xl font-extrabold tracking-[0.2em] text-black sm:text-4xl">
                {room.roomCode}
              </h1>
              <button
                type="button"
                onClick={handleCopyCode}
                className="neo-btn inline-flex items-center gap-1.5 bg-[#ffe17c] px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
              >
                {copiedCode ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Code
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border-2 border-black bg-[#171e19] px-4 py-2 text-xs text-white">
              <Trophy className="h-3.5 w-3.5 text-[#ffe17c]" />
              <span className="max-w-[90px] truncate font-bold text-[#ffe17c]">{p1.name}</span>
              <span className="font-bold text-[#ffe17c] tabular-nums">{room.p1Wins}</span>
              <span className="text-[#b7c6c2] tabular-nums">:</span>
              <span className="font-bold text-[#b7c6c2] tabular-nums">{room.p2Wins}</span>
              <span className="max-w-[90px] truncate font-bold text-[#b7c6c2]">{p2.name}</span>
              {room.draws > 0 && (
                <span className="text-white/70 tabular-nums">({room.draws}D)</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                leaveRoom();
              }}
              className="neo-btn inline-flex items-center gap-1.5 bg-white px-3.5 py-2 text-xs font-bold text-black cursor-pointer"
            >
              <DoorOpen className="h-3.5 w-3.5" />
              Leave Room
            </button>
          </div>
        </div>

        {/* Quick Friend Invite Bar */}
        {friends.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border-2 border-black bg-[#f4f4f5] px-3.5 py-2.5">
            <span className="text-xs font-extrabold text-black mr-1">Invite Friend:</span>
            {friends.map((rel) => {
              const otherIsTo = rel.fromUid === user.uid;
              const otherName = otherIsTo ? rel.toName : rel.fromName;
              const otherHandle = otherIsTo ? rel.toUsername : rel.fromUsername;
              return (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => handleQuickInvite(rel.id, otherName)}
                  className="neo-btn bg-white px-3 py-1 text-xs font-bold text-black cursor-pointer"
                >
                  + {otherName} (@{otherHandle})
                </button>
              );
            })}
            {inviteToast && (
              <span className="ml-auto rounded border border-black bg-[#ffe17c] px-2.5 py-0.5 text-[11px] font-bold text-black">
                {inviteToast}
              </span>
            )}
          </div>
        )}

        {/* Side 1 vs Side 2 Picker */}
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          {/* Side 1 */}
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border-2 border-black p-4 transition-colors ${
              mySide === 'p1' ? 'bg-[#ffe17c] neo-shadow-sm' : 'bg-[#f4f4f5]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar profile={p1} size="md" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-extrabold text-black">
                  {room.p1Name || 'Side 1'} {mySide === 'p1' ? '(You)' : ''}
                </p>
                <p className="text-xs font-medium text-black/75">
                  Side 1 · White / Left / Car #1
                </p>
              </div>
            </div>

            {mySide === 'p1' ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-bold text-black">
                <UserCheck className="h-3.5 w-3.5" />
                Seated
              </span>
            ) : (
              <button
                type="button"
                disabled={p1TakenByOther}
                onClick={() => claimSide('p1')}
                className="neo-btn shrink-0 bg-black px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
              >
                {p1TakenByOther ? 'Taken' : 'Take Side 1'}
              </button>
            )}
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={swapSidesInRoom}
              title="Swap Side 1 and Side 2"
              className="neo-btn inline-flex items-center gap-1.5 bg-white px-3.5 py-2.5 text-xs font-bold text-black cursor-pointer"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Swap
            </button>
          </div>

          {/* Side 2 */}
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border-2 border-black p-4 transition-colors ${
              mySide === 'p2' ? 'bg-[#b7c6c2] neo-shadow-sm' : 'bg-[#f4f4f5]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar profile={p2} size="md" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-extrabold text-black">
                  {room.p2Name || 'Side 2'} {mySide === 'p2' ? '(You)' : ''}
                </p>
                <p className="text-xs font-medium text-black/75">
                  Side 2 · Black / Right / Car #2
                </p>
              </div>
            </div>

            {mySide === 'p2' ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-bold text-black">
                <UserCheck className="h-3.5 w-3.5" />
                Seated
              </span>
            ) : (
              <button
                type="button"
                disabled={p2TakenByOther}
                onClick={() => claimSide('p2')}
                className="neo-btn shrink-0 bg-black px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
              >
                {p2TakenByOther ? 'Taken' : 'Take Side 2'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Room Split: Game Launcher + Live Room Chat */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px] xl:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-black">
              Choose a Game (6)
            </h2>
            <button
              type="button"
              onClick={handleRandomGame}
              className="neo-btn inline-flex items-center gap-2 bg-[#ffe17c] px-4 py-2 text-xs font-bold text-black cursor-pointer"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Random Game
            </button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {GAME_REGISTRY.map(({ meta }) => (
              <motion.article
                key={meta.id}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.14 }}
                onClick={() => launchRoomGame(meta.id)}
                className="group flex flex-col justify-between rounded-2xl border-2 border-black bg-white p-4 neo-shadow-sm cursor-pointer hover:bg-[#ffe17c]/30"
              >
                <div>
                  <GameArtwork gameId={meta.id} />

                  <div className="mt-3.5 flex items-center justify-between text-[11px] font-bold">
                    <span className="rounded-md border border-black bg-[#b7c6c2] px-2 py-0.5 text-black">
                      {meta.genre}
                    </span>
                    <span className="tabular-nums text-black/65">{meta.durationHint}</span>
                  </div>

                  <h3 className="mt-2.5 font-display text-xl font-extrabold tracking-tight text-black">
                    {meta.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-black/75">{meta.subtitle}</p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t-2 border-black pt-3 text-xs font-bold text-black">
                  <span className="inline-flex items-center gap-1.5 text-black/70">
                    <Users className="h-3.5 w-3.5" />
                    {meta.playStyle}
                  </span>
                  <span className="inline-flex items-center gap-1 font-extrabold text-black group-hover:underline">
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Play
                  </span>
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        {/* Live Room Chat with Goofy Emojis */}
        <div className="h-[520px] xl:sticky xl:top-24">
          <RoomChat compact />
        </div>
      </div>
    </div>
  );
};
