import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Handshake,
  HelpCircle,
  MessageCircle,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useArcade } from '../state/arcadeStore';
import { GameMeta, MatchResultPayload } from '../types/arcade';
import { sound } from '../utils/sound';
import { useDeviceMode } from '../utils/useDeviceMode';
import { CelebrationOverlay } from './CelebrationOverlay';
import { PlayerAvatar } from './PlayerAvatar';
import { RoomChat } from './RoomChat';

interface GameWrapperProps {
  meta: GameMeta;
  onExit: () => void;
  children: (props: {
    p1: ReturnType<typeof useArcade>['p1'];
    p2: ReturnType<typeof useArcade>['p2'];
    online: NonNullable<ReturnType<typeof useArcade>['onlineContext']>;
    onMatchEnd: (result: MatchResultPayload) => void;
    matchSeed: number;
  }) => React.ReactNode;
}

export const GameWrapper: React.FC<GameWrapperProps> = ({ meta, onExit, children }) => {
  const {
    p1,
    p2,
    room,
    onlineContext,
    audio,
    setAudio,
    recordRoomMatch,
    voteRematch,
    voteDraw,
    clearDrawVotes,
    messages,
  } = useArcade();

  const device = useDeviceMode();
  const matchSeed = room?.matchSeed ?? 1;
  const [showControls, setShowControls] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenMsgCount = useRef(messages.length);
  const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null);
  const recordedSeedRef = useRef<number>(0);
  const matchStartRef = useRef<number>(Date.now());

  useEffect(() => {
    setMatchResult(null);
    matchStartRef.current = Date.now();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [matchSeed, meta.id]);

  useEffect(() => {
    if (showChat) {
      lastSeenMsgCount.current = messages.length;
      setUnreadCount(0);
    } else if (messages.length > lastSeenMsgCount.current) {
      setUnreadCount((c) => c + (messages.length - lastSeenMsgCount.current));
      lastSeenMsgCount.current = messages.length;
    }
  }, [messages.length, showChat]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target?.closest('[data-chat-panel]') || target?.closest('[data-modal]')) return;

      if (
        e.code === 'Space' ||
        e.code === 'Enter' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
          document.activeElement.blur();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { passive: false, capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  const handleMatchEnd = useCallback(
    (result: MatchResultPayload) => {
      if (recordedSeedRef.current === matchSeed) return;
      recordedSeedRef.current = matchSeed;
      recordRoomMatch(meta.id, meta.name, result);
      if (result.winner === 'draw') {
        sound.playFoul();
      } else {
        sound.playVictory();
      }
      setMatchResult(result);
    },
    [matchSeed, meta.id, meta.name, recordRoomMatch]
  );

  // Trigger mutual Draw end when BOTH players voted Yes
  useEffect(() => {
    if (!room || !onlineContext?.opponentJoined) return;
    if (room.drawP1 === 'yes' && room.drawP2 === 'yes' && !matchResult) {
      clearDrawVotes();
      handleMatchEnd({
        winner: 'draw',
        scoreLabel: 'Mutual Draw (2/2 Yes)',
        summary: `Both ${p1.name} and ${p2.name} voted Yes to agree to a draw.`,
        durationSeconds: Math.round((Date.now() - matchStartRef.current) / 1000),
      });
    }
  }, [clearDrawVotes, handleMatchEnd, matchResult, onlineContext?.opponentJoined, p1.name, p2.name, room]);

  if (!onlineContext) return null;

  const amP2 = onlineContext.mySide === 'p2';
  const rematchP1 = room?.rematchP1 ?? '';
  const rematchP2 = room?.rematchP2 ?? '';
  const drawP1 = room?.drawP1 ?? '';
  const drawP2 = room?.drawP2 ?? '';

  const myRematchYes = amP2 ? rematchP2 === 'yes' : rematchP1 === 'yes';
  const otherRematchYes = amP2 ? rematchP1 === 'yes' : rematchP2 === 'yes';
  const rematchYesCount = (rematchP1 === 'yes' ? 1 : 0) + (rematchP2 === 'yes' ? 1 : 0);

  const myDrawYes = amP2 ? drawP2 === 'yes' : drawP1 === 'yes';
  const otherDrawYes = amP2 ? drawP1 === 'yes' : drawP2 === 'yes';
  const drawYesCount = (drawP1 === 'yes' ? 1 : 0) + (drawP2 === 'yes' ? 1 : 0);

  const otherName = amP2 ? p1.name : p2.name;

  return (
    <div
      className={`mx-auto flex w-full max-w-7xl flex-col ${
        device.isMobile ? 'gap-2.5 px-2.5 py-2.5' : 'gap-4 px-6 py-5'
      }`}
    >
      {/* Shared Neo-Brutalist Game Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-black bg-white neo-shadow-sm ${
          device.isMobile ? 'px-2.5 py-2' : 'px-4 py-3'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              onExit();
            }}
            className="neo-btn inline-flex items-center gap-1.5 bg-[#ffe17c] px-2.5 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{device.isCompact ? 'Room' : `Room ${onlineContext.roomCode}`}</span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-display text-sm font-extrabold tracking-tight leading-tight text-black sm:text-lg">
              {meta.name}
            </h1>
            {!device.isCompact && (
              <p className="text-[11px] text-black/65">
                {onlineContext.opponentJoined
                  ? `${device.isMobile ? 'Touch Mode' : 'PC Mode'} · Both connected`
                  : 'Waiting for your friend'}
              </p>
            )}
          </div>
        </div>

        {/* Side 1 vs Side 2 (PC / Tablet wide) */}
        {!device.isMobile && (
          <div className="hidden md:flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-2">
              <PlayerAvatar profile={p1} size="sm" />
              <div className="leading-tight">
                <span className="block text-[11px] font-medium text-black/60">
                  Side 1 {onlineContext.mySide === 'p1' ? '(You)' : ''}
                </span>
                <span className="text-black">{room?.p1Name || 'Open Seat'}</span>
              </div>
            </div>
            <span className="font-display text-sm font-extrabold text-black">VS</span>
            <div className="flex items-center gap-2">
              <div className="leading-tight text-right">
                <span className="block text-[11px] font-medium text-black/60">
                  Side 2 {onlineContext.mySide === 'p2' ? '(You)' : ''}
                </span>
                <span className="text-black">{room?.p2Name || 'Open Seat'}</span>
              </div>
              <PlayerAvatar profile={p2} size="sm" />
            </div>
          </div>
        )}

        {/* Utility Actions */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              setShowChat((s) => !s);
            }}
            className="neo-btn inline-flex items-center gap-1.5 bg-[#b7c6c2] px-2.5 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Chat</span>
            {unreadCount > 0 && (
              <span className="ml-0.5 tabular-nums font-extrabold text-black">
                ({unreadCount})
              </span>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAudio({ muted: !audio.muted })}
            aria-label={audio.muted ? 'Unmute audio' : 'Mute audio'}
            className="neo-btn inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center bg-white text-black cursor-pointer"
          >
            {audio.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              setShowControls(true);
            }}
            className="neo-btn inline-flex items-center gap-1 bg-white px-2.5 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Controls</span>
          </button>

          {/* Offer Draw Vote Button */}
          {onlineContext.opponentJoined && !matchResult && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                sound.playClick();
                voteDraw(myDrawYes ? 'no' : 'yes');
              }}
              className={`neo-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                myDrawYes ? 'bg-[#ffe17c] text-black' : 'bg-white text-black'
              }`}
              title="Offer mutual draw (both players must vote Yes)"
            >
              <Handshake className="h-3.5 w-3.5" />
              <span>{myDrawYes ? `Draw (${drawYesCount}/2)` : 'Draw'}</span>
            </button>
          )}

          {/* Rematch Vote Button */}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              voteRematch(myRematchYes ? 'no' : 'yes');
            }}
            className={`neo-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
              myRematchYes ? 'bg-[#ffe17c] text-black' : 'bg-black text-white'
            }`}
            title={
              onlineContext.opponentJoined
                ? 'Start a Rematch Vote (both players must vote Yes)'
                : 'Restart Match'
            }
          >
            <RotateCcw
              className={`h-3.5 w-3.5 ${myRematchYes ? 'text-black' : 'text-[#ffe17c]'}`}
            />
            <span>
              {onlineContext.opponentJoined && (rematchP1 === 'yes' || rematchP2 === 'yes')
                ? `Rematch (${rematchYesCount}/2)`
                : 'Rematch'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Mutual Draw Vote Banner */}
      {onlineContext.opponentJoined && (drawP1 === 'yes' || drawP2 === 'yes') && !matchResult && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#b7c6c2] px-4 py-2.5 neo-shadow-sm">
          <div className="flex items-center gap-2 text-xs font-extrabold text-black">
            <Handshake className="h-4 w-4 shrink-0" />
            {otherDrawYes && !myDrawYes ? (
              <span>
                {otherName} offered a Draw! Vote Yes to end the match as a Draw ({drawYesCount}/2).
              </span>
            ) : (
              <span>
                You offered a Draw ({drawYesCount}/2) — Waiting for {otherName} to vote Yes.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {otherDrawYes && !myDrawYes ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    sound.playPowerUp();
                    voteDraw('yes');
                  }}
                  className="neo-btn inline-flex items-center gap-1 bg-[#ffe17c] px-3 py-1.5 text-xs font-extrabold text-black cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  Yes, Draw
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    voteDraw('no');
                  }}
                  className="neo-btn inline-flex items-center gap-1 bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  No
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  voteDraw('no');
                }}
                className="neo-btn inline-flex items-center gap-1 bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Mutual Rematch Vote Banner (In-Game) */}
      {onlineContext.opponentJoined &&
        (rematchP1 === 'yes' || rematchP2 === 'yes') &&
        !matchResult && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#ffe17c] px-4 py-2.5 neo-shadow-sm">
            <div className="flex items-center gap-2 text-xs font-extrabold text-black">
              <RotateCcw className="h-4 w-4 shrink-0" />
              {otherRematchYes && !myRematchYes ? (
                <span>
                  {otherName} wants a Rematch! Both players must select Yes ({rematchYesCount}/2).
                </span>
              ) : (
                <span>
                  Rematch Vote active ({rematchYesCount}/2) — Waiting for {otherName} to vote Yes.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {otherRematchYes && !myRematchYes ? (
                <>
                  <button
                    type="button"
                    onClick={() => voteRematch('yes')}
                    className="neo-btn inline-flex items-center gap-1 bg-black px-3 py-1.5 text-xs font-extrabold text-[#ffe17c] cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Yes, Rematch
                  </button>
                  <button
                    type="button"
                    onClick={() => voteRematch('no')}
                    className="neo-btn inline-flex items-center gap-1 bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    No
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => voteRematch('no')}
                  className="neo-btn inline-flex items-center gap-1 bg-white px-3 py-1.5 text-xs font-bold text-black cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

      {/* Game Stage + Desktop Split Chat */}
      <div
        className={`grid gap-4 ${
          showChat && !device.isMobile ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''
        }`}
      >
        <div className="relative w-full min-w-0">
          {children({
            p1,
            p2,
            online: onlineContext,
            onMatchEnd: handleMatchEnd,
            matchSeed,
          })}
        </div>

        {showChat && !device.isMobile && (
          <div data-chat-panel className="h-[460px] xl:h-[560px] xl:sticky xl:top-24">
            <RoomChat compact />
          </div>
        )}
      </div>

      {/* Mobile Full-Sheet Chat Drawer so gameplay board stays clean */}
      {showChat && device.isMobile && (
        <div
          data-chat-panel
          data-modal
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 p-2.5"
          onClick={() => setShowChat(false)}
        >
          <div
            className="flex h-[78vh] w-full flex-col overflow-hidden rounded-2xl border-2 border-black bg-white neo-shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black bg-[#ffe17c] px-4 py-2.5">
              <span className="font-display text-sm font-extrabold text-black">
                Room Chat ({onlineContext.roomCode})
              </span>
              <button
                type="button"
                onClick={() => setShowChat(false)}
                className="neo-btn bg-white p-1 text-black cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <RoomChat compact />
            </div>
          </div>
        </div>
      )}

      {/* Controls Modal */}
      {showControls && (
        <div
          data-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowControls(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border-2 border-black bg-white p-6 neo-shadow-xl max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div>
                <h2 className="font-display text-xl font-extrabold tracking-tight text-black">
                  {meta.name} — Controls &amp; Rules
                </h2>
                <p className="text-xs text-black/65">{meta.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="neo-btn bg-white p-1.5 text-black cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border-2 border-black bg-[#ffe17c] p-3.5">
                <p className="text-xs font-extrabold text-black">
                  {p1.name} ({meta.controlsSummary.p1Label})
                </p>
                <ul className="mt-2 space-y-1.5 text-xs text-black/85">
                  {meta.controlsSummary.p1Controls.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border-2 border-black bg-[#b7c6c2] p-3.5">
                <p className="text-xs font-extrabold text-black">
                  {p2.name} ({meta.controlsSummary.p2Label})
                </p>
                <ul className="mt-2 space-y-1.5 text-xs text-black/85">
                  {meta.controlsSummary.p2Controls.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs font-extrabold text-black">Rules</h3>
              <ul className="mt-2 space-y-1.5 text-xs text-black/80 list-disc pl-4">
                {meta.controlsSummary.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowControls(false)}
                className="neo-btn bg-black px-5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {matchResult && (
        <CelebrationOverlay
          result={matchResult}
          p1={p1}
          p2={p2}
          mySide={onlineContext.mySide}
          opponentJoined={onlineContext.opponentJoined}
          rematchP1={rematchP1}
          rematchP2={rematchP2}
          onVoteRematch={(choice) => voteRematch(choice)}
          onBackToHub={onExit}
        />
      )}
    </div>
  );
};
