import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
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
    restartRoomGame,
    messages,
  } = useArcade();

  const matchSeed = room?.matchSeed ?? 1;
  const [showControls, setShowControls] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenMsgCount = useRef(messages.length);
  const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null);
  const recordedSeedRef = useRef<number>(0);

  useEffect(() => {
    setMatchResult(null);
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

  if (!onlineContext) return null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-3 py-4 sm:gap-4 sm:px-6 sm:py-5">
      {/* Shared Neo-Brutalist Game Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border-2 border-black bg-white px-3 py-2.5 neo-shadow-sm sm:px-4 sm:py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              onExit();
            }}
            className="neo-btn inline-flex items-center gap-1.5 bg-[#ffe17c] px-3 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Room {onlineContext.roomCode}
          </button>
          <div>
            <h1 className="font-display text-base font-extrabold tracking-tight leading-tight text-black sm:text-lg">
              {meta.name}
            </h1>
            <p className="text-[11px] text-black/65 sm:text-xs">
              {onlineContext.opponentJoined
                ? 'Both players connected'
                : 'Waiting for your friend to join'}
            </p>
          </div>
        </div>

        {/* Side 1 vs Side 2 */}
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

        {/* Utility Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              sound.playClick();
              setShowChat((s) => !s);
            }}
            className="neo-btn inline-flex items-center gap-1.5 bg-[#b7c6c2] px-3 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
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
            className="neo-btn inline-flex h-9 w-9 items-center justify-center bg-white text-black cursor-pointer"
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
            className="neo-btn inline-flex items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Controls</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => restartRoomGame()}
            className="neo-btn inline-flex items-center gap-1.5 bg-black px-3 py-1.5 text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#ffe17c]" />
            Rematch
          </button>
        </div>
      </div>

      {/* Game Stage + Optional Slide-in Chat */}
      <div className={`grid gap-4 ${showChat ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="relative w-full min-w-0">
          {children({
            p1,
            p2,
            online: onlineContext,
            onMatchEnd: handleMatchEnd,
            matchSeed,
          })}
        </div>

        {showChat && (
          <div data-chat-panel className="h-[460px] xl:h-[540px] xl:sticky xl:top-24">
            <RoomChat compact />
          </div>
        )}
      </div>

      {/* Controls Modal */}
      {showControls && (
        <div
          data-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowControls(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border-2 border-black bg-white p-6 neo-shadow-xl"
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
          onPlayAgain={() => restartRoomGame()}
          onBackToHub={onExit}
        />
      )}
    </div>
  );
};
