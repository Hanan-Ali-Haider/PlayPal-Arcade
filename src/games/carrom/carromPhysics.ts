export type CoinTeam = 'white' | 'black' | 'queen' | 'striker';

export interface CarromDisc {
  id: string;
  team: CoinTeam;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  pocketed: boolean;
  sinking?: {
    px: number;
    py: number;
    progress: number;
  };
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export const BOARD_SIZE = 700;
export const WALL_THICKNESS = 46;
export const PLAY_MIN = WALL_THICKNESS;
export const PLAY_MAX = BOARD_SIZE - WALL_THICKNESS;
export const CENTER = BOARD_SIZE / 2;

export const COIN_RADIUS = 14.5;
export const STRIKER_RADIUS = 19.5;
export const POCKET_RADIUS = 23.5;

export const POCKETS = [
  { x: PLAY_MIN + 22, y: PLAY_MIN + 22 },
  { x: PLAY_MAX - 22, y: PLAY_MIN + 22 },
  { x: PLAY_MIN + 22, y: PLAY_MAX - 22 },
  { x: PLAY_MAX - 22, y: PLAY_MAX - 22 },
];

export const BASELINE_Y_P1 = PLAY_MAX - 92; // Bottom baseline
export const BASELINE_Y_P2 = PLAY_MIN + 92; // Top baseline
export const BASELINE_X_MIN = PLAY_MIN + 102;
export const BASELINE_X_MAX = PLAY_MAX - 102;

export const createInitialCarromDiscs = (): CarromDisc[] => {
  const discs: CarromDisc[] = [];

  // Red Queen at center
  discs.push({
    id: 'queen',
    team: 'queen',
    x: CENTER,
    y: CENTER,
    vx: 0,
    vy: 0,
    radius: COIN_RADIUS,
    mass: 1,
    pocketed: false,
  });

  const gap = COIN_RADIUS * 2 + 1.2;

  // Inner ring of 6 (3 white, 3 black alternating)
  let whiteIdx = 0;
  let blackIdx = 0;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3 - Math.PI / 2;
    const team: CoinTeam = i % 2 === 0 ? 'white' : 'black';
    const id = team === 'white' ? `w-${whiteIdx++}` : `b-${blackIdx++}`;
    discs.push({
      id,
      team,
      x: CENTER + Math.cos(angle) * gap,
      y: CENTER + Math.sin(angle) * gap,
      vx: 0,
      vy: 0,
      radius: COIN_RADIUS,
      mass: 1,
      pocketed: false,
    });
  }

  // Outer ring of 12 (6 white, 6 black)
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6 - Math.PI / 2;
    // Standard Y-pattern outer ring
    const isCorner = i % 2 === 0;
    const dist = isCorner ? gap * 2 : gap * Math.sqrt(3);
    const team: CoinTeam = i % 2 === 0 ? 'white' : 'black';
    const id = team === 'white' ? `w-${whiteIdx++}` : `b-${blackIdx++}`;
    discs.push({
      id,
      team,
      x: CENTER + Math.cos(angle) * dist,
      y: CENTER + Math.sin(angle) * dist,
      vx: 0,
      vy: 0,
      radius: COIN_RADIUS,
      mass: 1,
      pocketed: false,
    });
  }

  return discs;
};

export const findFreeCenterSpot = (discs: CarromDisc[], radius: number): { x: number; y: number } => {
  const candidates: { x: number; y: number }[] = [{ x: CENTER, y: CENTER }];
  for (let ring = 1; ring <= 4; ring++) {
    const d = ring * (radius * 2 + 4);
    for (let a = 0; a < 12; a++) {
      const ang = (a * Math.PI) / 6;
      candidates.push({ x: CENTER + Math.cos(ang) * d, y: CENTER + Math.sin(ang) * d });
    }
  }
  for (const pt of candidates) {
    const overlaps = discs.some(
      (d) =>
        !d.pocketed &&
        !d.sinking &&
        d.team !== 'striker' &&
        Math.hypot(d.x - pt.x, d.y - pt.y) < d.radius + radius + 1
    );
    if (!overlaps) return pt;
  }
  return { x: CENTER, y: CENTER };
};

export const isStrikerPositionValid = (
  discs: CarromDisc[],
  sx: number,
  sy: number
): boolean => {
  return !discs.some(
    (d) =>
      !d.pocketed &&
      !d.sinking &&
      d.team !== 'striker' &&
      Math.hypot(d.x - sx, d.y - sy) < d.radius + STRIKER_RADIUS + 1.5
  );
};

export interface PhysicsStepResult {
  anyMoving: boolean;
  newlyPocketed: CoinTeam[];
  maxCollisionImpact: number;
}

