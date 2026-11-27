import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Handshake, Target } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { useArcade } from '../../state/arcadeStore';
import { GameComponentProps, PlayerId } from '../../types/arcade';
import { sound } from '../../utils/sound';
import { useDeviceMode } from '../../utils/useDeviceMode';

const TW = 1000;
const TH = 540;
const RAIL = 46;
const FELT_L = RAIL;
const FELT_R = TW - RAIL;
const FELT_T = RAIL;
const FELT_B = TH - RAIL;
const BALL_R = 14.5;
const POCKET_R = 26;

const POCKETS = [
  { x: FELT_L + 8, y: FELT_T + 8 },
  { x: TW / 2, y: FELT_T - 2 },
  { x: FELT_R - 8, y: FELT_T + 8 },
  { x: FELT_L + 8, y: FELT_B - 8 },
  { x: TW / 2, y: FELT_B + 2 },
  { x: FELT_R - 8, y: FELT_B - 8 },
];

type BallGroup = 'solids' | 'stripes';

interface PoolBall {
  num: number; // 0 = cue, 1..7 = solids, 8 = eight, 9..15 = stripes
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

const BALL_COLORS: Record<number, string> = {
  0: '#FFFFFF',
  1: '#FFE17C',
  2: '#3B82F6',
  3: '#EF4444',
  4: '#8B5CF6',
  5: '#F97316',
  6: '#10B981',
  7: '#991B1B',
  8: '#111111',
  9: '#FFE17C',
  10: '#3B82F6',
  11: '#EF4444',
  12: '#8B5CF6',
  13: '#F97316',
  14: '#10B981',
  15: '#991B1B',
};

function createRackedBalls(): PoolBall[] {
  const balls: PoolBall[] = [
    { num: 0, x: 260, y: TH / 2, vx: 0, vy: 0, pocketed: false, color: BALL_COLORS[0] },
  ];

  // Classic 8-ball triangle rack order with 8 in center and one solid + one stripe in back corners
  const rackNums = [
    1,
    9, 2,
    3, 8, 10,
    11, 4, 12, 5,
    6, 13, 14, 7, 15,
  ];
  const apexX = 685;
  const apexY = TH / 2;
  const dx = BALL_R * Math.sqrt(3) + 1.1;
  const dy = BALL_R * 2 + 1.1;

  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const num = rackNums[idx++];
      const x = apexX + row * dx;
      const y = apexY + (col - row / 2) * dy;
      balls.push({
        num,
        x,
        y,
        vx: 0,
        vy: 0,
        pocketed: false,
        color: BALL_COLORS[num],
      });
    }
  }
  return balls;
}

function ballGroupOf(num: number): BallGroup | 'eight' | 'cue' {
  if (num === 0) return 'cue';
  if (num === 8) return 'eight';
  return num >= 1 && num <= 7 ? 'solids' : 'stripes';
}

