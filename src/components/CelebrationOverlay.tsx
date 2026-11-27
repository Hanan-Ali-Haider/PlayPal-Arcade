import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Check, Home, RotateCcw, Trophy, X } from 'lucide-react';
import { MatchResultPayload, PlayerId, PlayerProfile, VoteChoice } from '../types/arcade';
import { sound } from '../utils/sound';
import { PlayerAvatar } from './PlayerAvatar';

interface CelebrationOverlayProps {
  result: MatchResultPayload;
  p1: PlayerProfile;
  p2: PlayerProfile;
  mySide: PlayerId | null;
  opponentJoined: boolean;
  rematchP1: VoteChoice;
  rematchP2: VoteChoice;
  onVoteRematch: (choice: 'yes' | 'no') => void;
  onBackToHub: () => void;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  result,
  p1,
  p2,
  mySide,
  opponentJoined,
  rematchP1,
  rematchP2,
  onVoteRematch,
  onBackToHub,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const winnerProfile =
    result.winner === p1.id ? p1 : result.winner === p2.id ? p2 : null;

  const isDraw = result.winner === 'draw';

  const headline = winnerProfile ? `${winnerProfile.name} Wins!` : 'Match Drawn';

  const bannerColor =
    winnerProfile?.id === 'p1'
      ? '#ffe17c'
      : winnerProfile?.id === 'p2'
        ? '#b7c6c2'
        : '#ffffff';

  const iAmP2 = mySide === 'p2';
  const myVoteYes = iAmP2 ? rematchP2 === 'yes' : rematchP1 === 'yes';
  const otherVoteYes = iAmP2 ? rematchP1 === 'yes' : rematchP2 === 'yes';
  const otherName = iAmP2 ? p1.name : p2.name;
  const yesCount = (rematchP1 === 'yes' ? 1 : 0) + (rematchP2 === 'yes' ? 1 : 0);

  useEffect(() => {
    if (isDraw) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const colors = ['#ffe17c', '#b7c6c2', '#171e19', '#ffffff'];

    const particles = Array.from({ length: 85 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      const speed = 5 + Math.random() * 11;
      return {
        x: width / 2 + (Math.random() - 0.5) * 160,
        y: height * 0.45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        life: 1,
      };
    });

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.26;
        p.vx *= 0.99;
        p.rot += p.vRot;
        p.life -= 0.009;
        if (p.life > 0 && p.y < height + 40) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.strokeRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
        }
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isDraw]);

  return (
    <div data-modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border-2 border-black bg-white p-6 text-center neo-shadow-xl sm:p-7"
      >
        <div
          className="mx-auto mb-4 inline-flex items-center justify-center gap-3 rounded-xl border-2 border-black px-4 py-2"
          style={{ backgroundColor: bannerColor }}
        >
          {winnerProfile ? (
            <PlayerAvatar profile={winnerProfile} size="md" />
          ) : (
            <Trophy className="h-6 w-6 text-black" />
          )}
          <span className="font-display text-sm font-extrabold uppercase tracking-tight text-black">
            Final Result
          </span>
        </div>

        <h2 className="font-display text-3xl font-extrabold tracking-tighter text-black text-balance">
          {headline}
        </h2>

        <p className="mt-2 font-mono-num text-xl font-bold text-black">{result.scoreLabel}</p>
        <p className="mt-1.5 text-sm text-black/70">{result.summary}</p>

        {/* Mutual Rematch Voting Status */}
        {opponentJoined && (myVoteYes || otherVoteYes) && (
          <div className="mt-5 rounded-xl border-2 border-black bg-[#ffe17c] px-4 py-3 text-xs font-bold text-black">
            {otherVoteYes && !myVoteYes ? (
              <p className="font-extrabold">
                {otherName} voted YES for a rematch! ({yesCount}/2)
              </p>
            ) : (
              <p className="font-extrabold">
                Rematch vote started ({yesCount}/2) — Waiting for {otherName} to vote Yes...
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {!opponentJoined ? (
            <button
              type="button"
              onClick={() => {
                sound.playPowerUp();
                onVoteRematch('yes');
              }}
              className="neo-btn inline-flex items-center justify-center gap-2 bg-[#ffe17c] px-5 py-2.5 text-sm font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Play Again
            </button>
          ) : otherVoteYes && !myVoteYes ? (
            <>
              <button
                type="button"
                onClick={() => {
                  sound.playPowerUp();
                  onVoteRematch('yes');
                }}
                className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#ffe17c] px-4 py-2.5 text-sm font-extrabold text-black whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Check className="h-4 w-4" />
                Yes, Rematch!
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onVoteRematch('no');
                }}
                className="neo-btn inline-flex items-center justify-center gap-1.5 bg-white px-4 py-2.5 text-sm font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
                No
              </button>
            </>
          ) : myVoteYes ? (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onVoteRematch('no');
              }}
              className="neo-btn inline-flex items-center justify-center gap-2 bg-[#b7c6c2] px-5 py-2.5 text-sm font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
            >
              <X className="h-4 w-4" />
              Cancel Rematch Vote
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onVoteRematch('yes');
              }}
              className="neo-btn inline-flex items-center justify-center gap-2 bg-[#ffe17c] px-5 py-2.5 text-sm font-bold text-black whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Vote Rematch (Yes)
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onBackToHub();
            }}
            className="neo-btn inline-flex items-center justify-center gap-2 bg-[#171e19] px-5 py-2.5 text-sm font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Home className="h-4 w-4" />
            Back to Room
          </button>
        </div>
      </motion.div>
    </div>
  );
};