export const stepCarromPhysics = (
  discs: CarromDisc[],
  sparks: SparkParticle[],
  dtScale: number
): PhysicsStepResult => {
  const SUB_STEPS = 4;
  const subDt = dtScale / SUB_STEPS;
  const newlyPocketed: CoinTeam[] = [];
  let maxImpact = 0;

  // Update sinking animations
  for (const d of discs) {
    if (d.sinking && !d.pocketed) {
      d.sinking.progress += 0.09 * dtScale;
      d.x += (d.sinking.px - d.x) * 0.25 * dtScale;
      d.y += (d.sinking.py - d.y) * 0.25 * dtScale;
      if (d.sinking.progress >= 1) {
        d.pocketed = true;
        d.vx = 0;
        d.vy = 0;
      }
    }
  }

  for (let step = 0; step < SUB_STEPS; step++) {
    // Move & friction
    for (const d of discs) {
      if (d.pocketed || d.sinking) continue;
      d.x += d.vx * subDt;
      d.y += d.vy * subDt;

      // Board cushion rebounds
      if (d.x - d.radius < PLAY_MIN) {
        d.x = PLAY_MIN + d.radius;
        d.vx = Math.abs(d.vx) * 0.82;
        maxImpact = Math.max(maxImpact, Math.abs(d.vx));
      } else if (d.x + d.radius > PLAY_MAX) {
        d.x = PLAY_MAX - d.radius;
        d.vx = -Math.abs(d.vx) * 0.82;
        maxImpact = Math.max(maxImpact, Math.abs(d.vx));
      }

      if (d.y - d.radius < PLAY_MIN) {
        d.y = PLAY_MIN + d.radius;
        d.vy = Math.abs(d.vy) * 0.82;
        maxImpact = Math.max(maxImpact, Math.abs(d.vy));
      } else if (d.y + d.radius > PLAY_MAX) {
        d.y = PLAY_MAX - d.radius;
        d.vy = -Math.abs(d.vy) * 0.82;
        maxImpact = Math.max(maxImpact, Math.abs(d.vy));
      }

      // Exponential friction
      const friction = Math.pow(0.984, subDt);
      d.vx *= friction;
      d.vy *= friction;

      if (Math.hypot(d.vx, d.vy) < 0.06) {
        d.vx = 0;
        d.vy = 0;
      }
    }

    // Disc-Disc elastic collisions
    for (let i = 0; i < discs.length; i++) {
      const a = discs[i];
      if (a.pocketed || a.sinking) continue;
      for (let j = i + 1; j < discs.length; j++) {
        const b = discs[j];
        if (b.pocketed || b.sinking) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;

          const totalMass = a.mass + b.mass;
          a.x -= nx * overlap * (b.mass / totalMass);
          a.y -= ny * overlap * (b.mass / totalMass);
          b.x += nx * overlap * (a.mass / totalMass);
          b.y += ny * overlap * (a.mass / totalMass);

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal < 0) {
            const restitution = 0.89;
            const impulse = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);

            a.vx -= (impulse / a.mass) * nx;
            a.vy -= (impulse / a.mass) * ny;
            b.vx += (impulse / b.mass) * nx;
            b.vy += (impulse / b.mass) * ny;

            const impact = Math.abs(velAlongNormal);
            maxImpact = Math.max(maxImpact, impact);

            if (impact > 3.2) {
              const cx = (a.x + b.x) / 2;
              const cy = (a.y + b.y) / 2;
              for (let s = 0; s < 5; s++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = 1 + Math.random() * 2.5;
                sparks.push({
                  x: cx,
                  y: cy,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  life: 1,
                  color: '#FDE68A',
                  size: 2.2,
                });
              }
            }
          }
        }
      }
    }

    // Pocket detection
    for (const d of discs) {
      if (d.pocketed || d.sinking) continue;
      for (const p of POCKETS) {
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist < POCKET_RADIUS - 3) {
          d.sinking = { px: p.x, py: p.y, progress: 0 };
          newlyPocketed.push(d.team);
          const color =
            d.team === 'queen'
              ? '#F43F5E'
              : d.team === 'white'
                ? '#38BDF8'
                : d.team === 'black'
                  ? '#FB923C'
                  : '#F8FAFC';
          for (let s = 0; s < 14; s++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = 1.4 + Math.random() * 3.2;
            sparks.push({
              x: p.x,
              y: p.y,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              life: 1,
              color,
              size: 3,
            });
          }
          break;
        }
      }
    }
  }

  // Update sparks
  for (let i = sparks.length - 1; i >= 0; i--) {
    const sp = sparks[i];
    sp.x += sp.vx * dtScale;
    sp.y += sp.vy * dtScale;
    sp.life -= 0.045 * dtScale;
    if (sp.life <= 0) sparks.splice(i, 1);
  }

  const anyMoving = discs.some(
    (d) =>
      (!d.pocketed && (Math.abs(d.vx) > 0.05 || Math.abs(d.vy) > 0.05)) ||
      (d.sinking && !d.pocketed)
  );

  return { anyMoving, newlyPocketed, maxCollisionImpact: maxImpact };
};