export const PoolGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const { voteDraw } = useArcade();
  const device = useDeviceMode();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ballsRef = useRef<PoolBall[]>(createRackedBalls());
  const turnRef = useRef<PlayerId>('p1');
  const phaseRef = useRef<'AIM' | 'SHOOTING'>('AIM');
  const ballInHandRef = useRef<boolean>(false);
  const groupsRef = useRef<{ p1: BallGroup | null; p2: BallGroup | null }>({ p1: null, p2: null });
  const shotPocketedRef = useRef<number[]>([]);
  const firstHitNumRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const aimAngleRef = useRef<number>(0);
  const dragAimRef = useRef<{ active: boolean; power: number }>({ active: false, power: 0 });
  const seqRef = useRef<number>(0);
  const endedRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const localShotOwnerRef = useRef<boolean>(false);

  const [turn, setTurn] = useState<PlayerId>('p1');
  const [phase, setPhase] = useState<'AIM' | 'SHOOTING'>('AIM');
  const [ballInHand, setBallInHand] = useState(false);
  const [groups, setGroups] = useState<{ p1: BallGroup | null; p2: BallGroup | null }>({
    p1: null,
    p2: null,
  });
  const [statusMsg, setStatusMsg] = useState(`${p1.name} breaks first!`);
  const [pocketedList, setPocketedList] = useState<number[]>([]);
  const [sliderPower, setSliderPower] = useState(0);

  const isMyShot = online.mySide === turn && phase === 'AIM' && !endedRef.current;

  const publishPoolSync = useCallback(
    (payload: Record<string, unknown>) => {
      const nextSeq = seqRef.current + 1;
      seqRef.current = nextSeq;
      const path = `rooms/${online.roomCode}/sync/pool`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'pool'), {
        docId: 'pool',
        gameId: `pool_${matchSeed}`,
        seq: nextSeq,
        updatedByUid: online.myUid,
        payload: { seed: matchSeed, ...payload },
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    },
    [matchSeed, online.myUid, online.roomCode]
  );

  // Reset match on matchSeed
  useEffect(() => {
    ballsRef.current = createRackedBalls();
    turnRef.current = 'p1';
    phaseRef.current = 'AIM';
    ballInHandRef.current = false;
    groupsRef.current = { p1: null, p2: null };
    shotPocketedRef.current = [];
    firstHitNumRef.current = null;
    particlesRef.current = [];
    aimAngleRef.current = 0;
    dragAimRef.current = { active: false, power: 0 };
    seqRef.current = 0;
    endedRef.current = false;
    localShotOwnerRef.current = false;
    startTimeRef.current = Date.now();

    setTurn('p1');
    setPhase('AIM');
    setBallInHand(false);
    setGroups({ p1: null, p2: null });
    setPocketedList([]);
    setSliderPower(0);
    setStatusMsg(`${p1.name} breaks first!`);

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/pool`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'pool'), {
        docId: 'pool',
        gameId: `pool_${matchSeed}`,
        seq: 0,
        updatedByUid: online.myUid,
        payload: { kind: 'init', seed: matchSeed },
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, [matchSeed, online.isHost, online.myUid, online.roomCode, p1.name]);

  // Listen to opponent pool shots & settled state
  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/pool`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'pool'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const payload = d.payload as {
          seed?: number;
          kind?: string;
          cx?: number;
          cy?: number;
          vx?: number;
          vy?: number;
          shotTurn?: PlayerId;
          balls?: { num: number; x: number; y: number; pocketed: boolean }[];
          nextTurn?: PlayerId;
          nextBallInHand?: boolean;
          p1Group?: BallGroup | null;
          p2Group?: BallGroup | null;
          banner?: string;
        };
        if (payload?.seed !== matchSeed) return;
        if (d.updatedByUid === online.myUid) return;
        if (d.seq <= seqRef.current) return;
        seqRef.current = d.seq;

        if (payload.kind === 'shot' && payload.vx !== undefined && payload.vy !== undefined) {
          const cue = ballsRef.current.find((b) => b.num === 0);
          if (cue) {
            cue.pocketed = false;
            cue.x = payload.cx ?? cue.x;
            cue.y = payload.cy ?? cue.y;
            cue.vx = payload.vx;
            cue.vy = payload.vy;
          }
          localShotOwnerRef.current = false;
          turnRef.current = payload.shotTurn ?? turnRef.current;
          shotPocketedRef.current = [];
          firstHitNumRef.current = null;
          phaseRef.current = 'SHOOTING';
          setTurn(turnRef.current);
          setPhase('SHOOTING');
          setBallInHand(false);
          ballInHandRef.current = false;
          sound.playKick(0.9);
        } else if (payload.kind === 'settled' && Array.isArray(payload.balls)) {
          for (const sb of payload.balls) {
            const target = ballsRef.current.find((b) => b.num === sb.num);
            if (target) {
              target.x = sb.x;
              target.y = sb.y;
              target.vx = 0;
              target.vy = 0;
              target.pocketed = sb.pocketed;
            }
          }
          if (payload.nextTurn) {
            turnRef.current = payload.nextTurn;
            setTurn(payload.nextTurn);
          }
          ballInHandRef.current = Boolean(payload.nextBallInHand);
          setBallInHand(Boolean(payload.nextBallInHand));
          groupsRef.current = {
            p1: payload.p1Group ?? null,
            p2: payload.p2Group ?? null,
          };
          setGroups(groupsRef.current);
          phaseRef.current = 'AIM';
          setPhase('AIM');
          setPocketedList(ballsRef.current.filter((b) => b.num !== 0 && b.pocketed).map((b) => b.num));
          if (payload.banner) setStatusMsg(payload.banner);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [matchSeed, online.myUid, online.roomCode]);

  const finishMatch = useCallback(
    (winnerSide: PlayerId, reason: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const winner = winnerSide === 'p1' ? p1 : p2;
      const p1Pocketed =
        groupsRef.current.p1 === 'solids'
          ? ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && b.pocketed).length
          : groupsRef.current.p1 === 'stripes'
            ? ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && b.pocketed).length
            : 0;
      const p2Pocketed =
        groupsRef.current.p2 === 'solids'
          ? ballsRef.current.filter((b) => b.num >= 1 && b.num <= 7 && b.pocketed).length
          : groupsRef.current.p2 === 'stripes'
            ? ballsRef.current.filter((b) => b.num >= 9 && b.num <= 15 && b.pocketed).length
            : 0;

      onMatchEnd({
        winner: winnerSide,
        scoreLabel: `${p1.name} ${p1Pocketed}/7 — ${p2Pocketed}/7 ${p2.name}`,
        summary: `${winner.name} won 8-Ball Pool (${reason})!`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
    },
    [onMatchEnd, p1, p2]
  );

  const settleShot = useCallback(() => {
    const shooter = turnRef.current;
    const opp: PlayerId = shooter === 'p1' ? 'p2' : 'p1';
    const shooterName = shooter === 'p1' ? p1.name : p2.name;
    const oppName = opp === 'p1' ? p1.name : p2.name;
    const potted = shotPocketedRef.current;

    const cueScratched = potted.includes(0);
    const eightPotted = potted.includes(8);

    const cue = ballsRef.current.find((b) => b.num === 0);
    if (cue && cue.pocketed) {
      cue.pocketed = false;
      cue.x = 260;
      cue.y = TH / 2;
      cue.vx = 0;
      cue.vy = 0;
    }

    // Check remaining balls of shooter's group BEFORE counting this turn's 8-ball
    const myGroup = groupsRef.current[shooter];
    const remainingMyGroup = myGroup
      ? ballsRef.current.filter(
          (b) => !b.pocketed && ballGroupOf(b.num) === myGroup
        ).length
      : 7;

    if (eightPotted) {
      if (myGroup && remainingMyGroup === 0 && !cueScratched) {
        finishMatch(shooter, 'legally pocketed the 8-ball');
      } else {
        finishMatch(
          opp,
          cueScratched
            ? `${shooterName} scratched on the 8-ball`
            : `${shooterName} pocketed the 8-ball early`
        );
      }
      return;
    }

    // Assign groups on first legal object ball potted (when table is open)
    let assignedMsg = '';
    if (!groupsRef.current.p1 && !groupsRef.current.p2 && !cueScratched) {
      const firstObj = potted.find((n) => n !== 0 && n !== 8);
      if (firstObj) {
        const g = ballGroupOf(firstObj) as BallGroup;
        const otherG: BallGroup = g === 'solids' ? 'stripes' : 'solids';
        groupsRef.current = shooter === 'p1' ? { p1: g, p2: otherG } : { p1: otherG, p2: g };
        setGroups(groupsRef.current);
        assignedMsg = `${shooterName} claimed ${g.toUpperCase()}! `;
      }
    }

    const updatedGroup = groupsRef.current[shooter];
    const firstHitGroup = firstHitNumRef.current ? ballGroupOf(firstHitNumRef.current) : null;
    const wrongFirstHit =
      firstHitNumRef.current === null ||
      (updatedGroup !== null &&
        firstHitGroup !== updatedGroup &&
        !(remainingMyGroup === 0 && firstHitGroup === 'eight'));

    const foul = cueScratched || wrongFirstHit;
    const pottedOwn = updatedGroup
      ? potted.some((n) => ballGroupOf(n) === updatedGroup)
      : potted.some((n) => n !== 0 && n !== 8);

    let nextTurn = shooter;
    let nextBallInHand = false;
    let banner = '';

    if (foul) {
      nextTurn = opp;
      nextBallInHand = true;
      banner = cueScratched
        ? `Scratch! ${oppName} gets Ball-in-Hand`
        : `Foul! ${oppName} gets Ball-in-Hand`;
      sound.playFoul();
    } else if (pottedOwn) {
      nextTurn = shooter;
      banner = `${assignedMsg}Nice shot! ${shooterName} shoots again`;
    } else {
      nextTurn = opp;
      banner = `${oppName}'s turn`;
    }

    turnRef.current = nextTurn;
    ballInHandRef.current = nextBallInHand;
    phaseRef.current = 'AIM';

    setTurn(nextTurn);
    setBallInHand(nextBallInHand);
    setPhase('AIM');
    setStatusMsg(banner);
    setPocketedList(ballsRef.current.filter((b) => b.num !== 0 && b.pocketed).map((b) => b.num));

    if (localShotOwnerRef.current) {
      localShotOwnerRef.current = false;
      publishPoolSync({
        kind: 'settled',
        balls: ballsRef.current.map((b) => ({
          num: b.num,
          x: Math.round(b.x * 100) / 100,
          y: Math.round(b.y * 100) / 100,
          pocketed: b.pocketed,
        })),
        nextTurn,
        nextBallInHand,
        p1Group: groupsRef.current.p1,
        p2Group: groupsRef.current.p2,
        banner,
      });
    }
  }, [finishMatch, p1.name, p2.name, publishPoolSync]);

  // Physics + Render Loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dtSec = Math.min(0.032, (now - last) / 1000);
      last = now;
      const dt = dtSec * 60;

      if (phaseRef.current === 'SHOOTING') {
        const subSteps = 3;
        const subDt = dt / subSteps;
        const balls = ballsRef.current;

        for (let step = 0; step < subSteps; step++) {
          for (const b of balls) {
            if (b.pocketed) continue;
            b.x += b.vx * subDt;
            b.y += b.vy * subDt;
            const fric = Math.pow(0.988, subDt);
            b.vx *= fric;
            b.vy *= fric;
            if (Math.hypot(b.vx, b.vy) < 0.045) {
              b.vx = 0;
              b.vy = 0;
            }

            // Pocket check
            let dropped = false;
            for (const pk of POCKETS) {
              if (Math.hypot(b.x - pk.x, b.y - pk.y) < POCKET_R) {
                b.pocketed = true;
                b.vx = 0;
                b.vy = 0;
                shotPocketedRef.current.push(b.num);
                sound.playPocket();
                for (let k = 0; k < 12; k++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = 1 + Math.random() * 3.5;
                  particlesRef.current.push({
                    x: pk.x,
                    y: pk.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    color: b.num === 0 ? '#FFFFFF' : b.color,
                    life: 1,
                  });
                }
                dropped = true;
                break;
              }
            }
            if (dropped) continue;

            // Cushion rebounds (skip pocket mouth zones slightly so balls drop cleanly)
            const nearCornerX = b.x < FELT_L + 26 || b.x > FELT_R - 26;
            const nearSidePocket = Math.abs(b.x - TW / 2) < 22;

            if (b.x - BALL_R < FELT_L && Math.abs(b.y - FELT_T) > 24 && Math.abs(b.y - FELT_B) > 24) {
              b.x = FELT_L + BALL_R;
              b.vx = Math.abs(b.vx) * 0.84;
              sound.playWoodHit(0.35);
            } else if (
              b.x + BALL_R > FELT_R &&
              Math.abs(b.y - FELT_T) > 24 &&
              Math.abs(b.y - FELT_B) > 24
            ) {
              b.x = FELT_R - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.84;
              sound.playWoodHit(0.35);
            }

            if (b.y - BALL_R < FELT_T && !nearCornerX && !nearSidePocket) {
              b.y = FELT_T + BALL_R;
              b.vy = Math.abs(b.vy) * 0.84;
              sound.playWoodHit(0.35);
            } else if (b.y + BALL_R > FELT_B && !nearCornerX && !nearSidePocket) {
              b.y = FELT_B - BALL_R;
              b.vy = -Math.abs(b.vy) * 0.84;
              sound.playWoodHit(0.35);
            }
          }

          // Ball-to-ball elastic collisions
          for (let i = 0; i < balls.length; i++) {
            const a = balls[i];
            if (a.pocketed) continue;
            for (let j = i + 1; j < balls.length; j++) {
              const b = balls[j];
              if (b.pocketed) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy);
              const minD = BALL_R * 2;
              if (dist < minD && dist > 0.0001) {
                if (firstHitNumRef.current === null) {
                  if (a.num === 0) firstHitNumRef.current = b.num;
                  else if (b.num === 0) firstHitNumRef.current = a.num;
                }
                const nx = dx / dist;
                const ny = dy / dist;
                const overlap = minD - dist;
                a.x -= nx * overlap * 0.5;
                a.y -= ny * overlap * 0.5;
                b.x += nx * overlap * 0.5;
                b.y += ny * overlap * 0.5;

                const rvx = a.vx - b.vx;
                const rvy = a.vy - b.vy;
                const velAlong = rvx * nx + rvy * ny;
                if (velAlong > 0) {
                  const imp = velAlong * 0.96;
                  a.vx -= imp * nx;
                  a.vy -= imp * ny;
                  b.vx += imp * nx;
                  b.vy += imp * ny;
                  if (velAlong > 0.9) sound.playWoodHit(Math.min(1.2, 0.35 + velAlong / 12));
                }
              }
            }
          }
        }

        const anyMoving = balls.some((b) => !b.pocketed && (b.vx !== 0 || b.vy !== 0));
        if (!anyMoving) {
          settleShot();
        }
      }

      // Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= 0.03 * dt;
        if (pt.life <= 0) particlesRef.current.splice(i, 1);
      }

      // Render Table
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        // Outer Charcoal Frame + Corner Brass Accents
        ctx.fillStyle = '#171E19';
        ctx.fillRect(0, 0, TW, TH);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, TW - 6, TH - 6);

        // Rail Diamonds
        ctx.fillStyle = '#FFE17C';
        for (let i = 1; i <= 3; i++) {
          const x1 = FELT_L + ((TW / 2 - FELT_L) * i) / 4;
          const x2 = TW / 2 + ((FELT_R - TW / 2) * i) / 4;
          for (const x of [x1, x2]) {
            ctx.fillRect(x - 3, 18, 6, 6);
            ctx.fillRect(x - 3, TH - 24, 6, 6);
          }
          const y = FELT_T + ((FELT_B - FELT_T) * i) / 4;
          ctx.fillRect(18, y - 3, 6, 6);
          ctx.fillRect(TW - 24, y - 3, 6, 6);
        }

        // Rich Tournament Green Felt
        ctx.fillStyle = '#14533D';
        ctx.fillRect(FELT_L, FELT_T, FELT_R - FELT_L, FELT_B - FELT_T);
        ctx.strokeStyle = '#0D3B2B';
        ctx.lineWidth = 5;
        ctx.strokeRect(FELT_L, FELT_T, FELT_R - FELT_L, FELT_B - FELT_T);

        // Head String Line & Foot Spot
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(260, FELT_T);
        ctx.lineTo(260, FELT_B);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.arc(685, TH / 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // 6 Pockets
        for (const pk of POCKETS) {
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(pk.x, pk.y, POCKET_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFE17C';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Aiming Trajectory & Ghost Ball Preview
        const cue = ballsRef.current.find((b) => b.num === 0);
        if (cue && !cue.pocketed && phaseRef.current === 'AIM' && online.mySide === turnRef.current) {
          const ang = aimAngleRef.current;
          const dx = Math.cos(ang);
          const dy = Math.sin(ang);

          // Raycast closest ball or rail hit
          let minT = 800;
          let hitBall = false;

          for (const b of ballsRef.current) {
            if (b.num === 0 || b.pocketed) continue;
            const ocX = b.x - cue.x;
            const ocY = b.y - cue.y;
            const proj = ocX * dx + ocY * dy;
            if (proj <= 0) continue;
            const perpSq = ocX * ocX + ocY * ocY - proj * proj;
            const radSum = BALL_R * 2;
            if (perpSq < radSum * radSum) {
              const t = proj - Math.sqrt(radSum * radSum - perpSq);
              if (t > 0 && t < minT) {
                minT = t;
                hitBall = true;
              }
            }
          }

          // Clamp to felt boundary
          if (dx > 0.001) minT = Math.min(minT, (FELT_R - BALL_R - cue.x) / dx);
          if (dx < -0.001) minT = Math.min(minT, (FELT_L + BALL_R - cue.x) / dx);
          if (dy > 0.001) minT = Math.min(minT, (FELT_B - BALL_R - cue.y) / dy);
          if (dy < -0.001) minT = Math.min(minT, (FELT_T + BALL_R - cue.y) / dy);

          const gx = cue.x + dx * minT;
          const gy = cue.y + dy * minT;

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 225, 124, 0.85)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(cue.x, cue.y);
          ctx.lineTo(gx, gy);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.strokeStyle = hitBall ? '#FFE17C' : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gx, gy, BALL_R, 0, Math.PI * 2);
          ctx.stroke();

          // Cue Stick behind cue ball
          const pullPx = 22 + dragAimRef.current.power * 75;
          const sx1 = cue.x - dx * pullPx;
          const sy1 = cue.y - dy * pullPx;
          const sx2 = cue.x - dx * (pullPx + 180);
          const sy2 = cue.y - dy * (pullPx + 180);

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 10;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();

          ctx.strokeStyle = '#FFE17C';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();

          // Cue Tip
          ctx.strokeStyle = '#B7C6C2';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx1 - dx * 8, sy1 - dy * 8);
          ctx.stroke();
          ctx.restore();
        }

        // Draw 16 Balls
        for (const b of ballsRef.current) {
          if (b.pocketed) continue;
          ctx.save();
          ctx.translate(b.x, b.y);

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.arc(2.5, 3, BALL_R, 0, Math.PI * 2);
          ctx.fill();

          if (b.num >= 9) {
            // Striped ball: white base + colored center band
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = b.color;
            ctx.fillRect(-BALL_R, -BALL_R * 0.56, BALL_R * 2, BALL_R * 1.12);
            ctx.restore();
          } else {
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
          ctx.stroke();

          if (b.num > 0) {
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.font = '800 8.5px Satoshi, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(b.num), 0, 0.5);
          } else if (ballInHandRef.current && phaseRef.current === 'AIM') {
            ctx.strokeStyle = '#FFE17C';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, BALL_R + 5, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        }

        // Particles
        for (const pt of particlesRef.current) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.life);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [online.mySide, settleShot]);

  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (TW / rect.width),
      y: (e.clientY - rect.top) * (TH / rect.height),
    };
  };

  const fireShot = (powerNorm: number) => {
    const cue = ballsRef.current.find((b) => b.num === 0);
    if (!cue || phaseRef.current !== 'AIM' || online.mySide !== turnRef.current || powerNorm < 0.08) {
      return;
    }
    const speed = 4 + powerNorm * 22;
    const ang = aimAngleRef.current;
    cue.vx = Math.cos(ang) * speed;
    cue.vy = Math.sin(ang) * speed;

    localShotOwnerRef.current = true;
    shotPocketedRef.current = [];
    firstHitNumRef.current = null;
    ballInHandRef.current = false;
    setBallInHand(false);
    phaseRef.current = 'SHOOTING';
    setPhase('SHOOTING');
    sound.playKick(0.6 + powerNorm * 0.6);

    publishPoolSync({
      kind: 'shot',
      cx: Math.round(cue.x * 100) / 100,
      cy: Math.round(cue.y * 100) / 100,
      vx: Math.round(cue.vx * 1000) / 1000,
      vy: Math.round(cue.vy * 1000) / 1000,
      shotTurn: turnRef.current,
    });
  };

  const pointerModeRef = useRef<'none' | 'slingshot' | 'aim' | 'place'>('none');

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMyShot) return;
    const cue = ballsRef.current.find((b) => b.num === 0);
    if (!cue) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvas(e);

    const distToCue = Math.hypot(pt.x - cue.x, pt.y - cue.y);
    if (ballInHandRef.current && distToCue < 42) {
      pointerModeRef.current = 'place';
      return;
    }

    if (distToCue < 85 && !device.isMobile) {
      pointerModeRef.current = 'slingshot';
      dragAimRef.current = { active: true, power: 0 };
    } else {
      pointerModeRef.current = 'aim';
      aimAngleRef.current = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMyShot || pointerModeRef.current === 'none') return;
    const cue = ballsRef.current.find((b) => b.num === 0);
    if (!cue) return;
    const pt = toCanvas(e);

    if (pointerModeRef.current === 'place') {
      const cx = Math.max(FELT_L + BALL_R + 4, Math.min(FELT_R - BALL_R - 4, pt.x));
      const cy = Math.max(FELT_T + BALL_R + 4, Math.min(FELT_B - BALL_R - 4, pt.y));
      const overlaps = ballsRef.current.some(
        (b) => b.num !== 0 && !b.pocketed && Math.hypot(b.x - cx, b.y - cy) < BALL_R * 2.1
      );
      if (!overlaps) {
        cue.x = cx;
        cue.y = cy;
      }
      return;
    }

    if (pointerModeRef.current === 'slingshot') {
      const dx = cue.x - pt.x;
      const dy = cue.y - pt.y;
      const pull = Math.hypot(dx, dy);
      if (pull > 10) {
        aimAngleRef.current = Math.atan2(dy, dx);
      }
      const pwr = Math.min(1, Math.max(0, (pull - 12) / 145));
      dragAimRef.current = { active: true, power: pwr };
      setSliderPower(Math.round(pwr * 100));
    } else if (pointerModeRef.current === 'aim') {
      aimAngleRef.current = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    }
  };

  const handlePointerUp = () => {
    if (pointerModeRef.current === 'slingshot') {
      const pwr = dragAimRef.current.power;
      dragAimRef.current = { active: false, power: 0 };
      setSliderPower(0);
      if (pwr >= 0.08) {
        fireShot(pwr);
      }
    }
    pointerModeRef.current = 'none';
  };

  const solidsPocketed = pocketedList.filter((n) => n >= 1 && n <= 7).length;
  const stripesPocketed = pocketedList.filter((n) => n >= 9 && n <= 15).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-3.5 neo-shadow-lg sm:p-5">
        {/* Top Pool HUD */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2.5 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="rounded border-2 border-black bg-[#ffe17c] px-2 py-0.5 font-extrabold text-black">
              {p1.name}
            </span>
            <span className="text-black/75">
              {groups.p1 ? `${groups.p1.toUpperCase()} (${groups.p1 === 'solids' ? solidsPocketed : stripesPocketed}/7)` : 'Open'}
            </span>
          </div>

          <span className="rounded-lg border-2 border-black bg-[#171e19] px-3 py-1 text-xs font-extrabold text-[#ffe17c]">
            {statusMsg}
          </span>

          <div className="flex items-center gap-2">
            <span className="text-black/75">
              {groups.p2 ? `${groups.p2.toUpperCase()} (${groups.p2 === 'solids' ? solidsPocketed : stripesPocketed}/7)` : 'Open'}
            </span>
            <span className="rounded border-2 border-black bg-[#b7c6c2] px-2 py-0.5 font-extrabold text-black">
              {p2.name}
            </span>
          </div>
        </div>

        {/* Billiards Table Canvas */}
        <canvas
          ref={canvasRef}
          width={TW}
          height={TH}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`aspect-[1000/540] w-full touch-none rounded-xl border-2 border-black neo-shadow-sm ${
            isMyShot ? 'cursor-crosshair' : 'cursor-not-allowed'
          }`}
        />

        {/* Touch & Mouse Pull-to-Strike Cue Power Bar */}
        <div className="flex flex-col gap-2 rounded-xl border-2 border-black bg-[#f4f4f5] p-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Target className="h-4 w-4 text-black" />
            <span className="text-xs font-extrabold text-black">
              {ballInHand && isMyShot
                ? 'Drag cue ball to place, aim & pull power:'
                : 'Pull Power & Release to Shoot:'}
            </span>
          </div>
          <div className="flex flex-1 items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPower}
              disabled={!isMyShot}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSliderPower(v);
                dragAimRef.current = { active: v > 0, power: v / 100 };
              }}
              onPointerUp={() => {
                if (sliderPower >= 8 && isMyShot) {
                  const pwr = sliderPower / 100;
                  dragAimRef.current = { active: false, power: 0 };
                  setSliderPower(0);
                  fireShot(pwr);
                } else {
                  dragAimRef.current = { active: false, power: 0 };
                  setSliderPower(0);
                }
              }}
              onTouchEnd={() => {
                if (sliderPower >= 8 && isMyShot) {
                  const pwr = sliderPower / 100;
                  dragAimRef.current = { active: false, power: 0 };
                  setSliderPower(0);
                  fireShot(pwr);
                } else {
                  dragAimRef.current = { active: false, power: 0 };
                  setSliderPower(0);
                }
              }}
              className="h-7 w-full accent-black cursor-pointer disabled:opacity-40"
            />
            <span className="w-11 text-right font-mono-num text-xs font-extrabold text-black">
              {sliderPower}%
            </span>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <div className="border-b-2 border-black pb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-black/60">8-Ball Pool</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-black">
            {isMyShot ? 'Your Shot!' : `${turn === 'p1' ? p1.name : p2.name}'s Shot`}
          </p>
        </div>

        {/* Pocketed Balls Rack */}
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-black">
            Pocketed Balls ({pocketedList.length}/15)
          </p>
          <div className="mt-2 flex min-h-[36px] flex-wrap gap-1.5 rounded-xl border-2 border-black bg-[#f4f4f5] p-2.5">
            {pocketedList.length === 0 ? (
              <span className="text-xs text-black/50">No balls pocketed yet</span>
            ) : (
              pocketedList.map((n) => (
                <span
                  key={n}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-black text-[10px] font-extrabold text-white"
                  style={{
                    backgroundColor: BALL_COLORS[n],
                    color: n === 1 || n === 9 ? '#000000' : '#FFFFFF',
                  }}
                >
                  {n}
                </span>
              ))
            )}
          </div>
        </div>

        {online.opponentJoined && (
          <button
            type="button"
            onClick={() => voteDraw('yes')}
            className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#b7c6c2] px-3 py-2 text-xs font-bold text-black cursor-pointer"
          >
            <Handshake className="h-3.5 w-3.5" />
            Offer Mutual Draw
          </button>
        )}

        <div className="border-t-2 border-black pt-3 text-xs text-black/75 space-y-1.5">
          <p className="font-extrabold text-black">
            {device.isMobile ? 'Mobile Touch Controls' : 'PC & Touch Controls'}
          </p>
          <p>• Tap or drag anywhere on the green table to aim the cue stick.</p>
          <p>• Pull the power slider below and release to shoot (or drag back from cue ball on PC).</p>
          <p>• Clear all 7 of your Solids/Stripes, then sink the 8-Ball to win!</p>
        </div>
      </aside>
    </div>
  );
};
