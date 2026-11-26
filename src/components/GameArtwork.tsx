import React from 'react';
import { GameId } from '../types/arcade';

export const GameArtwork: React.FC<{
  gameId: GameId;
  p1Color?: string;
  p2Color?: string;
}> = ({ gameId }) => {
  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border-2 border-black bg-white">
      {gameId === 'racing' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="160" fill="#b7c6c2" />
          {/* 4-lane Vertical Highway */}
          <rect x="64" y="0" width="192" height="160" fill="#171e19" stroke="#000000" strokeWidth="3" />
          {/* Curbs */}
          <rect x="56" y="0" width="8" height="160" fill="#ffe17c" stroke="#000000" strokeWidth="2" />
          <rect x="256" y="0" width="8" height="160" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          {/* Lane lines */}
          <line x1="112" y1="0" x2="112" y2="160" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="10 10" />
          <line x1="160" y1="0" x2="160" y2="160" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="10 10" />
          <line x1="208" y1="0" x2="208" y2="160" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="10 10" />
          {/* Checkered Finish */}
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => (
            <React.Fragment key={c}>
              <rect x={64 + c * 16} y="16" width="16" height="10" fill={c % 2 === 0 ? '#ffffff' : '#000000'} />
              <rect x={64 + c * 16} y="26" width="16" height="10" fill={c % 2 === 0 ? '#000000' : '#ffffff'} />
            </React.Fragment>
          ))}
          {/* Boost Star */}
          <polygon points="184,48 187,56 195,56 189,61 191,69 184,64 177,69 179,61 173,56 181,56" fill="#ffe17c" stroke="#000000" strokeWidth="1.5" />
          {/* Car 1 */}
          <g transform="translate(136, 98)">
            <rect x="-12" y="-20" width="24" height="40" rx="6" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <rect x="-8" y="-10" width="16" height="9" rx="2" fill="#171e19" />
          </g>
          {/* Car 2 */}
          <g transform="translate(184, 114)">
            <rect x="-12" y="-20" width="24" height="40" rx="6" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
            <rect x="-8" y="-10" width="16" height="9" rx="2" fill="#171e19" />
          </g>
        </svg>
      )}

      {gameId === 'airhockey' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="160" fill="#ffe17c" />
          <rect x="20" y="16" width="280" height="128" rx="16" fill="#171e19" stroke="#000000" strokeWidth="3.5" />
          <line x1="160" y1="18" x2="160" y2="142" stroke="#b7c6c2" strokeWidth="2.5" />
          <circle cx="160" cy="80" r="24" fill="none" stroke="#b7c6c2" strokeWidth="2.5" />
          <path d="M 20 50 A 30 30 0 0 1 20 110" fill="none" stroke="#ffe17c" strokeWidth="3" />
          <path d="M 300 50 A 30 30 0 0 0 300 110" fill="none" stroke="#b7c6c2" strokeWidth="3" />
          {/* Left Mallet */}
          <circle cx="76" cy="68" r="14" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
          <circle cx="76" cy="68" r="6" fill="#171e19" stroke="#ffffff" strokeWidth="1.5" />
          {/* Right Mallet */}
          <circle cx="244" cy="92" r="14" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
          <circle cx="244" cy="92" r="6" fill="#171e19" stroke="#ffffff" strokeWidth="1.5" />
          {/* Puck + Trail */}
          <line x1="98" y1="71" x2="152" y2="80" stroke="#ffe17c" strokeWidth="3" strokeDasharray="5 4" />
          <circle cx="164" cy="82" r="8.5" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
        </svg>
      )}

      {gameId === 'chess' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="160" fill="#b7c6c2" />
          <g transform="translate(80, 18)">
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2, 3, 4].map((c) => (
                <rect
                  key={`${r}-${c}`}
                  x={c * 32}
                  y={r * 31}
                  width="32"
                  height="31"
                  fill={(r + c) % 2 === 0 ? '#ffffff' : '#171e19'}
                />
              ))
            )}
            <rect x="0" y="0" width="160" height="124" fill="none" stroke="#000000" strokeWidth="3" />
            <circle cx="48" cy="46" r="10.5" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <circle cx="112" cy="77" r="10.5" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
            <line x1="58" y1="51" x2="102" y2="72" stroke="#ffe17c" strokeWidth="2.5" strokeDasharray="4 4" />
          </g>
        </svg>
      )}

      {gameId === 'carrom' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="160" fill="#ffffff" />
          <rect x="64" y="14" width="192" height="132" rx="10" fill="#ffe17c" stroke="#000000" strokeWidth="3" />
          <circle cx="80" cy="30" r="7.5" fill="#171e19" />
          <circle cx="240" cy="30" r="7.5" fill="#171e19" />
          <circle cx="80" cy="130" r="7.5" fill="#171e19" />
          <circle cx="240" cy="130" r="7.5" fill="#171e19" />
          <circle cx="160" cy="76" r="28" fill="none" stroke="#000000" strokeWidth="2" />
          <circle cx="160" cy="76" r="7.5" fill="#171e19" stroke="#ffffff" strokeWidth="2" />
          <circle cx="143" cy="76" r="7" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <circle cx="177" cy="76" r="7" fill="#b7c6c2" stroke="#000000" strokeWidth="2" />
          <circle cx="160" cy="120" r="9.5" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
          <line x1="160" y1="110" x2="160" y2="87" stroke="#000000" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      )}

      {gameId === 'headball' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="124" fill="#b7c6c2" />
          <rect y="124" width="320" height="36" fill="#171e19" />
          <line x1="0" y1="124" x2="320" y2="124" stroke="#000000" strokeWidth="2.5" />
          <polyline points="0,78 28,78 28,124" fill="none" stroke="#ffe17c" strokeWidth="4" />
          <polyline points="320,78 292,78 292,124" fill="none" stroke="#ffffff" strokeWidth="4" />
          <circle cx="96" cy="94" r="18" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
          <circle cx="102" cy="91" r="3" fill="#000000" />
          <circle cx="224" cy="84" r="18" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
          <circle cx="218" cy="81" r="3" fill="#000000" />
          <circle cx="160" cy="50" r="12" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
          <circle cx="160" cy="50" r="4" fill="#000000" />
        </svg>
      )}

      {gameId === 'football' && (
        <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
          <rect width="320" height="160" fill="#171e19" />
          <rect x="24" y="16" width="272" height="128" fill="none" stroke="#b7c6c2" strokeWidth="2.5" />
          <line x1="160" y1="16" x2="160" y2="144" stroke="#b7c6c2" strokeWidth="2.5" />
          <circle cx="160" cy="80" r="24" fill="none" stroke="#b7c6c2" strokeWidth="2.5" />
          <rect x="10" y="54" width="14" height="52" fill="none" stroke="#ffe17c" strokeWidth="2.5" />
          <rect x="296" y="54" width="14" height="52" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="105" cy="70" r="11" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
          <circle cx="215" cy="90" r="11" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
          <circle cx="152" cy="80" r="7.5" fill="#ffffff" stroke="#000000" strokeWidth="2" />
          <line x1="119" y1="73" x2="143" y2="79" stroke="#ffe17c" strokeWidth="2.5" strokeDasharray="3 3" />
        </svg>
      )}
    </div>
  );
};
