import React, { useState } from 'react';
import {
  Check,
  Copy,
  DoorOpen,
  Gamepad2,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { useArcade } from '../state/arcadeStore';
import { PlayerProfile } from '../types/arcade';
import { sound } from '../utils/sound';

interface FriendsViewProps {
  onOpenRoomTab: () => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({ onOpenRoomTab }) => {
  const {
    user,
    account,
    room,
    friends,
    incomingRequests,
    outgoingRequests,
    roomInvites,
    sendFriendRequest,
    respondFriendRequest,
    removeFriendOrRequest,
    inviteFriendToRoom,
    clearRoomInvite,
    joinRoom,
    createRoom,
  } = useArcade();

  const [targetHandle, setTargetHandle] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedHandle, setCopiedHandle] = useState(false);

  if (!user || !account) return null;

  const handleCopyHandle = async () => {
    sound.playClick();
    try {
      await navigator.clipboard.writeText(`@${account.username}`);
      setCopiedHandle(true);
      setTimeout(() => setCopiedHandle(false), 1800);
    } catch {}
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHandle.trim() || busyId === 'add') return;
    setBusyId('add');
    setFeedback(null);
    sound.playClick();
    try {
      const res = await sendFriendRequest(targetHandle);
      setFeedback({ ok: res.ok, msg: res.message });
      if (res.ok) {
        sound.playPowerUp();
        setTargetHandle('');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleJoinInvite = async (reqId: string, roomCode: string) => {
    setBusyId(reqId);
    sound.playPowerUp();
    try {
      await clearRoomInvite(reqId);
      const ok = await joinRoom(roomCode);
      if (ok) onOpenRoomTab();
    } finally {
      setBusyId(null);
    }
  };

  const handleInviteFriend = async (reqId: string) => {
    setBusyId(reqId);
    sound.playPowerUp();
    try {
      let targetCode = room?.roomCode ?? null;
      if (!targetCode) {
        targetCode = await createRoom();
      }
      if (targetCode) {
        await inviteFriendToRoom(reqId, targetCode);
        setFeedback({ ok: true, msg: `Room invite for ${targetCode} sent!` });
        onOpenRoomTab();
      }
    } finally {
      setBusyId(null);
    }
  };

  const makeFriendProfile = (
    uid: string,
    name: string,
    color: string,
    emblem: PlayerProfile['emblem'],
    photoUrl?: string
  ): PlayerProfile => ({
    id: uid === room?.p2Uid ? 'p2' : 'p1',
    name,
    accentColor: color || '#FFE17C',
    secondaryColor: '#171E19',
    emblem: emblem || 'arcade',
    photoUrl: photoUrl || '',
    winTaunt: `${name} wins!`,
    leadTaunt: `${name} takes the lead!`,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-block rounded-lg border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black neo-shadow-sm">
            FRIENDS &amp; INVITES
          </span>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tighter text-black">
            Your Arcade Friends
          </h1>
          <p className="mt-1 text-sm font-medium text-black/75">
            Add players by their @username handle, accept requests, and send 1-click room invites.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopyHandle}
          className="neo-btn inline-flex items-center gap-2 bg-[#ffe17c] px-4 py-2.5 text-xs font-extrabold text-black cursor-pointer"
        >
          {copiedHandle ? (
            <>
              <Check className="h-4 w-4" />
              Copied @{account.username}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Your Handle: @{account.username}
            </>
          )}
        </button>
      </div>

      {/* Incoming Room Invites */}
      {roomInvites.length > 0 && (
        <section className="rounded-2xl border-2 border-black bg-[#ffe17c] p-5 neo-shadow-lg">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-black">
            <Gamepad2 className="h-4 w-4" />
            <span>Live Room Invites ({roomInvites.length})</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {roomInvites.map((inv) => {
              const iAmFrom = inv.fromUid === user.uid;
              const inviterName = iAmFrom ? inv.toName : inv.fromName;
              const inviterHandle = iAmFrom ? inv.toUsername : inv.fromUsername;
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3.5"
                >
                  <div>
                    <p className="font-display text-sm font-extrabold text-black">
                      {inviterName} (@{inviterHandle})
                    </p>
                    <p className="text-xs font-bold text-black/70">
                      Invited you to Room{' '}
                      <span className="font-mono-num text-black">{inv.inviteRoomCode}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === inv.id}
                      onClick={() => handleJoinInvite(inv.id, inv.inviteRoomCode)}
                      className="neo-btn inline-flex items-center gap-1.5 bg-black px-3.5 py-2 text-xs font-bold text-[#ffe17c] cursor-pointer"
                    >
                      <DoorOpen className="h-3.5 w-3.5" />
                      Join
                    </button>
                    <button
                      type="button"
                      onClick={() => clearRoomInvite(inv.id)}
                      aria-label="Dismiss invite"
                      className="neo-btn bg-[#f4f4f5] p-2 text-black cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Add Friend Form */}
      <section className="rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-black" />
          <h2 className="font-display text-xl font-extrabold text-black">
            Add Friend by Username
          </h2>
        </div>
        <p className="mt-1 text-xs font-medium text-black/70">
          Ask your friend for their @username (shown in their Top Bar or Account Settings).
        </p>

        <form onSubmit={handleAddFriend} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono-num text-sm font-extrabold text-black/50">
              @
            </span>
            <input
              type="text"
              value={targetHandle}
              maxLength={24}
              onChange={(e) =>
                setTargetHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              placeholder="username_here"
              className="w-full rounded-xl border-2 border-black bg-[#f4f4f5] py-3 pl-8 pr-4 font-mono-num text-sm font-bold text-black placeholder:text-black/40 focus:bg-white focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={targetHandle.trim().length < 3 || busyId === 'add'}
            className="neo-btn inline-flex items-center justify-center gap-2 bg-black px-6 py-3 text-xs font-bold text-[#ffe17c] disabled:opacity-45 cursor-pointer"
          >
            <Send className="h-4 w-4" />
            {busyId === 'add' ? 'Sending...' : 'Send Friend Request'}
          </button>
        </form>

        {feedback && (
          <div
            className={`mt-3 rounded-xl border-2 border-black px-4 py-2.5 text-xs font-bold text-black ${
              feedback.ok ? 'bg-[#b7c6c2]' : 'bg-[#ffe17c]'
            }`}
          >
            {feedback.msg}
          </div>
        )}
      </section>

      {/* Incoming & Outgoing Requests */}
      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border-2 border-black bg-[#b7c6c2] p-5 neo-shadow-sm">
            <h3 className="font-display text-lg font-extrabold text-black">
              Incoming Requests ({incomingRequests.length})
            </h3>
            {incomingRequests.length === 0 ? (
              <p className="mt-3 text-xs font-medium text-black/70">No pending requests.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {incomingRequests.map((req) => {
                  const prof = makeFriendProfile(
                    req.fromUid,
                    req.fromName,
                    req.fromColor,
                    req.fromEmblem,
                    req.fromPhoto
                  );
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-white p-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar profile={prof} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-extrabold text-black">
                            {req.fromName}
                          </p>
                          <p className="truncate text-[11px] font-bold text-black/60">
                            @{req.fromUsername}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playPowerUp();
                            respondFriendRequest(req.id, true);
                          }}
                          className="neo-btn bg-[#ffe17c] px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            respondFriendRequest(req.id, false);
                          }}
                          className="neo-btn bg-[#f4f4f5] px-2.5 py-1.5 text-xs font-bold text-black cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border-2 border-black bg-white p-5 neo-shadow-sm">
            <h3 className="font-display text-lg font-extrabold text-black">
              Sent Requests ({outgoingRequests.length})
            </h3>
            {outgoingRequests.length === 0 ? (
              <p className="mt-3 text-xs font-medium text-black/65">No outgoing requests.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {outgoingRequests.map((req) => {
                  const prof = makeFriendProfile(
                    req.toUid,
                    req.toName,
                    req.toColor,
                    req.toEmblem,
                    req.toPhoto
                  );
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] p-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar profile={prof} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-extrabold text-black">
                            {req.toName}
                          </p>
                          <p className="truncate text-[11px] font-bold text-black/60">
                            @{req.toUsername} · Pending
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFriendOrRequest(req.id)}
                        className="neo-btn bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Accepted Friends List */}
      <section className="rounded-2xl border-2 border-black bg-white p-6 neo-shadow-lg">
        <div className="flex items-center justify-between border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-black" />
            <h2 className="font-display text-xl font-extrabold text-black">
              Friends List ({friends.length})
            </h2>
          </div>
          {room && (
            <span className="rounded-lg border-2 border-black bg-[#ffe17c] px-2.5 py-1 text-[11px] font-extrabold text-black">
              Active Room: {room.roomCode}
            </span>
          )}
        </div>

        {friends.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-display text-base font-extrabold text-black">
              No friends added yet
            </p>
            <p className="mt-1 text-xs font-medium text-black/65">
              Send a friend request above using your friend&apos;s @username!
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {friends.map((rel) => {
              const otherIsTo = rel.fromUid === user.uid;
              const otherUid = otherIsTo ? rel.toUid : rel.fromUid;
              const otherName = otherIsTo ? rel.toName : rel.fromName;
              const otherHandle = otherIsTo ? rel.toUsername : rel.fromUsername;
              const otherColor = otherIsTo ? rel.toColor : rel.fromColor;
              const otherEmblem = otherIsTo ? rel.toEmblem : rel.fromEmblem;
              const otherPhoto = otherIsTo ? rel.toPhoto : rel.fromPhoto;
              const prof = makeFriendProfile(
                otherUid,
                otherName,
                otherColor,
                otherEmblem,
                otherPhoto
              );

              return (
                <div
                  key={rel.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] p-4"
                >
                  <div className="flex items-center gap-3">
                    <PlayerAvatar profile={prof} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-extrabold text-black">
                        {otherName}
                      </p>
                      <p className="truncate text-xs font-bold text-black/65">
                        @{otherHandle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === rel.id}
                      onClick={() => handleInviteFriend(rel.id)}
                      className="neo-btn flex-1 bg-[#ffe17c] px-3 py-2 text-xs font-bold text-black cursor-pointer"
                    >
                      {room ? `Invite to ${room.roomCode}` : 'Create & Invite'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFriendOrRequest(rel.id)}
                      aria-label={`Remove ${otherName}`}
                      className="rounded-lg border-2 border-black bg-white p-2 text-black hover:bg-black hover:text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
