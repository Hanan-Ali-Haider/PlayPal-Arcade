import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';
import {
  BASELINE_X_MAX,
  BASELINE_X_MIN,
  BASELINE_Y_P1,
  BASELINE_Y_P2,
  BOARD_SIZE,
  CarromDisc,
  CENTER,
  COIN_RADIUS,
  CoinTeam,
  createInitialCarromDiscs,
  findFreeCenterSpot,
  isStrikerPositionValid,
  PLAY_MAX,
  PLAY_MIN,
  POCKET_RADIUS,
  POCKETS,
  SparkParticle,
  stepCarromPhysics,
  STRIKER_RADIUS,
} from './carromPhysics';

type Turn = 'p1' | 'p2';
type Phase = 'AIMING' | 'SHOOTING';

interface SerializedDisc {
  id: string;
  team: CoinTeam;
  x: number;
  y: number;
  pocketed: boolean;
}

export const CarromGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);
  const seqRef = useRef<number>(0);

  const discsRef = useRef<CarromDisc[]>(createInitialCarromDiscs());
  const sparksRef = useRef<SparkParticle[]>([]);
  const turnRef = useRef<Turn>('p1');
  const phaseRef = useRef<Phase>('AIMING');
  const strikerXRef = useRef<number>(CENTER);
  const queenOwnerRef = useRef<Turn | null>(null);
  const queenPendingCoverRef = useRef<Turn | null>(null);
  const shotPocketedRef = useRef<CoinTeam[]>([]);
  const localShooterRef = useRef<boolean>(false);
  const dragRef = useRef<{ active: boolean; curX: number; curY: number }>({
    active: false,
    curX: CENTER,
    curY: CENTER,
  });

  const [turn, setTurn] = useState<Turn>('p1');
  const [phase, setPhase] = useState<Phase>('AIMING');
  const [strikerSlider, setStrikerSlider] = useState<number>(CENTER);
  const [bannerMsg, setBannerMsg] = useState<string>(`${p1.name}'s break — drag striker to shoot!`);
  const [counts, setCounts] = useState({ p1Pocketed: 0, p2Pocketed: 0, queenStatus: 'On Board' });

  const myTurnKey: Turn | null = online.mySide;
  const isMyShot = myTurnKey === turn && phase === 'AIMING' && !endedRef.current;

  const syncCounts = useCallback(() => {
    const discs = discsRef.current;
    const p1Pocketed = discs.filter((d) => d.team === 'white' && d.pocketed).length;
    const p2Pocketed = discs.filter((d) => d.team === 'black' && d.pocketed).length;
    const queen = discs.find((d) => d.team === 'queen');
    let queenStatus = 'On Board';
    if (queen?.pocketed) {
      if (queenOwnerRef.current === 'p1') queenStatus = `Covered by ${p1.name}`;
      else if (queenOwnerRef.current === 'p2') queenStatus = `Covered by ${p2.name}`;
      else if (queenPendingCoverRef.current) queenStatus = 'Pending Cover';
    }
    setCounts({ p1Pocketed, p2Pocketed, queenStatus });
  }, [p1.name, p2.name]);

  const resetMatch = useCallback(() => {
    discsRef.current = createInitialCarromDiscs();
    sparksRef.current = [];
    turnRef.current = 'p1';
    phaseRef.current = 'AIMING';
    strikerXRef.current = CENTER;
    queenOwnerRef.current = null;
    queenPendingCoverRef.current = null;
    shotPocketedRef.current = [];
    localShooterRef.current = false;
    dragRef.current = { active: false, curX: CENTER, curY: CENTER };
    endedRef.current = false;
    seqRef.current = 0;
    startTimeRef.current = Date.now();

    setTurn('p1');
    setPhase('AIMING');
    setStrikerSlider(CENTER);
    setBannerMsg(`${p1.name}'s break — drag striker backward to shoot!`);
    setCounts({ p1Pocketed: 0, p2Pocketed: 0, queenStatus: 'On Board' });

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/carrom`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'carrom'), {
        docId: 'carrom',
        gameId: `carrom_${matchSeed}`,
        seq: 0,
        updatedByUid: online.myUid,
        payload: { seed: matchSeed, kind: 'init' },
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, [matchSeed, online.isHost, online.myUid, online.roomCode, p1.name]);

  useEffect(() => {
    resetMatch();
  }, [resetMatch]);

  // Listen for opponent's shots and settled board snapshots
  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/carrom`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'carrom'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const p = d.payload as {
          seed?: number;
          kind?: 'init' | 'shot' | 'settled';
          sx?: number;
          sy?: number;
          vx?: number;
          vy?: number;
          shotTurn?: Turn;
          discs?: SerializedDisc[];
          nextTurn?: Turn;
          queenOwner?: Turn | '';
          queenPending?: Turn | '';
          banner?: string;
        };
        if (p?.seed !== matchSeed) return;
        if (d.seq <= seqRef.current) return;
        seqRef.current = d.seq;

        if (d.updatedByUid === online.myUid) return;

        if (p.kind === 'shot' && typeof p.sx === 'number' && typeof p.vx === 'number') {
          // Replay opponent's shot locally!
          localShooterRef.current = false;
          turnRef.current = p.shotTurn ?? turnRef.current;
          // Remove any leftover striker
          const existingIdx = discsRef.current.findIndex((x) => x.team === 'striker');
          if (existingIdx !== -1) discsRef.current.splice(existingIdx, 1);

          discsRef.current.push({
            id: 'striker',
            team: 'striker',
            x: p.sx,
            y: p.sy ?? (turnRef.current === 'p1' ? BASELINE_Y_P1 : BASELINE_Y_P2),
            vx: p.vx,
            vy: p.vy ?? 0,
            radius: STRIKER_RADIUS,
            mass: 2.1,
            pocketed: false,
          });
          shotPocketedRef.current = [];
          phaseRef.current = 'SHOOTING';
          setPhase('SHOOTING');
          sound.playKick(1);
        } else if (p.kind === 'settled' && Array.isArray(p.discs)) {
          // Apply authoritative post-shot positions
          discsRef.current = p.discs.map((sd) => ({
            id: sd.id,
            team: sd.team,
            x: sd.x,
            y: sd.y,
            vx: 0,
            vy: 0,
            radius: COIN_RADIUS,
            mass: 1,
            pocketed: sd.pocketed,
          }));
          queenOwnerRef.current = p.queenOwner ? (p.queenOwner as Turn) : null;
          queenPendingCoverRef.current = p.queenPending ? (p.queenPending as Turn) : null;
          turnRef.current = p.nextTurn ?? 'p1';
          phaseRef.current = 'AIMING';
          strikerXRef.current = CENTER;
          setTurn(turnRef.current);
          setPhase('AIMING');
          setStrikerSlider(CENTER);
          if (p.banner) setBannerMsg(p.banner);
          syncCounts();

          // Check win condition on synced state
          const finalWhiteLeft = discsRef.current.filter((x) => x.team === 'white' && !x.pocketed).length;
          const finalBlackLeft = discsRef.current.filter((x) => x.team === 'black' && !x.pocketed).length;
          const queenDisc = discsRef.current.find((x) => x.team === 'queen');
          if (!endedRef.current && (finalWhiteLeft === 0 || finalBlackLeft === 0) && Boolean(queenDisc?.pocketed)) {
            endedRef.current = true;
            const winnerTurn: Turn = finalWhiteLeft === 0 ? 'p1' : 'p2';
            const winnerProfile = winnerTurn === 'p1' ? p1 : p2;
            const p1Points = 9 - finalWhiteLeft + (queenOwnerRef.current === 'p1' ? 3 : 0);
            const p2Points = 9 - finalBlackLeft + (queenOwnerRef.current === 'p2' ? 3 : 0);
            onMatchEnd({
              winner: winnerProfile.id,
              scoreLabel: `${p1.name} ${p1Points} — ${p2Points} ${p2.name}`,
              summary: `${winnerProfile.name} cleared all coins!`,
              durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
            });
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [matchSeed, onMatchEnd, online.myUid, online.roomCode, p1, p2, syncCounts]);

  const publishCarromSync = useCallback(
    (payload: Record<string, unknown>) => {
      const nextSeq = seqRef.current + 1;
      seqRef.current = nextSeq;
      const path = `rooms/${online.roomCode}/sync/carrom`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'carrom'), {
        docId: 'carrom',
        gameId: `carrom_${matchSeed}`,
        seq: nextSeq,
        updatedByUid: online.myUid,
        payload: { seed: matchSeed, ...payload },
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    },
    [matchSeed, online.myUid, online.roomCode]
  );

  const evaluateTurnEnd = useCallback(() => {
    const discs = discsRef.current;
    const currentTurn = turnRef.current;
    const ownTeam: CoinTeam = currentTurn === 'p1' ? 'white' : 'black';
    const currentPlayer = currentTurn === 'p1' ? p1 : p2;
    const otherTurn: Turn = currentTurn === 'p1' ? 'p2' : 'p1';
    const otherPlayer = otherTurn === 'p1' ? p1 : p2;

    const strikerIdx = discs.findIndex((d) => d.team === 'striker');
    if (strikerIdx !== -1) discs.splice(strikerIdx, 1);

    // Only the player who took the shot evaluates & publishes the authoritative board result
    if (!localShooterRef.current) {
      phaseRef.current = 'AIMING';
      setPhase('AIMING');
      return;
    }

    const sunk = shotPocketedRef.current;
    const strikerFoul = sunk.includes('striker');
    const sunkOwn = sunk.filter((t) => t === ownTeam).length;
    const sunkQueen = sunk.includes('queen');

    let message = '';
    let keepTurn = false;

    const returnCoinToCenter = (team: CoinTeam) => {
      const target = discs.find((d) => d.team === team && d.pocketed);
      if (target) {
        const spot = findFreeCenterSpot(discs, COIN_RADIUS);
        target.pocketed = false;
        target.sinking = undefined;
        target.x = spot.x;
        target.y = spot.y;
        target.vx = 0;
        target.vy = 0;
        return true;
      }
      return false;
    };

    if (strikerFoul) {
      sound.playFoul();
      const returnedOwn = returnCoinToCenter(ownTeam);
      if (sunkQueen || queenPendingCoverRef.current === currentTurn) {
        returnCoinToCenter('queen');
        queenPendingCoverRef.current = null;
      }
      message = returnedOwn
        ? `Foul! ${currentPlayer.name} pocketed striker — 1 coin returned.`
        : `Foul! ${currentPlayer.name} pocketed striker.`;
      keepTurn = false;
    } else if (sunkQueen) {
      if (sunkOwn > 0) {
        queenOwnerRef.current = currentTurn;
        queenPendingCoverRef.current = null;
        message = `${currentPlayer.name} pocketed & covered the Queen!`;
        keepTurn = true;
      } else {
        queenPendingCoverRef.current = currentTurn;
        message = `${currentPlayer.name} pocketed Queen — sink your coin next to cover it!`;
        keepTurn = true;
      }
    } else if (queenPendingCoverRef.current === currentTurn) {
      if (sunkOwn > 0) {
        queenOwnerRef.current = currentTurn;
        queenPendingCoverRef.current = null;
        message = `${currentPlayer.name} covered the Queen!`;
        keepTurn = true;
      } else {
        returnCoinToCenter('queen');
        queenPendingCoverRef.current = null;
        message = `Queen uncovered — returned to center. ${otherPlayer.name}'s turn.`;
        keepTurn = false;
      }
    } else if (sunkOwn > 0) {
      keepTurn = true;
      message = `Clean shot! ${currentPlayer.name} keeps turn.`;
    } else {
      keepTurn = false;
      message = `${otherPlayer.name}'s turn.`;
    }

    const whiteLeft = discs.filter((d) => d.team === 'white' && !d.pocketed).length;
    const blackLeft = discs.filter((d) => d.team === 'black' && !d.pocketed).length;
    const queenDisc = discs.find((d) => d.team === 'queen');
    const queenStillUnclaimed = queenDisc && !queenDisc.pocketed;

    if (whiteLeft === 0 && queenStillUnclaimed) {
      returnCoinToCenter('white');
      message = 'Pocket the Red Queen before clearing your last White coin!';
    }
    if (blackLeft === 0 && queenStillUnclaimed) {
      returnCoinToCenter('black');
      message = 'Pocket the Red Queen before clearing your last Black coin!';
    }

    syncCounts();
    const nextTurn = keepTurn ? currentTurn : otherTurn;

    // Publish settled state to room
    publishCarromSync({
      kind: 'settled',
      discs: discs
        .filter((d) => d.team !== 'striker')
        .map((d) => ({
          id: d.id,
          team: d.team,
          x: Math.round(d.x * 100) / 100,
          y: Math.round(d.y * 100) / 100,
          pocketed: d.pocketed,
        })),
      nextTurn,
      queenOwner: queenOwnerRef.current ?? '',
      queenPending: queenPendingCoverRef.current ?? '',
      banner: message,
    });

    const finalWhiteLeft = discs.filter((d) => d.team === 'white' && !d.pocketed).length;
    const finalBlackLeft = discs.filter((d) => d.team === 'black' && !d.pocketed).length;

    if (!endedRef.current && (finalWhiteLeft === 0 || finalBlackLeft === 0) && Boolean(queenDisc?.pocketed)) {
      endedRef.current = true;
      const winnerTurn: Turn = finalWhiteLeft === 0 ? 'p1' : 'p2';
      const winnerProfile = winnerTurn === 'p1' ? p1 : p2;
      const p1Points = 9 - finalWhiteLeft + (queenOwnerRef.current === 'p1' ? 3 : 0);
      const p2Points = 9 - finalBlackLeft + (queenOwnerRef.current === 'p2' ? 3 : 0);

      onMatchEnd({
        winner: winnerProfile.id,
        scoreLabel: `${p1.name} ${p1Points} — ${p2Points} ${p2.name}`,
        summary: `${winnerProfile.name} cleared all coins!`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
      return;
    }

    turnRef.current = nextTurn;
    phaseRef.current = 'AIMING';
    shotPocketedRef.current = [];
    strikerXRef.current = CENTER;
    setTurn(nextTurn);
    setPhase('AIMING');
    setStrikerSlider(CENTER);
    setBannerMsg(message);
  }, [onMatchEnd, p1, p2, publishCarromSync, syncCounts]);

  // 60fps Canvas Loop
  useEffect(() => {
    let raf = 0;
    let lastTime = performance.now();

    const draw = (now: number) => {
      const rawDt = Math.min(32, now - lastTime);
      lastTime = now;
      const dtScale = rawDt / 16.6667;

      if (phaseRef.current === 'SHOOTING') {
        const res = stepCarromPhysics(discsRef.current, sparksRef.current, dtScale);
        if (res.maxCollisionImpact > 1.8) {
          sound.playWoodHit(Math.min(1.4, res.maxCollisionImpact / 9));
        }
        if (res.newlyPocketed.length > 0) {
          for (const t of res.newlyPocketed) {
            shotPocketedRef.current.push(t);
            if (t === 'striker') sound.playFoul();
            else sound.playPocket();
          }
          syncCounts();
        }
        if (!res.anyMoving) {
          evaluateTurnEnd();
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
        ctx.fillStyle = '#1E1B18';
        ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.strokeRect(3, 3, BOARD_SIZE - 6, BOARD_SIZE - 6);

        const grad = ctx.createRadialGradient(CENTER, CENTER, 40, CENTER, CENTER, 380);
        grad.addColorStop(0, '#1B2436');
        grad.addColorStop(1, '#111827');
        ctx.fillStyle = grad;
        ctx.fillRect(PLAY_MIN, PLAY_MIN, PLAY_MAX - PLAY_MIN, PLAY_MAX - PLAY_MIN);

        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 4;
        ctx.strokeRect(PLAY_MIN, PLAY_MIN, PLAY_MAX - PLAY_MIN, PLAY_MAX - PLAY_MIN);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, 76, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, 20, 0, Math.PI * 2);
        ctx.stroke();

        const drawBaseline = (y: number, active: boolean, color: string) => {
          ctx.strokeStyle = active ? color : 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = active ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.moveTo(BASELINE_X_MIN, y - 14);
          ctx.lineTo(BASELINE_X_MAX, y - 14);
          ctx.moveTo(BASELINE_X_MIN, y + 14);
          ctx.lineTo(BASELINE_X_MAX, y + 14);
          ctx.stroke();

          for (const bx of [BASELINE_X_MIN, BASELINE_X_MAX]) {
            ctx.fillStyle = active ? color : '#EF4444';
            ctx.beginPath();
            ctx.arc(bx, y, 13.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0F172A';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        };

        drawBaseline(BASELINE_Y_P1, turnRef.current === 'p1' && phaseRef.current === 'AIMING', p1.accentColor);
        drawBaseline(BASELINE_Y_P2, turnRef.current === 'p2' && phaseRef.current === 'AIMING', p2.accentColor);

        for (const p of POCKETS) {
          ctx.fillStyle = '#05070B';
          ctx.beginPath();
          ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const drawDisc = (
          x: number,
          y: number,
          r: number,
          team: CoinTeam,
          scale = 1,
          invalid = false
        ) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(scale, scale);

          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.arc(2, 3, r, 0, Math.PI * 2);
          ctx.fill();

          if (team === 'white') {
            ctx.fillStyle = '#E0F2FE';
            ctx.strokeStyle = p1.accentColor;
          } else if (team === 'black') {
            ctx.fillStyle = '#27272A';
            ctx.strokeStyle = p2.accentColor;
          } else if (team === 'queen') {
            ctx.fillStyle = '#E11D48';
            ctx.strokeStyle = '#FDA4AF';
          } else {
            ctx.fillStyle = invalid ? '#EF4444' : '#F8FAFC';
            ctx.strokeStyle = turnRef.current === 'p1' ? p1.accentColor : p2.accentColor;
          }

          ctx.lineWidth = team === 'striker' ? 3 : 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        };

        for (const d of discsRef.current) {
          if (d.pocketed) continue;
          const scale = d.sinking ? Math.max(0.1, 1 - d.sinking.progress) : 1;
          drawDisc(d.x, d.y, d.radius, d.team, scale);
        }

        if (phaseRef.current === 'AIMING') {
          const sx = strikerXRef.current;
          const sy = turnRef.current === 'p1' ? BASELINE_Y_P1 : BASELINE_Y_P2;
          const valid = isStrikerPositionValid(discsRef.current, sx, sy);

          if (dragRef.current.active && valid) {
            const dx = sx - dragRef.current.curX;
            const dy = sy - dragRef.current.curY;
            const pullDist = Math.min(135, Math.hypot(dx, dy));

            if (pullDist > 8) {
              const angle = Math.atan2(dy, dx);
              const guideLen = 140 + pullDist * 1.4;
              ctx.save();
              ctx.setLineDash([7, 7]);
              ctx.strokeStyle = turnRef.current === 'p1' ? p1.accentColor : p2.accentColor;
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(sx + Math.cos(angle) * guideLen, sy + Math.sin(angle) * guideLen);
              ctx.stroke();
              ctx.restore();

              const pct = pullDist / 135;
              ctx.strokeStyle = pct > 0.75 ? '#F43F5E' : '#FBBF24';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(sx, sy, STRIKER_RADIUS + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
              ctx.stroke();
            }
          }

          drawDisc(sx, sy, STRIKER_RADIUS, 'striker', 1, !valid);
        }

        for (const sp of sparksRef.current) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, sp.life);
          ctx.fillStyle = sp.color;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [evaluateTurnEnd, p1.accentColor, p2.accentColor, syncCounts]);

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (BOARD_SIZE / rect.width),
      y: (e.clientY - rect.top) * (BOARD_SIZE / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isMyShot) return;
    const pt = toCanvasCoords(e);
    const sx = strikerXRef.current;
    const sy = turnRef.current === 'p1' ? BASELINE_Y_P1 : BASELINE_Y_P2;

    if (Math.hypot(pt.x - sx, pt.y - sy) <= STRIKER_RADIUS + 26) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { active: true, curX: pt.x, curY: pt.y };
    } else if (Math.abs(pt.y - sy) <= 28) {
      const clampedX = Math.max(BASELINE_X_MIN, Math.min(BASELINE_X_MAX, pt.x));
      strikerXRef.current = clampedX;
      setStrikerSlider(clampedX);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const pt = toCanvasCoords(e);
    dragRef.current.curX = pt.x;
    dragRef.current.curY = pt.y;
  };

  const handlePointerUp = () => {
    if (!dragRef.current.active) return;
    const sx = strikerXRef.current;
    const sy = turnRef.current === 'p1' ? BASELINE_Y_P1 : BASELINE_Y_P2;
    const dx = sx - dragRef.current.curX;
    const dy = sy - dragRef.current.curY;
    const pullDist = Math.min(135, Math.hypot(dx, dy));
    dragRef.current.active = false;

    if (pullDist < 12) return;
    if (!isStrikerPositionValid(discsRef.current, sx, sy)) {
      sound.playFoul();
      setBannerMsg('Cannot shoot — striker overlaps a coin!');
      return;
    }

    const angle = Math.atan2(dy, dx);
    const speed = (pullDist / 135) * 24;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    localShooterRef.current = true;
    discsRef.current.push({
      id: 'striker',
      team: 'striker',
      x: sx,
      y: sy,
      vx,
      vy,
      radius: STRIKER_RADIUS,
      mass: 2.1,
      pocketed: false,
    });

    shotPocketedRef.current = [];
    phaseRef.current = 'SHOOTING';
    setPhase('SHOOTING');
    sound.playKick(pullDist / 100);

    publishCarromSync({
      kind: 'shot',
      sx: Math.round(sx * 100) / 100,
      sy,
      vx: Math.round(vx * 1000) / 1000,
      vy: Math.round(vy * 1000) / 1000,
      shotTurn: turnRef.current,
    });
  };

  const activePlayer = turn === 'p1' ? p1 : p2;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-black bg-white p-4 neo-shadow-lg sm:p-5">
        <div className="flex w-full max-w-[580px] items-center justify-between text-xs font-bold text-black">
          <span>
            Shot:{' '}
            <span className="rounded-md border-2 border-black bg-[#ffe17c] px-2 py-0.5 font-extrabold">
              {isMyShot ? 'Your Turn!' : activePlayer.name}
            </span>
          </span>
          <span className="text-black/70">{bannerMsg}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={BOARD_SIZE}
          height={BOARD_SIZE}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`aspect-square w-full max-w-[580px] touch-none rounded-2xl border-2 border-black neo-shadow-sm ${
            isMyShot ? 'cursor-crosshair' : 'cursor-not-allowed'
          }`}
        />

        <div className="flex w-full max-w-[580px] items-center gap-4 rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-3">
          <label
            htmlFor="carrom-striker-slider"
            className="text-xs font-extrabold text-black whitespace-nowrap"
          >
            Slide Striker
          </label>
          <input
            id="carrom-striker-slider"
            type="range"
            min={BASELINE_X_MIN}
            max={BASELINE_X_MAX}
            step={1}
            disabled={!isMyShot}
            value={strikerSlider}
            onChange={(e) => {
              const val = Number(e.target.value);
              strikerXRef.current = val;
              setStrikerSlider(val);
            }}
            className="w-full accent-black cursor-pointer disabled:opacity-40"
          />
        </div>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <h2 className="font-display text-xl font-extrabold text-black">Board Status</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#ffe17c] px-3.5 py-2.5">
            <div>
              <p className="font-display text-sm font-extrabold text-black">
                {p1.name} {online.mySide === 'p1' ? '(You)' : ''}
              </p>
              <p className="text-xs font-bold text-black/70">White Coins · Bottom</p>
            </div>
            <span className="tabular-nums text-xl font-extrabold text-black">
              {counts.p1Pocketed}/9
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#b7c6c2] px-3.5 py-2.5">
            <div>
              <p className="font-display text-sm font-extrabold text-black">
                {p2.name} {online.mySide === 'p2' ? '(You)' : ''}
              </p>
              <p className="text-xs font-bold text-black/70">Black Coins · Top</p>
            </div>
            <span className="tabular-nums text-xl font-extrabold text-black">
              {counts.p2Pocketed}/9
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#171e19] px-3.5 py-2.5 text-white">
            <div>
              <p className="font-display text-sm font-extrabold text-[#ffe17c]">Red Queen</p>
              <p className="text-xs font-medium text-[#b7c6c2]">+3 Bonus when covered</p>
            </div>
            <span className="text-xs font-extrabold text-white">{counts.queenStatus}</span>
          </div>
        </div>

        <div className="space-y-2 border-t-2 border-black pt-4 text-xs leading-relaxed text-black/75">
          <p className="font-extrabold uppercase tracking-wider text-black">Online Controls</p>
          <p>1. Slide your striker on your turn, then drag back and release to shoot.</p>
          <p>2. Both players watch the exact physics shot live.</p>
        </div>
      </aside>
    </div>
  );
};
