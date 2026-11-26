import React from 'react';
import { GameComponentProps, GameId, GameMeta } from '../types/arcade';
import { ChessGame } from './chess/ChessGame';
import { CarromGame } from './carrom/CarromGame';
import { HeadballGame } from './headball/HeadballGame';
import { FootballGame } from './football/FootballGame';
import { RacingGame } from './racing/RacingGame';
import { AirHockeyGame } from './airhockey/AirHockeyGame';

export interface RegisteredGame {
  meta: GameMeta;
  Component: React.FC<GameComponentProps>;
}

export const GAME_REGISTRY: RegisteredGame[] = [
  {
    meta: {
      id: 'racing',
      name: 'Street Dash Racing',
      subtitle: 'Fast 4-lane highway sprint to 1200m. Dodge traffic, grab boost stars, and hit Turbo!',
      genre: 'Arcade Racing',
      playStyle: 'Live Online',
      durationHint: '30–45 sec',
      controlsSummary: {
        p1Label: 'Car #1',
        p1Controls: [
          'A / D or ← / → — Steer Left & Right across 4 lanes',
          'W / ↑ — Full Gas · S / ↓ — Brake · Space / Shift — Turbo Boost',
          'On mobile: Use Left / Right, Brake, Turbo & Gas touch buttons.',
        ],
        p2Label: 'Car #2',
        p2Controls: [
          'A / D or ← / → — Steer Left & Right across 4 lanes',
          'W / ↑ — Full Gas · S / ↓ — Brake · Space / Shift — Turbo Boost',
          'On mobile: Use Left / Right, Brake, Turbo & Gas touch buttons.',
        ],
        rules: [
          'Sprint down the 4-lane highway and cross the 1200m checkered finish line first.',
          'Collect yellow Turbo Stars for extra boost and weave around traffic cars, cones, and oil slicks.',
        ],
      },
    },
    Component: RacingGame,
  },
  {
    meta: {
      id: 'airhockey',
      name: 'Smash Air Hockey',
      subtitle: 'Lightning-fast neon air hockey table. Drag or smash your way to 7 goals.',
      genre: 'Table Arcade',
      playStyle: 'Live Online',
      durationHint: '1–2 min',
      controlsSummary: {
        p1Label: 'Left Half',
        p1Controls: [
          'Drag anywhere on the left half with Mouse or Touch.',
          'Keyboard fallback: WASD or Arrow Keys.',
        ],
        p2Label: 'Right Half',
        p2Controls: [
          'Drag anywhere on the right half with Mouse or Touch.',
          'Keyboard fallback: WASD or Arrow Keys.',
        ],
        rules: [
          'First player to score 7 goals wins the match.',
          'Keep your mallet inside your half and bank shots off the side walls.',
        ],
      },
    },
    Component: AirHockeyGame,
  },
  {
    meta: {
      id: 'headball',
      name: 'Headball',
      subtitle: 'Snappy 1v1 side-view arcade soccer with power-ups and Golden Goal overtime.',
      genre: 'Arcade Sports',
      playStyle: 'Live Online',
      durationHint: '90 sec',
      controlsSummary: {
        p1Label: 'Left Goal',
        p1Controls: [
          'A / D or ← / → — Run · W / ↑ — Jump · Space / Enter — Kick',
          'On mobile: Use Left / Right / Jump / Kick touch buttons.',
        ],
        p2Label: 'Right Goal',
        p2Controls: [
          'A / D or ← / → — Run · W / ↑ — Jump · Space / Enter — Kick',
          'On mobile: Use Left / Right / Jump / Kick touch buttons.',
        ],
        rules: [
          'Score the most goals in 90 seconds; ties enter Golden Goal overtime.',
          'Hit floating orbs for Giant Goal, Speed Boost, or Freeze Opponent.',
        ],
      },
    },
    Component: HeadballGame,
  },
  {
    meta: {
      id: 'football',
      name: 'Football',
      subtitle: 'Fast top-down 2D soccer pitch with close dribbling, power shots, and keepers.',
      genre: 'Top-Down Soccer',
      playStyle: 'Live Online',
      durationHint: '90 sec',
      controlsSummary: {
        p1Label: 'Left Side',
        p1Controls: [
          'W A S D or Arrows — Move & Dribble · Shift — Sprint',
          'Space / Enter — Shoot (Hold to Charge)',
          'On mobile: Use the on-screen D-Pad + Sprint & Shoot buttons.',
        ],
        p2Label: 'Right Side',
        p2Controls: [
          'W A S D or Arrows — Move & Dribble · Shift — Sprint',
          'Space / Enter — Shoot (Hold to Charge)',
          'On mobile: Use the on-screen D-Pad + Sprint & Shoot buttons.',
        ],
        rules: [
          'Approach the ball to dribble smoothly, then tap or charge Shoot to beat the keeper.',
          'Tied scores at 0:00 enter sudden-death Golden Goal overtime.',
        ],
      },
    },
    Component: FootballGame,
  },
  {
    meta: {
      id: 'carrom',
      name: 'Carrom',
      subtitle: '2D physics striker board with smooth rebounds and Red Queen cover rule.',
      genre: 'Board Physics',
      playStyle: 'Online Turn-Based',
      durationHint: '5–12 min',
      controlsSummary: {
        p1Label: 'White Coins · Bottom',
        p1Controls: [
          'Use the slider or tap your baseline to position the striker.',
          'Pull back from the striker to aim & set shot power, then release.',
        ],
        p2Label: 'Black Coins · Top',
        p2Controls: [
          'Slide the striker along the top baseline on Side 2’s turn.',
          'Drag backward from the striker to aim downward or bank off rails.',
        ],
        rules: [
          'Pocket your own coins to keep shooting.',
          'Pocketing the Red Queen requires covering it with your own coin on the same or next shot.',
          'Pocketing the striker is a foul: turn passes and 1 pocketed coin returns to center.',
        ],
      },
    },
    Component: CarromGame,
  },
  {
    meta: {
      id: 'chess',
      name: 'Chess',
      subtitle: 'Classic 8×8 strategy with full castling, en passant, and promotion rules.',
      genre: 'Strategy',
      playStyle: 'Online Turn-Based',
      durationHint: '10–25 min',
      controlsSummary: {
        p1Label: 'White Pieces',
        p1Controls: [
          'Click or tap any white piece on White’s turn to highlight legal moves.',
          'Click a highlighted square to slide the piece or Flip View anytime.',
        ],
        p2Label: 'Black Pieces',
        p2Controls: [
          'The board automatically faces Black for Side 2.',
          'Click or tap a black piece on Black’s turn to move or capture.',
        ],
        rules: [
          'Standard FIDE rules: castling, en passant, pawn promotion, checkmate, and stalemate.',
          '50-move rule and insufficient material draws are detected automatically.',
        ],
      },
    },
    Component: ChessGame,
  },
];

export const getGameById = (id: GameId): RegisteredGame | undefined =>
  GAME_REGISTRY.find((g) => g.meta.id === id);
