import React from 'react';
import { GameId } from '../types/arcade';

export const GameArtwork: React.FC<{
  gameId: GameId;
  p1Color?: string;
  p2Color?: string;
}> = ({ gameId }) => {
  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border-2 border-black bg-white">
      <div className="h-full w-full transition-transform duration-200 ease-out group-hover:scale-[1.04]">
        {gameId === 'racing' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#ffe17c" />
            {/* Comic Halftone Corner Stripes */}
            <path d="M-20 40 L90 -20 L140 -20 L-20 85 Z" fill="#b7c6c2" opacity="0.65" />
            <path d="M210 180 L340 60 L340 180 Z" fill="#b7c6c2" opacity="0.7" />
            {/* Angled Perspective Speedway */}
            <polygon points="88,0 232,0 294,160 26,160" fill="#171e19" stroke="#000000" strokeWidth="3.5" />
            {/* Rumble Curbs */}
            <polygon points="74,0 88,0 26,160 10,160" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <polygon points="232,0 246,0 310,160 294,160" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
            {/* Dashed Perspective Lanes */}
            <line x1="160" y1="6" x2="160" y2="156" stroke="#ffffff" strokeWidth="3" strokeDasharray="12 10" strokeOpacity="0.65" />
            <line x1="122" y1="6" x2="88" y2="156" stroke="#b7c6c2" strokeWidth="2" strokeDasharray="8 10" strokeOpacity="0.45" />
            <line x1="198" y1="6" x2="232" y2="156" stroke="#b7c6c2" strokeWidth="2" strokeDasharray="8 10" strokeOpacity="0.45" />

            {/* Checkered Finish Banner */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <React.Fragment key={c}>
                <rect x={85 + c * 15} y="14" width="15" height="8" fill={c % 2 === 0 ? '#ffffff' : '#000000'} />
                <rect x={85 + c * 15} y="22" width="15" height="8" fill={c % 2 === 0 ? '#000000' : '#ffffff'} />
              </React.Fragment>
            ))}
            <rect x="85" y="14" width="150" height="16" fill="none" stroke="#000000" strokeWidth="2" />

            {/* Speed Lines */}
            <line x1="110" y1="42" x2="104" y2="74" stroke="#ffe17c" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="212" y1="54" x2="220" y2="92" stroke="#b7c6c2" strokeWidth="2.5" strokeLinecap="round" />

            {/* Star Boost Pickup */}
            <polygon
              points="210,44 214,52 223,53 216,59 218,68 210,63 202,68 204,59 197,53 206,52"
              fill="#ffe17c"
              stroke="#000000"
              strokeWidth="2"
            />

            {/* Rival Car (Sage) with Hard Shadow */}
            <g transform="translate(198, 108) rotate(8)">
              <rect x="-13" y="-22" width="30" height="48" rx="7" fill="#000000" />
              <rect x="-17" y="-26" width="30" height="48" rx="7" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
              <rect x="-11" y="-12" width="18" height="11" rx="2.5" fill="#171e19" />
              <rect x="-11" y="5" width="18" height="7" rx="2" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <rect x="-9" y="-28" width="6" height="4" rx="1" fill="#ffe17c" stroke="#000000" strokeWidth="1" />
              <rect x="1" y="-28" width="6" height="4" rx="1" fill="#ffe17c" stroke="#000000" strokeWidth="1" />
            </g>

            {/* Hero Car (Yellow) Boosting Past */}
            <g transform="translate(126, 86) rotate(-6)">
              {/* Boost Chevrons */}
              <polyline points="-10,30 -2,38 6,30" fill="none" stroke="#ffe17c" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="-8,38 -2,45 4,38" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {/* Hard Offset Shadow */}
              <rect x="-13" y="-22" width="30" height="50" rx="8" fill="#000000" />
              <rect x="-17" y="-26" width="30" height="50" rx="8" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
              <line x1="-2" y1="-25" x2="-2" y2="23" stroke="#171e19" strokeWidth="4" />
              <rect x="-11" y="-12" width="18" height="12" rx="3" fill="#171e19" />
              <rect x="-13" y="14" width="22" height="6" rx="2" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
            </g>
          </svg>
        )}

        {gameId === 'airhockey' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#ffe17c" />
            {/* Diagonal Comic Backdrop Accent */}
            <polygon points="0,0 130,0 85,160 0,160" fill="#b7c6c2" />
            {/* Rink Frame Shadow & Rink */}
            <rect x="22" y="20" width="282" height="124" rx="18" fill="#000000" />
            <rect x="18" y="16" width="282" height="124" rx="18" fill="#171e19" stroke="#000000" strokeWidth="3.5" />
            {/* Rink Center Line & Circle */}
            <line x1="159" y1="18" x2="159" y2="138" stroke="#b7c6c2" strokeWidth="3" />
            <circle cx="159" cy="78" r="27" fill="none" stroke="#b7c6c2" strokeWidth="3" />
            <circle cx="159" cy="78" r="5" fill="#ffe17c" />
            {/* Goal Creases */}
            <path d="M 18 46 A 32 32 0 0 1 18 110" fill="none" stroke="#ffe17c" strokeWidth="4" />
            <path d="M 300 46 A 32 32 0 0 0 300 110" fill="none" stroke="#b7c6c2" strokeWidth="4" />

            {/* Speed Trail & Wall Ricochet Spark */}
            <polyline points="82,66 130,34 188,82" fill="none" stroke="#ffe17c" strokeWidth="3.5" strokeDasharray="7 5" strokeLinecap="round" />
            <polygon points="130,22 133,29 140,29 135,34 137,41 130,37 123,41 125,34 120,29 127,29" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />

            {/* Left Mallet with Hard Shadow */}
            <circle cx="77" cy="73" r="18" fill="#000000" />
            <circle cx="73" cy="69" r="18" fill="#ffe17c" stroke="#000000" strokeWidth="3" />
            <circle cx="73" cy="69" r="8" fill="#171e19" stroke="#ffffff" strokeWidth="2" />

            {/* Right Mallet with Hard Shadow */}
            <circle cx="249" cy="91" r="18" fill="#000000" />
            <circle cx="245" cy="87" r="18" fill="#b7c6c2" stroke="#000000" strokeWidth="3" />
            <circle cx="245" cy="87" r="8" fill="#171e19" stroke="#ffffff" strokeWidth="2" />

            {/* Striker Puck */}
            <circle cx="192" cy="84" r="11" fill="#000000" />
            <circle cx="189" cy="81" r="11" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <circle cx="189" cy="81" r="4.5" fill="#ffffff" />
          </svg>
        )}

        {gameId === 'chess' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#b7c6c2" />
            {/* Checkered Board */}
            <g transform="translate(52, 12)">
              <rect x="4" y="4" width="216" height="136" rx="8" fill="#000000" />
              <g clipPath="url(#chess-clip)">
                {[0, 1, 2, 3].map((r) =>
                  [0, 1, 2, 3, 4, 5].map((c) => (
                    <rect
                      key={`${r}-${c}`}
                      x={c * 36}
                      y={r * 34}
                      width="36"
                      height="34"
                      fill={(r + c) % 2 === 0 ? '#ffffff' : '#171e19'}
                    />
                  ))
                )}
              </g>
              <defs>
                <clipPath id="chess-clip">
                  <rect x="0" y="0" width="216" height="136" rx="8" />
                </clipPath>
              </defs>
              <rect x="0" y="0" width="216" height="136" rx="8" fill="none" stroke="#000000" strokeWidth="3.5" />

              {/* Tactical Move Arrow */}
              <line x1="74" y1="88" x2="144" y2="54" stroke="#ffe17c" strokeWidth="4" strokeDasharray="6 5" strokeLinecap="round" />

              {/* Sculpted Yellow King Silhouette (Left) */}
              <g transform="translate(64, 88)">
                <path
                  d="M-14 22 L14 22 L11 12 L15 -6 L6 -12 L0 -22 L-6 -12 L-15 -6 L-11 12 Z"
                  transform="translate(3, 3)"
                  fill="#000000"
                />
                <path
                  d="M-14 22 L14 22 L11 12 L15 -6 L6 -12 L0 -22 L-6 -12 L-15 -6 L-11 12 Z"
                  fill="#ffe17c"
                  stroke="#000000"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <line x1="0" y1="-32" x2="0" y2="-20" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" />
                <line x1="-6" y1="-26" x2="6" y2="-26" stroke="#000000" strokeWidth="3.5" strokeLinecap="round" />
              </g>

              {/* Sculpted Sage Knight Silhouette (Right) */}
              <g transform="translate(152, 56)">
                <path
                  d="M-14 24 L14 24 L12 10 C12 -4 6 -16 -6 -22 L-10 -28 L-12 -18 C-18 -14 -20 -6 -14 -1 L-4 -2 L-12 10 Z"
                  transform="translate(3, 3)"
                  fill="#000000"
                />
                <path
                  d="M-14 24 L14 24 L12 10 C12 -4 6 -16 -6 -22 L-10 -28 L-12 -18 C-18 -14 -20 -6 -14 -1 L-4 -2 L-12 10 Z"
                  fill="#b7c6c2"
                  stroke="#000000"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <circle cx="-7" cy="-11" r="2" fill="#000000" />
              </g>
            </g>

            {/* Comic CHECK Badge */}
            <g transform="translate(248, 28) rotate(8)">
              <rect x="-26" y="-11" width="56" height="24" rx="5" fill="#000000" />
              <rect x="-29" y="-14" width="56" height="24" rx="5" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
              <text x="-1" y="2" textAnchor="middle" fill="#000000" fontSize="11" fontWeight="900" fontFamily="Cabinet Grotesk, sans-serif">
                CHECK!
              </text>
            </g>
          </svg>
        )}

        {gameId === 'carrom' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#171e19" />
            {/* Wooden Board Outer Shadow + Frame */}
            <rect x="44" y="14" width="236" height="136" rx="14" fill="#000000" />
            <rect x="40" y="10" width="236" height="136" rx="14" fill="#ffe17c" stroke="#000000" strokeWidth="3.5" />
            {/* Playing Surface */}
            <rect x="54" y="22" width="208" height="112" rx="8" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />

            {/* 4 Corner Pockets */}
            {[
              [65, 33],
              [251, 33],
              [65, 123],
              [251, 123],
            ].map(([px, py], idx) => (
              <circle key={idx} cx={px} cy={py} r="9" fill="#171e19" stroke="#000000" strokeWidth="2" />
            ))}

            {/* Center Geometric Carrom Star */}
            <circle cx="158" cy="76" r="29" fill="none" stroke="#171e19" strokeWidth="2" />
            <circle cx="158" cy="76" r="22" fill="none" stroke="#b7c6c2" strokeWidth="2" />
            <polygon points="158,52 164,70 182,76 164,82 158,100 152,82 134,76 152,70" fill="#ffe17c" fillOpacity="0.45" stroke="#000000" strokeWidth="1.5" />

            {/* Scattering Coins + Queen */}
            <circle cx="160" cy="78" r="8" fill="#000000" />
            <circle cx="158" cy="76" r="8" fill="#171e19" stroke="#ffe17c" strokeWidth="2.5" />
            <circle cx="158" cy="76" r="3" fill="#ffe17c" />

            <circle cx="139" cy="67" r="7.5" fill="#ffffff" stroke="#000000" strokeWidth="2" />
            <circle cx="177" cy="64" r="7.5" fill="#b7c6c2" stroke="#000000" strokeWidth="2" />
            <circle cx="143" cy="90" r="7.5" fill="#b7c6c2" stroke="#000000" strokeWidth="2" />
            <circle cx="179" cy="87" r="7.5" fill="#ffffff" stroke="#000000" strokeWidth="2" />

            {/* Striker Blast Path */}
            <line x1="122" y1="118" x2="152" y2="85" stroke="#000000" strokeWidth="2.5" strokeDasharray="4 4" />
            <circle cx="122" cy="120" r="10.5" fill="#000000" />
            <circle cx="119" cy="117" r="10.5" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <circle cx="119" cy="117" r="4.5" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
          </svg>
        )}

        {gameId === 'headball' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="122" fill="#b7c6c2" />
            {/* Stadium Sunburst Stripes */}
            <polygon points="160,122 30,0 90,0" fill="#ffffff" opacity="0.35" />
            <polygon points="160,122 230,0 290,0" fill="#ffffff" opacity="0.35" />
            <rect y="122" width="320" height="38" fill="#171e19" />
            <line x1="0" y1="122" x2="320" y2="122" stroke="#000000" strokeWidth="3" />

            {/* Left & Right Goal Nets */}
            <path d="M0 68 L32 68 L32 122" fill="none" stroke="#ffe17c" strokeWidth="5" strokeLinejoin="round" />
            <path d="M8 68 L8 122 M18 68 L18 122 M0 86 L32 86 M0 104 L32 104" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.6" />
            <path d="M320 68 L288 68 L288 122" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinejoin="round" />
            <path d="M312 68 L312 122 M302 68 L302 122 M288 86 L320 86 M288 104 L320 104" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.6" />

            {/* Player 1 Comic Head + Cleat */}
            <g transform="translate(94, 86)">
              <circle cx="3" cy="3" r="21" fill="#000000" />
              <circle cx="0" cy="0" r="21" fill="#ffe17c" stroke="#000000" strokeWidth="3" />
              {/* Headband */}
              <rect x="-19" y="-12" width="38" height="7" rx="2" fill="#171e19" />
              {/* Fierce Eyes & Grin */}
              <circle cx="7" cy="-1" r="3" fill="#000000" />
              <line x1="2" y1="-6" x2="12" y2="-4" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M2 8 Q9 13 15 6" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
              {/* Cleat */}
              <rect x="4" y="18" width="22" height="11" rx="5" fill="#171e19" stroke="#000000" strokeWidth="2.5" transform="rotate(-18 14 23)" />
            </g>

            {/* Player 2 Comic Head + Cleat */}
            <g transform="translate(226, 76)">
              <circle cx="3" cy="3" r="21" fill="#000000" />
              <circle cx="0" cy="0" r="21" fill="#ffffff" stroke="#000000" strokeWidth="3" />
              <rect x="-19" y="-12" width="38" height="7" rx="2" fill="#b7c6c2" stroke="#000000" strokeWidth="1.5" />
              <circle cx="-7" cy="-1" r="3" fill="#000000" />
              <line x1="-12" y1="-4" x2="-2" y2="-6" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M-15 6 Q-9 12 -2 8" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" />
              <rect x="-26" y="18" width="22" height="11" rx="5" fill="#171e19" stroke="#000000" strokeWidth="2.5" transform="rotate(18 -14 23)" />
            </g>

            {/* Airborne Soccer Ball + Impact Arc */}
            <path d="M124 62 Q160 22 196 54" fill="none" stroke="#ffe17c" strokeWidth="3.5" strokeDasharray="6 5" />
            <circle cx="163" cy="44" r="14" fill="#000000" />
            <circle cx="160" cy="41" r="14" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <polygon points="160,34 166,39 164,46 156,46 154,39" fill="#171e19" />
          </svg>
        )}

        {gameId === 'football' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#171e19" />
            {/* Alternating Turf Stripes */}
            {[0, 2, 4, 6].map((i) => (
              <rect key={i} x={24 + i * 34} y="14" width="34" height="132" fill="#212b24" />
            ))}
            {/* Pitch Markings */}
            <rect x="24" y="14" width="272" height="132" fill="none" stroke="#b7c6c2" strokeWidth="3" />
            <line x1="160" y1="14" x2="160" y2="146" stroke="#b7c6c2" strokeWidth="2.5" />
            <circle cx="160" cy="80" r="26" fill="none" stroke="#b7c6c2" strokeWidth="2.5" />
            <circle cx="160" cy="80" r="3.5" fill="#ffe17c" />
            {/* Penalty Boxes & Goal Nets */}
            <rect x="24" y="42" width="34" height="76" fill="none" stroke="#b7c6c2" strokeWidth="2" />
            <rect x="262" y="42" width="34" height="76" fill="none" stroke="#b7c6c2" strokeWidth="2" />
            <rect x="8" y="54" width="16" height="52" fill="#ffe17c" fillOpacity="0.2" stroke="#ffe17c" strokeWidth="3" />
            <rect x="296" y="54" width="16" height="52" fill="#ffffff" fillOpacity="0.18" stroke="#ffffff" strokeWidth="3" />

            {/* Curved Strike Trajectory */}
            <path d="M108 92 Q180 42 262 66" fill="none" stroke="#ffe17c" strokeWidth="3.5" strokeDasharray="6 5" strokeLinecap="round" />

            {/* Player 1 Striker */}
            <circle cx="101" cy="97" r="13.5" fill="#000000" />
            <circle cx="98" cy="94" r="13.5" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
            <text x="98" y="98" textAnchor="middle" fill="#000000" fontSize="11" fontWeight="900">1</text>

            {/* Player 2 Keeper/Defender */}
            <circle cx="229" cy="85" r="13.5" fill="#000000" />
            <circle cx="226" cy="82" r="13.5" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
            <text x="226" y="86" textAnchor="middle" fill="#000000" fontSize="11" fontWeight="900">2</text>

            {/* Fast Soccer Ball */}
            <circle cx="187" cy="61" r="10" fill="#000000" />
            <circle cx="185" cy="59" r="10" fill="#ffffff" stroke="#000000" strokeWidth="2.5" />
            <polygon points="185,54 189,57 187,62 183,62 181,57" fill="#171e19" />
          </svg>
        )}

        {gameId === 'pool' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#ffe17c" />
            {/* Table Shadow & Rail */}
            <rect x="20" y="18" width="284" height="128" rx="14" fill="#000000" />
            <rect x="16" y="14" width="284" height="128" rx="14" fill="#171e19" stroke="#000000" strokeWidth="3.5" />
            {/* Tournament Felt */}
            <rect x="30" y="26" width="256" height="104" rx="8" fill="#14533D" stroke="#000000" strokeWidth="2.5" />
            {/* 6 Pockets */}
            {[
              [34, 30],
              [158, 26],
              [282, 30],
              [34, 126],
              [158, 130],
              [282, 126],
            ].map(([px, py], i) => (
              <circle key={i} cx={px} cy={py} r="9.5" fill="#000000" stroke="#ffe17c" strokeWidth="2.5" />
            ))}

            {/* Aim Trajectory & Ghost Circle */}
            <line x1="112" y1="80" x2="194" y2="78" stroke="#ffe17c" strokeWidth="2.5" strokeDasharray="5 4" />
            <circle cx="192" cy="78" r="10" fill="none" stroke="#ffe17c" strokeWidth="2" strokeDasharray="3 3" />

            {/* Cue Stick */}
            <line x1="36" y1="98" x2="96" y2="83" stroke="#000000" strokeWidth="8.5" strokeLinecap="round" />
            <line x1="36" y1="98" x2="96" y2="83" stroke="#ffe17c" strokeWidth="5" strokeLinecap="round" />
            <line x1="87" y1="85.2" x2="96" y2="83" stroke="#b7c6c2" strokeWidth="5.5" strokeLinecap="round" />

            {/* Cue Ball */}
            <circle cx="112" cy="82" r="10.5" fill="#000000" />
            <circle cx="110" cy="80" r="10.5" fill="#ffffff" stroke="#000000" strokeWidth="2.2" />

            {/* Tight 8-Ball Rack */}
            <circle cx="209" cy="80" r="10" fill="#000000" />
            <circle cx="207" cy="78" r="10" fill="#ffe17c" stroke="#000000" strokeWidth="2" />
            <circle cx="226" cy="69" r="10" fill="#3B82F6" stroke="#000000" strokeWidth="2" />
            <circle cx="226" cy="89" r="10" fill="#111111" stroke="#000000" strokeWidth="2" />
            <circle cx="226" cy="89" r="4.5" fill="#ffffff" />
            <text x="226" y="91.5" textAnchor="middle" fill="#000000" fontSize="7" fontWeight="900">8</text>
            <circle cx="245" cy="59" r="10" fill="#EF4444" stroke="#000000" strokeWidth="2" />
            <circle cx="245" cy="79" r="10" fill="#ffffff" stroke="#000000" strokeWidth="2" />
            <rect x="236" y="75" width="18" height="8" rx="2" fill="#8B5CF6" />
            <circle cx="245" cy="99" r="10" fill="#F97316" stroke="#000000" strokeWidth="2" />
          </svg>
        )}

        {gameId === 'tictactoe' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#ffe17c" />
            {/* Comic Corner Stripes */}
            <polygon points="0,0 110,0 0,115" fill="#b7c6c2" />
            <polygon points="320,160 210,160 320,45" fill="#b7c6c2" />

            {/* Board Shadow + Grid */}
            <g transform="translate(88, 12)">
              <rect x="5" y="5" width="144" height="136" rx="14" fill="#000000" />
              <rect x="0" y="0" width="144" height="136" rx="14" fill="#171e19" stroke="#000000" strokeWidth="3.5" />
              {[0, 1, 2].map((r) =>
                [0, 1, 2].map((c) => (
                  <rect
                    key={`${r}-${c}`}
                    x={11 + c * 42}
                    y={10 + r * 40}
                    width="38"
                    height="36"
                    rx="7"
                    fill={r === c ? '#ffe17c' : '#ffffff'}
                    stroke="#000000"
                    strokeWidth="2.5"
                  />
                ))
              )}

              {/* Bold X Marks */}
              <path d="M21 19 L39 37 M39 19 L21 37" stroke="#171e19" strokeWidth="5.5" strokeLinecap="round" />
              <path d="M63 59 L81 77 M81 59 L63 77" stroke="#171e19" strokeWidth="5.5" strokeLinecap="round" />
              <path d="M105 99 L123 117 M123 99 L105 117" stroke="#171e19" strokeWidth="5.5" strokeLinecap="round" />

              {/* Bold O Marks */}
              <circle cx="114" cy="28" r="10.5" fill="#b7c6c2" stroke="#000000" strokeWidth="3.5" />
              <circle cx="30" cy="108" r="10.5" fill="#b7c6c2" stroke="#000000" strokeWidth="3.5" />

              {/* Strike Beam */}
              <line x1="16" y1="14" x2="128" y2="122" stroke="#000000" strokeWidth="7" strokeLinecap="round" />
              <line x1="16" y1="14" x2="128" y2="122" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            </g>
          </svg>
        )}

        {gameId === 'connect4' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#b7c6c2" />
            {/* Falling Disc Streak Above Rack */}
            <line x1="176" y1="0" x2="176" y2="20" stroke="#000000" strokeWidth="3" strokeDasharray="4 3" />
            <circle cx="176" cy="18" r="10" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />

            {/* Rack Shadow & Stand */}
            <rect x="64" y="28" width="198" height="122" rx="14" fill="#000000" />
            <rect x="60" y="24" width="198" height="122" rx="14" fill="#171e19" stroke="#000000" strokeWidth="3.5" />

            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2, 3, 4, 5].map((c) => {
                const cx = 84 + c * 30;
                const cy = 42 + r * 28.5;
                let fill = '#0c100d';
                const isWin = r === 3 - (c - 1) && c >= 1 && c <= 4;
                if (isWin) fill = '#ffe17c';
                else if ((r === 3 && (c === 2 || c === 3)) || (r === 2 && c === 3) || (r === 1 && c === 1)) {
                  fill = '#b7c6c2';
                } else if (r === 3 && c === 5) {
                  fill = '#ffe17c';
                }
                return (
                  <g key={`${r}-${c}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="11"
                      fill={fill}
                      stroke={isWin ? '#ffffff' : '#000000'}
                      strokeWidth={isWin ? '2.5' : '2'}
                    />
                    {isWin && (
                      <circle cx={cx} cy={cy} r="5.5" fill="none" stroke="#000000" strokeWidth="1.8" />
                    )}
                  </g>
                );
              })
            )}
          </svg>
        )}

        {gameId === 'checkers' && (
          <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <rect width="320" height="160" fill="#ffe17c" />
            <g transform="translate(56, 12)">
              <rect x="5" y="5" width="208" height="136" rx="10" fill="#000000" />
              <clipPath id="chk-clip">
                <rect x="0" y="0" width="208" height="136" rx="10" />
              </clipPath>
              <g clipPath="url(#chk-clip)">
                {[0, 1, 2, 3].map((r) =>
                  [0, 1, 2, 3, 4, 5].map((c) => (
                    <rect
                      key={`${r}-${c}`}
                      x={c * 34.67}
                      y={r * 34}
                      width="35"
                      height="34"
                      fill={(r + c) % 2 === 0 ? '#f4f4f5' : '#2c352e'}
                    />
                  ))
                )}
              </g>
              <rect x="0" y="0" width="208" height="136" rx="10" fill="none" stroke="#000000" strokeWidth="3.5" />

              {/* Enemy Sage Discs */}
              <circle cx="54" cy="19" r="12" fill="#000000" />
              <circle cx="52" cy="17" r="12" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
              <circle cx="123" cy="53" r="12" fill="#000000" />
              <circle cx="121" cy="51" r="12" fill="#b7c6c2" stroke="#000000" strokeWidth="2.5" />
              <circle cx="121" cy="51" r="7" fill="none" stroke="#000000" strokeOpacity="0.45" strokeWidth="2" />

              {/* Curved Capture Jump Arc */}
              <path d="M88 84 Q118 22 156 18" fill="none" stroke="#ffe17c" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />

              {/* King Checker Leaping with Crown */}
              <g transform="translate(156, 19)">
                <circle cx="3" cy="3" r="13" fill="#000000" />
                <circle cx="0" cy="0" r="13" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
                <polygon
                  points="-6,4 -7,-3 -3,0 0,-5 3,0 7,-3 6,4"
                  fill="#171e19"
                  stroke="#000000"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </g>

              {/* Hero Disc */}
              <circle cx="88" cy="87" r="12" fill="#000000" />
              <circle cx="86" cy="85" r="12" fill="#ffe17c" stroke="#000000" strokeWidth="2.5" />
              <circle cx="86" cy="85" r="7" fill="none" stroke="#000000" strokeOpacity="0.45" strokeWidth="2" />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
};
