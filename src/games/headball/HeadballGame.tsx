import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Maximize2, Play, Rocket, Snowflake } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { createRoomRtcChannel, RtcChannelHandle } from '../../firebase/rtcSync';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';

const W = 1000;
const H = 520;
const GROUND_Y = 448;
const GOAL_W = 62;
const BASE_GOAL_H = 154;
const HEAD_R = 25;
const BODY_H = 26;
const BALL_R = 18;
const MATCH_SECONDS = 90;

type PowerType = 'giant_goal' | 'speed_boost' | 'freeze';

interface ActiveBuff {
  type: PowerType;
  owner: 'p1' | 'p2';
  expiresAt: number;
}

interface PowerOrb {
  x: number;
  y: number;
  type: PowerType;
  bobOffset: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface HeadPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  kickTimer: number;
  frozenTimer: number;
  speedTimer: number;
  stride: number;
}

interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  kick: boolean;
}

export const HeadballGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<InputState>({ left: false, right: false, jump: false, kick: false });
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);
  const rtcRef = useRef<RtcChannelHandle | null>(null);
  const remoteInputRef = useRef<InputState>({ left: false, right: false, jump: false, kick: false });

  const [started, setStarted] = useState(false);
  const [rtcOpen, setRtcOpen] = useState(false);
  const [hud, setHud] = useState({
    s1: 0,
    s2: 0,
    timeLeft: MATCH_SECONDS,
    goldenGoal: false,
    goalBanner: '',
    buffs: [] as ActiveBuff[],
  });

  const simRef = useRef({
    p1: {
      x: 220,
      y: GROUND_Y - HEAD_R - BODY_H,
      vx: 0,
      vy: 0,
      facing: 1 as 1 | -1,
      onGround: true,
      kickTimer: 0,
      frozenTimer: 0,
      speedTimer: 0,
      stride: 0,
    } as HeadPlayer,
    p2: {
      x: W - 220,
      y: GROUND_Y - HEAD_R - BODY_H,
      vx: 0,
      vy: 0,
      facing: -1 as 1 | -1,
      onGround: true,
      kickTimer: 0,
      frozenTimer: 0,
      speedTimer: 0,
      stride: 0,
    } as HeadPlayer,
    ball: {
      x: W / 2,
      y: 200,
      vx: 0,
      vy: 0,
      angle: 0,
      lastTouch: 'p1' as 'p1' | 'p2',
    },
    s1: 0,
    s2: 0,
    timeLeft: MATCH_SECONDS,
    goldenGoal: false,
    goalFreeze: 0,
    goalBanner: '',
    shake: 0,
    p1GiantGoalTimer: 0,
    p2GiantGoalTimer: 0,
    orb: null as PowerOrb | null,
    orbCooldown: 5.5,
    particles: [] as Particle[],
    started: false,
    targetRemote: null as null | {
      p1x: number;
      p1y: number;
      p1f: 1 | -1;
      p1k: number;
      p1fz: number;
      p1sp: number;
      p2x: number;
      p2y: number;
      p2f: 1 | -1;
      p2k: number;
      p2fz: number;
      p2sp: number;
      bx: number;
      by: number;
      ba: number;
    },
  });

  const resetPositions = useCallback((kickoffDir: 1 | -1 = 1) => {
    const s = simRef.current;
    const floorY = GROUND_Y - HEAD_R - BODY_H;
    s.p1 = {
      ...s.p1,
      x: 220,
      y: floorY,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      kickTimer: 0,
      frozenTimer: 0,
    };
    s.p2 = {
      ...s.p2,
      x: W - 220,
      y: floorY,
      vx: 0,
      vy: 0,
      facing: -1,
      onGround: true,
      kickTimer: 0,
      frozenTimer: 0,
    };
    s.ball = {
      x: W / 2,
      y: 195,
      vx: kickoffDir * 2.5,
      vy: -2,
      angle: 0,
      lastTouch: kickoffDir === 1 ? 'p1' : 'p2',
    };
  }, []);

  const resetFullMatch = useCallback(() => {
    const s = simRef.current;
    s.s1 = 0;
    s.s2 = 0;
    s.timeLeft = MATCH_SECONDS;
    s.goldenGoal = false;
    s.goalFreeze = 0;
    s.goalBanner = '';
    s.shake = 0;
    s.p1GiantGoalTimer = 0;
    s.p2GiantGoalTimer = 0;
    s.p1.speedTimer = 0;
    s.p2.speedTimer = 0;
    s.orb = null;
    s.orbCooldown = 5.5;
    s.particles = [];
    s.started = false;
    s.targetRemote = null;
    endedRef.current = false;
    startTimeRef.current = Date.now();
    resetPositions(1);
    setStarted(false);
    setHud({
      s1: 0,
      s2: 0,
      timeLeft: MATCH_SECONDS,
      goldenGoal: false,
      goalBanner: '',
      buffs: [],
    });
  }, [resetPositions]);

  useEffect(() => {
    resetFullMatch();
  }, [matchSeed, resetFullMatch]);

  // Keyboard tracking (both WASD and Arrows work for YOUR character online!)
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const onBlur = () => {
      keysRef.current.clear();
      touchRef.current = { left: false, right: false, jump: false, kick: false };
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const readLocalInput = (): InputState => {
    const k = keysRef.current;
    const t = touchRef.current;
    return {
      left: t.left || k.has('KeyA') || k.has('ArrowLeft'),
      right: t.right || k.has('KeyD') || k.has('ArrowRight'),
      jump: t.jump || k.has('KeyW') || k.has('ArrowUp'),
      kick: t.kick || k.has('Space') || k.has('Enter') || k.has('KeyS') || k.has('ArrowDown'),
    };
  };

  // Setup WebRTC + Firestore fallback
  useEffect(() => {
    const handleIncomingPacket = (pkt: unknown) => {
      const msg = pkt as {
        t?: string;
        seed?: number;
        inp?: InputState;
        st?: Record<string, unknown>;
      };
      if (msg.seed !== matchSeed) return;
      if (online.isHost && msg.t === 'inp' && msg.inp) {
        remoteInputRef.current = msg.inp;
      } else if (!online.isHost && msg.t === 'st' && msg.st) {
        const d = msg.st as {
          started: boolean;
          s1: number;
          s2: number;
          tl: number;
          gg: boolean;
          gb: string;
          g1t: number;
          g2t: number;
          p1x: number;
          p1y: number;
          p1f: 1 | -1;
          p1k: number;
          p1fz: number;
          p1sp: number;
          p2x: number;
          p2y: number;
          p2f: 1 | -1;
          p2k: number;
          p2fz: number;
          p2sp: number;
          bx: number;
          by: number;
          ba: number;
          orb: PowerOrb | null;
          ended?: boolean;
        };
        const s = simRef.current;
        if (d.started && !s.started) {
          s.started = true;
          setStarted(true);
        }
        if (d.s1 > s.s1 || d.s2 > s.s2) sound.playGoalHorn();
        s.s1 = d.s1;
        s.s2 = d.s2;
        s.timeLeft = d.tl;
        s.goldenGoal = d.gg;
        s.goalBanner = d.gb;
        s.p1GiantGoalTimer = d.g1t;
        s.p2GiantGoalTimer = d.g2t;
        s.orb = d.orb;
        s.targetRemote = {
          p1x: d.p1x,
          p1y: d.p1y,
          p1f: d.p1f,
          p1k: d.p1k,
          p1fz: d.p1fz,
          p1sp: d.p1sp,
          p2x: d.p2x,
          p2y: d.p2y,
          p2f: d.p2f,
          p2k: d.p2k,
          p2fz: d.p2fz,
          p2sp: d.p2sp,
          bx: d.bx,
          by: d.by,
          ba: d.ba,
        };
        if (d.ended && !endedRef.current) {
          endedRef.current = true;
          const winnerId = d.s1 > d.s2 ? p1.id : p2.id;
          const winnerProfile = d.s1 > d.s2 ? p1 : p2;
          onMatchEnd({
            winner: winnerId,
            scoreLabel: `${p1.name} ${d.s1} — ${d.s2} ${p2.name}`,
            summary: d.gg
              ? `${winnerProfile.name} scored the Golden Goal!`
              : `${winnerProfile.name} won Headball ${d.s1}–${d.s2}.`,
            durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
          });
        }
      }
    };

    const rtc = createRoomRtcChannel({
      roomCode: online.roomCode,
      myUid: online.myUid,
      isHost: online.isHost,
      sessionKey: `hb_${matchSeed}`,
      onMessage: handleIncomingPacket,
      onStatusChange: (open) => setRtcOpen(open),
    });
    rtcRef.current = rtc;

    // Firestore Fallback listener
    let unsubFb: (() => void) | null = null;
    if (online.isHost) {
      const p = `rooms/${online.roomCode}/sync/headball_input`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'headball_input'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `hb_${matchSeed}` || rtc.isOpen()) return;
          remoteInputRef.current = d.payload as InputState;
        },
        (err) => handleFirestoreError(err, OperationType.GET, p)
      );
    } else {
      const p = `rooms/${online.roomCode}/sync/headball_state`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'headball_state'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `hb_${matchSeed}` || rtc.isOpen()) return;
          handleIncomingPacket({ t: 'st', seed: matchSeed, st: d.payload });
        },
        (err) => handleFirestoreError(err, OperationType.GET, p)
      );
    }

    return () => {
      rtc.close();
      unsubFb?.();
    };
  }, [matchSeed, onMatchEnd, online.isHost, online.myUid, online.roomCode, p1, p2]);

  // Main 60fps Loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudTick = 0;
    let netTick = 0;
    let fbNetTick = 0;
    let lastSentInpKey = '';

    const spawnParticles = (x: number, y: number, color: string, count: number, speed = 5) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1.5 + Math.random() * speed;
        simRef.current.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.5,
          life: 1,
          color,
          size: 2.5 + Math.random() * 3.5,
        });
      }
    };

    const finishMatch = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const s = simRef.current;
      const winnerId = s.s1 > s.s2 ? p1.id : p2.id;
      const winnerProfile = s.s1 > s.s2 ? p1 : p2;
      onMatchEnd({
        winner: winnerId,
        scoreLabel: `${p1.name} ${s.s1} — ${s.s2} ${p2.name}`,
        summary: s.goldenGoal
          ? `${winnerProfile.name} scored the Golden Goal!`
          : `${winnerProfile.name} won Headball ${s.s1}–${s.s2}.`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
    };

    const tick = (now: number) => {
      const dtSec = Math.min(0.032, (now - last) / 1000);
      last = now;
      const dt = dtSec * 60;
      const s = simRef.current;

      // Guest sends inputs; Host simulates & broadcasts
      if (!online.isHost) {
        const inp = readLocalInput();
        const key = `${inp.left ? 1 : 0}${inp.right ? 1 : 0}${inp.jump ? 1 : 0}${inp.kick ? 1 : 0}`;
        netTick += dtSec;
        if (rtcRef.current?.isOpen()) {
          if (key !== lastSentInpKey || netTick > 0.05) {
            rtcRef.current.send({ t: 'inp', seed: matchSeed, inp });
            lastSentInpKey = key;
            netTick = 0;
          }
        } else {
          fbNetTick += dtSec;
          if (key !== lastSentInpKey && fbNetTick > 0.08) {
            lastSentInpKey = key;
            fbNetTick = 0;
            const path = `rooms/${online.roomCode}/sync/headball_input`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'headball_input'), {
              docId: 'headball_input',
              gameId: `hb_${matchSeed}`,
              seq: Math.floor(now),
              updatedByUid: online.myUid,
              payload: inp,
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
          }
        }

        // Smooth interpolation on Guest client
        if (s.targetRemote) {
          const t = s.targetRemote;
          const lerpAmt = Math.min(1, dtSec * 22);
          s.p1.x += (t.p1x - s.p1.x) * lerpAmt;
          s.p1.y += (t.p1y - s.p1.y) * lerpAmt;
          s.p1.facing = t.p1f;
          s.p1.kickTimer = t.p1k;
          s.p1.frozenTimer = t.p1fz;
          s.p1.speedTimer = t.p1sp;

          s.p2.x += (t.p2x - s.p2.x) * lerpAmt;
          s.p2.y += (t.p2y - s.p2.y) * lerpAmt;
          s.p2.facing = t.p2f;
          s.p2.kickTimer = t.p2k;
          s.p2.frozenTimer = t.p2fz;
          s.p2.speedTimer = t.p2sp;

          s.ball.x += (t.bx - s.ball.x) * lerpAmt;
          s.ball.y += (t.by - s.ball.y) * lerpAmt;
          s.ball.angle = t.ba;
          s.p1.stride += Math.abs(t.p1x - s.p1.x) * 0.25;
          s.p2.stride += Math.abs(t.p2x - s.p2.x) * 0.25;
        }
      } else if (s.started && !endedRef.current) {
        // Authoritative Host Physics
        if (s.goalFreeze > 0) {
          s.goalFreeze -= dtSec;
          if (s.goalFreeze <= 0) {
            s.goalBanner = '';
            resetPositions(s.ball.x < W / 2 ? 1 : -1);
          }
        } else {
          if (!s.goldenGoal) {
            s.timeLeft = Math.max(0, s.timeLeft - dtSec);
            if (s.timeLeft <= 0) {
              if (s.s1 !== s.s2) finishMatch();
              else {
                s.goldenGoal = true;
                sound.playPowerUp();
              }
            }
          }

          if (s.p1.frozenTimer > 0) s.p1.frozenTimer = Math.max(0, s.p1.frozenTimer - dtSec);
          if (s.p2.frozenTimer > 0) s.p2.frozenTimer = Math.max(0, s.p2.frozenTimer - dtSec);
          if (s.p1.speedTimer > 0) s.p1.speedTimer = Math.max(0, s.p1.speedTimer - dtSec);
          if (s.p2.speedTimer > 0) s.p2.speedTimer = Math.max(0, s.p2.speedTimer - dtSec);
          if (s.p1GiantGoalTimer > 0) s.p1GiantGoalTimer = Math.max(0, s.p1GiantGoalTimer - dtSec);
          if (s.p2GiantGoalTimer > 0) s.p2GiantGoalTimer = Math.max(0, s.p2GiantGoalTimer - dtSec);

          if (!s.orb) {
            s.orbCooldown -= dtSec;
            if (s.orbCooldown <= 0) {
              const types: PowerType[] = ['giant_goal', 'speed_boost', 'freeze'];
              s.orb = {
                x: W * (0.28 + Math.random() * 0.44),
                y: 165 + Math.random() * 150,
                type: types[Math.floor(Math.random() * types.length)],
                bobOffset: 0,
              };
              s.orbCooldown = 8.5 + Math.random() * 4;
            }
          } else {
            s.orb.bobOffset += dtSec * 3.5;
          }

          const localInput = readLocalInput();
          const guestInput = remoteInputRef.current;
          // Host controls whichever side they claimed
          const p1Input = online.mySide === 'p2' ? guestInput : localInput;
          const p2Input = online.mySide === 'p2' ? localInput : guestInput;

          const updatePlayer = (pl: HeadPlayer, inp: InputState) => {
            if (pl.kickTimer > 0) pl.kickTimer = Math.max(0, pl.kickTimer - dtSec);

            if (pl.frozenTimer > 0) {
              pl.vx *= 0.82;
            } else {
              const speedMult = pl.speedTimer > 0 ? 1.38 : 1;
              const topSpeed = 9.0 * speedMult;
              const accel = 1.8 * speedMult;

              if (inp.left && !inp.right) {
                pl.vx = Math.max(-topSpeed, pl.vx - accel * dt);
                pl.facing = -1;
              } else if (inp.right && !inp.left) {
                pl.vx = Math.min(topSpeed, pl.vx + accel * dt);
                pl.facing = 1;
              } else {
                pl.vx *= Math.pow(0.68, dt);
                if (Math.abs(pl.vx) < 0.25) {
                  pl.vx = 0;
                  // Face towards ball when idle!
                  pl.facing = s.ball.x >= pl.x ? 1 : -1;
                }
              }

              if (Math.abs(pl.vx) > 0.5 && pl.onGround) {
                pl.stride += Math.abs(pl.vx) * 0.085 * dt;
              }

              if (inp.jump && pl.onGround) {
                pl.vy = -15.4 * (pl.speedTimer > 0 ? 1.08 : 1);
                pl.onGround = false;
                spawnParticles(pl.x, GROUND_Y, '#94A3B8', 5, 3);
              }
              if (inp.kick && pl.kickTimer <= 0) {
                pl.kickTimer = 0.22;
              }
            }

            pl.vy += 0.86 * dt;
            pl.x += pl.vx * dt;
            pl.y += pl.vy * dt;

            const floorY = GROUND_Y - HEAD_R - BODY_H;
            if (pl.y >= floorY) {
              pl.y = floorY;
              pl.vy = 0;
              pl.onGround = true;
            }
            pl.x = Math.max(GOAL_W + HEAD_R + 4, Math.min(W - GOAL_W - HEAD_R - 4, pl.x));
          };

          updatePlayer(s.p1, p1Input);
          updatePlayer(s.p2, p2Input);

          // Player-Player collision
          const pdx = s.p2.x - s.p1.x;
          const pdy = s.p2.y - s.p1.y;
          const pDist = Math.hypot(pdx, pdy);
          if (pDist < HEAD_R * 2 && pDist > 0.01) {
            const nx = pdx / pDist;
            const ny = pdy / pDist;
            const ov = HEAD_R * 2 - pDist;
            s.p1.x -= nx * ov * 0.5;
            s.p1.y -= ny * ov * 0.5;
            s.p2.x += nx * ov * 0.5;
            s.p2.y += ny * ov * 0.5;
          }

          // Ball Physics (lively & crisp)
          const b = s.ball;
          b.vy += 0.56 * dt;
          b.vx *= Math.pow(0.996, dt);
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.angle += b.vx * 0.052 * dt;

          const leftGoalH = BASE_GOAL_H + (s.p2GiantGoalTimer > 0 ? 55 : 0);
          const rightGoalH = BASE_GOAL_H + (s.p1GiantGoalTimer > 0 ? 55 : 0);
          const leftGoalTop = GROUND_Y - leftGoalH;
          const rightGoalTop = GROUND_Y - rightGoalH;

          if (b.y - BALL_R < 16) {
            b.y = 16 + BALL_R;
            b.vy = Math.abs(b.vy) * 0.84;
          }
          if (b.y + BALL_R > GROUND_Y) {
            b.y = GROUND_Y - BALL_R;
            if (Math.abs(b.vy) > 2.5) sound.playBounce();
            b.vy = -Math.abs(b.vy) * 0.82;
            b.vx *= 0.97;
          }

          if (b.x - BALL_R < GOAL_W && b.y < leftGoalTop) {
            b.x = GOAL_W + BALL_R;
            b.vx = Math.abs(b.vx) * 0.85;
          }
          if (b.x + BALL_R > W - GOAL_W && b.y < rightGoalTop) {
            b.x = W - GOAL_W - BALL_R;
            b.vx = -Math.abs(b.vx) * 0.85;
          }

          // Crossbar bounces
          const checkPost = (px: number, py: number) => {
            const dx = b.x - px;
            const dy = b.y - py;
            const dist = Math.hypot(dx, dy);
            const minD = BALL_R + 7;
            if (dist < minD && dist > 0.01) {
              const nx = dx / dist;
              const ny = dy / dist;
              b.x = px + nx * minD;
              b.y = py + ny * minD;
              const dot = b.vx * nx + b.vy * ny;
              if (dot < 0) {
                b.vx -= 1.88 * dot * nx;
                b.vy -= 1.88 * dot * ny;
                sound.playWoodHit(1.1);
                s.shake = 6;
              }
            }
          };
          checkPost(GOAL_W, leftGoalTop);
          checkPost(W - GOAL_W, rightGoalTop);

          const collidePlayerBall = (pl: HeadPlayer, who: 'p1' | 'p2') => {
            // Head & Body Capsule collision
            const hitPoints = [
              { x: pl.x, y: pl.y, r: HEAD_R },
              { x: pl.x, y: pl.y + HEAD_R + 10, r: 16 },
            ];
            for (const hp of hitPoints) {
              const dx = b.x - hp.x;
              const dy = b.y - hp.y;
              const dist = Math.hypot(dx, dy);
              const minD = hp.r + BALL_R;
              if (dist < minD && dist > 0.01) {
                const nx = dx / dist;
                const ny = dy / dist;
                b.x = hp.x + nx * minD;
                b.y = hp.y + ny * minD;
                b.vx = nx * 9.8 + pl.vx * 0.72;
                b.vy = Math.min(-4.2, ny * 10.2 + pl.vy * 0.45);
                b.lastTouch = who;
                sound.playBounce();
              }
            }

            // Active Foot Kick Hitbox (wide arc in front of player)
            if (pl.kickTimer > 0.06) {
              const footX = pl.x + pl.facing * 26;
              const footY = pl.y + HEAD_R + 12;
              if (Math.hypot(b.x - footX, b.y - footY) < BALL_R + 30) {
                b.vx = pl.facing * 15.8 + pl.vx * 0.35;
                b.vy = -10.5;
                b.lastTouch = who;
                pl.kickTimer = 0.04;
                s.shake = 8;
                sound.playKick(1.25);
                spawnParticles(
                  b.x,
                  b.y,
                  who === 'p1' ? p1.accentColor : p2.accentColor,
                  12,
                  6
                );
              }
            }
          };

          collidePlayerBall(s.p1, 'p1');
          collidePlayerBall(s.p2, 'p2');

          const spd = Math.hypot(b.vx, b.vy);
          if (spd > 22) {
            b.vx = (b.vx / spd) * 22;
            b.vy = (b.vy / spd) * 22;
          }

          if (s.orb) {
            const orb = s.orb;
            let collector: 'p1' | 'p2' | null = null;
            if (Math.hypot(s.p1.x - orb.x, s.p1.y - orb.y) < HEAD_R + 24) collector = 'p1';
            else if (Math.hypot(s.p2.x - orb.x, s.p2.y - orb.y) < HEAD_R + 24) collector = 'p2';
            else if (Math.hypot(b.x - orb.x, b.y - orb.y) < BALL_R + 24) collector = b.lastTouch;

            if (collector) {
              sound.playPowerUp();
              spawnParticles(orb.x, orb.y, '#FBBF24', 18, 6);
              if (orb.type === 'giant_goal') {
                if (collector === 'p1') s.p1GiantGoalTimer = 8;
                else s.p2GiantGoalTimer = 8;
              } else if (orb.type === 'speed_boost') {
                if (collector === 'p1') s.p1.speedTimer = 7;
                else s.p2.speedTimer = 7;
              } else if (orb.type === 'freeze') {
                if (collector === 'p1') s.p2.frozenTimer = 3.2;
                else s.p1.frozenTimer = 3.2;
              }
              s.orb = null;
            }
          }

          if (b.x + BALL_R * 0.4 < GOAL_W && b.y > leftGoalTop) {
            s.s2 += 1;
            s.goalFreeze = 1.5;
            s.goalBanner = `${p2.name} Scores!`;
            s.shake = 14;
            sound.playGoalHorn();
            spawnParticles(GOAL_W, b.y, p2.accentColor, 36, 9);
            if (s.goldenGoal) finishMatch();
          } else if (b.x - BALL_R * 0.4 > W - GOAL_W && b.y > rightGoalTop) {
            s.s1 += 1;
            s.goalFreeze = 1.5;
            s.goalBanner = `${p1.name} Scores!`;
            s.shake = 14;
            sound.playGoalHorn();
            spawnParticles(W - GOAL_W, b.y, p1.accentColor, 36, 9);
            if (s.goldenGoal) finishMatch();
          }
        }

        // Host broadcasts state snapshot
        const stateSnapshot = {
          started: s.started,
          s1: s.s1,
          s2: s.s2,
          tl: Math.round(s.timeLeft * 10) / 10,
          gg: s.goldenGoal,
          gb: s.goalBanner,
          g1t: Math.round(s.p1GiantGoalTimer * 10) / 10,
          g2t: Math.round(s.p2GiantGoalTimer * 10) / 10,
          p1x: Math.round(s.p1.x),
          p1y: Math.round(s.p1.y),
          p1f: s.p1.facing,
          p1k: Math.round(s.p1.kickTimer * 100) / 100,
          p1fz: Math.round(s.p1.frozenTimer * 10) / 10,
          p1sp: Math.round(s.p1.speedTimer * 10) / 10,
          p2x: Math.round(s.p2.x),
          p2y: Math.round(s.p2.y),
          p2f: s.p2.facing,
          p2k: Math.round(s.p2.kickTimer * 100) / 100,
          p2fz: Math.round(s.p2.frozenTimer * 10) / 10,
          p2sp: Math.round(s.p2.speedTimer * 10) / 10,
          bx: Math.round(s.ball.x),
          by: Math.round(s.ball.y),
          ba: Math.round(s.ball.angle * 100) / 100,
          orb: s.orb,
          ended: endedRef.current,
        };

        netTick += dtSec;
        if (rtcRef.current?.isOpen()) {
          if (netTick >= 0.025) {
            netTick = 0;
            rtcRef.current.send({ t: 'st', seed: matchSeed, st: stateSnapshot });
          }
        } else {
          fbNetTick += dtSec;
          if (fbNetTick >= 0.11) {
            fbNetTick = 0;
            const path = `rooms/${online.roomCode}/sync/headball_state`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'headball_state'), {
              docId: 'headball_state',
              gameId: `hb_${matchSeed}`,
              seq: Math.floor(now),
              updatedByUid: online.myUid,
              payload: stateSnapshot,
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
          }
        }
      }

      // Particles & shake
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += 0.25 * dt;
        pt.life -= 0.026 * dt;
        if (pt.life <= 0) s.particles.splice(i, 1);
      }
      if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.65 * dt);

      hudTick += dtSec;
      if (hudTick > 0.1) {
        hudTick = 0;
        const buffs: ActiveBuff[] = [];
        if (s.p1GiantGoalTimer > 0) buffs.push({ type: 'giant_goal', owner: 'p1', expiresAt: s.p1GiantGoalTimer });
        if (s.p2GiantGoalTimer > 0) buffs.push({ type: 'giant_goal', owner: 'p2', expiresAt: s.p2GiantGoalTimer });
        if (s.p1.speedTimer > 0) buffs.push({ type: 'speed_boost', owner: 'p1', expiresAt: s.p1.speedTimer });
        if (s.p2.speedTimer > 0) buffs.push({ type: 'speed_boost', owner: 'p2', expiresAt: s.p2.speedTimer });
        if (s.p2.frozenTimer > 0) buffs.push({ type: 'freeze', owner: 'p1', expiresAt: s.p2.frozenTimer });
        if (s.p1.frozenTimer > 0) buffs.push({ type: 'freeze', owner: 'p2', expiresAt: s.p1.frozenTimer });
        setHud({
          s1: s.s1,
          s2: s.s2,
          timeLeft: Math.ceil(s.timeLeft),
          goldenGoal: s.goldenGoal,
          goalBanner: s.goalBanner,
          buffs,
        });
      }

      // Render Crisp Stadium & Athletic Characters
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.save();
        if (s.shake > 0.2) {
          ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
        }

        const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
        sky.addColorStop(0, '#090F1C');
        sky.addColorStop(1, '#142238');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // Stadium Crowd Silhouette & Stands
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, GROUND_Y - 70, W, 70);

        // Pitch Turf
        ctx.fillStyle = '#0F4D37';
        ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
        ctx.fillStyle = '#146246';
        for (let x = 0; x < W; x += 80) {
          ctx.fillRect(x, GROUND_Y, 40, H - GROUND_Y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(W, GROUND_Y);
        ctx.stroke();

        // Goals
        const drawGoal = (isLeft: boolean, goalH: number, accent: string) => {
          const topY = GROUND_Y - goalH;
          const xStart = isLeft ? 0 : W - GOAL_W;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(xStart, topY, GOAL_W, goalH);

          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1.2;
          for (let gx = xStart + 10; gx < xStart + GOAL_W; gx += 12) {
            ctx.beginPath();
            ctx.moveTo(gx, topY);
            ctx.lineTo(gx, GROUND_Y);
            ctx.stroke();
          }
          for (let gy = topY + 14; gy < GROUND_Y; gy += 16) {
            ctx.beginPath();
            ctx.moveTo(xStart, gy);
            ctx.lineTo(xStart + GOAL_W, gy);
            ctx.stroke();
          }

          ctx.strokeStyle = accent;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (isLeft) {
            ctx.moveTo(0, topY);
            ctx.lineTo(GOAL_W, topY);
            ctx.lineTo(GOAL_W, topY + 10);
          } else {
            ctx.moveTo(W, topY);
            ctx.lineTo(W - GOAL_W, topY);
            ctx.lineTo(W - GOAL_W, topY + 10);
          }
          ctx.stroke();
        };

        const leftH = BASE_GOAL_H + (s.p2GiantGoalTimer > 0 ? 55 : 0);
        const rightH = BASE_GOAL_H + (s.p1GiantGoalTimer > 0 ? 55 : 0);
        drawGoal(true, leftH, p1.accentColor);
        drawGoal(false, rightH, p2.accentColor);

        // Power-up Orb (crisp vector icon, zero emojis)
        if (s.orb) {
          const oy = s.orb.y + Math.sin(s.orb.bobOffset) * 8;
          const orbColor =
            s.orb.type === 'giant_goal'
              ? '#A855F7'
              : s.orb.type === 'speed_boost'
                ? '#FBBF24'
                : '#38BDF8';
          ctx.save();
          ctx.fillStyle = orbColor;
          ctx.beginPath();
          ctx.arc(s.orb.x, oy, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0F172A';
          ctx.fillStyle = '#0F172A';
          if (s.orb.type === 'giant_goal') {
            ctx.font = 'bold 14px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('G+', s.orb.x, oy + 1);
          } else if (s.orb.type === 'speed_boost') {
            ctx.beginPath();
            ctx.moveTo(s.orb.x + 2, oy - 9);
            ctx.lineTo(s.orb.x - 6, oy + 1);
            ctx.lineTo(s.orb.x, oy + 1);
            ctx.lineTo(s.orb.x - 2, oy + 9);
            ctx.lineTo(s.orb.x + 6, oy - 1);
            ctx.lineTo(s.orb.x, oy - 1);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            for (let k = 0; k < 3; k++) {
              const ang = (k * Math.PI) / 3;
              ctx.beginPath();
              ctx.moveTo(s.orb.x - Math.cos(ang) * 8, oy - Math.sin(ang) * 8);
              ctx.lineTo(s.orb.x + Math.cos(ang) * 8, oy + Math.sin(ang) * 8);
              ctx.stroke();
            }
          }
          ctx.restore();
        }

        // Athletic Big-Head Player Renderer
        const drawAthlete = (
          pl: HeadPlayer,
          accent: string,
          secondary: string,
          label: string,
          num: string
        ) => {
          ctx.save();
          ctx.translate(pl.x, pl.y);

          // Ground shadow
          const distToGround = GROUND_Y - (pl.y + HEAD_R + BODY_H);
          const shadowScale = Math.max(0.35, 1 - distToGround / 180);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(0, HEAD_R + BODY_H + distToGround, 22 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
          ctx.fill();

          if (pl.speedTimer > 0) {
            ctx.strokeStyle = '#FBBF24';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 8, HEAD_R + 14, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Back leg (running stride)
          const strideSwing = Math.sin(pl.stride) * 9;
          ctx.strokeStyle = '#1E293B';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-4 * pl.facing, HEAD_R + 13);
          ctx.lineTo(-6 * pl.facing - strideSwing * 0.6, HEAD_R + BODY_H - 2);
          ctx.stroke();

          // Jersey Torso
          ctx.fillStyle = secondary;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-14, HEAD_R - 4, 28, 20, 7);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(num, 0, HEAD_R + 10);

          // Kicking Leg + Cleat
          const kickProg = pl.kickTimer > 0 ? Math.sin((pl.kickTimer / 0.22) * Math.PI) : 0;
          ctx.save();
          ctx.translate(pl.facing * 4, HEAD_R + 13);
          ctx.rotate(-pl.facing * kickProg * 1.15);
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(strideSwing * 0.4, 12);
          ctx.stroke();
          // Cleat
          ctx.fillStyle = accent;
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(pl.facing === 1 ? -3 : -17, 9, 20, 9, 4);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Head
          ctx.fillStyle = pl.frozenTimer > 0 ? '#93C5FD' : '#FCD39D';
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, HEAD_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Sculpted Hair + Sweatband
          ctx.fillStyle = '#1E293B';
          ctx.beginPath();
          ctx.arc(0, -4, HEAD_R, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.fillRect(-HEAD_R + 2, -12, (HEAD_R - 2) * 2, 6);

          // Competitive Eyes looking towards facing/ball
          const eyeBaseX = pl.facing * 6;
          for (const offset of [-6, 6]) {
            const ex = eyeBaseX + offset;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(ex, -1, 4.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0F172A';
            ctx.beginPath();
            ctx.arc(ex + pl.facing * 1.5, -1, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }

          if (pl.frozenTimer > 0) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.strokeStyle = '#E0F2FE';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(-HEAD_R - 6, -HEAD_R - 6, HEAD_R * 2 + 12, HEAD_R * 2 + BODY_H + 10, 10);
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = accent;
          ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, 0, -HEAD_R - 12);

          ctx.restore();
        };

        drawAthlete(s.p1, p1.accentColor, p1.secondaryColor, p1.name, '1');
        drawAthlete(s.p2, p2.accentColor, p2.secondaryColor, p2.name, '2');

        // Soccer Ball
        const b = s.ball;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 12.5, Math.sin(a) * 12.5, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        for (const pt of s.particles) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, pt.life);
          ctx.fillStyle = pt.color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [matchSeed, onMatchEnd, online.isHost, online.mySide, online.myUid, online.roomCode, p1, p2, resetPositions]);

  const startKickoff = () => {
    if (!online.isHost) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    sound.playPowerUp();
    simRef.current.started = true;
    startTimeRef.current = Date.now();
    setStarted(true);
  };

  const touchBtnProps = (key: keyof InputState) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touchRef.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      touchRef.current[key] = false;
    },
    onPointerCancel: () => {
      touchRef.current[key] = false;
    },
  });

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-3 neo-shadow-lg sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-black bg-[#f4f4f5] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-md border-2 border-black bg-[#ffe17c] px-2.5 py-1 text-xs font-extrabold text-black">
            {p1.name}
          </span>
          <span className="tabular-nums text-3xl font-extrabold text-black">{hud.s1}</span>
        </div>

        <div className="text-center">
          {hud.goldenGoal ? (
            <span className="rounded-lg border-2 border-black bg-[#ffe17c] px-3 py-1 font-display text-sm font-extrabold text-black">
              Golden Goal Overtime
            </span>
          ) : (
            <span className="tabular-nums text-2xl font-extrabold text-black">
              {formatClock(hud.timeLeft)}
            </span>
          )}
          {hud.buffs.length > 0 && (
            <div className="mt-1 flex items-center justify-center gap-3 text-xs">
              {hud.buffs.map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded border border-black bg-white px-2 py-0.5 tabular-nums font-bold text-black"
                >
                  {b.type === 'giant_goal' && <Maximize2 className="h-3.5 w-3.5" />}
                  {b.type === 'speed_boost' && <Rocket className="h-3.5 w-3.5" />}
                  {b.type === 'freeze' && <Snowflake className="h-3.5 w-3.5" />}
                  {b.expiresAt.toFixed(1)}s
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="tabular-nums text-3xl font-extrabold text-black">{hud.s2}</span>
          <span className="rounded-md border-2 border-black bg-[#b7c6c2] px-2.5 py-1 text-xs font-extrabold text-black">
            {p2.name}
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-black bg-[#171e19]">
        <canvas ref={canvasRef} width={W} height={H} className="block aspect-[1000/520] w-full" />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
            <h2 className="font-display text-3xl font-extrabold text-white">
              Headball 1v1
            </h2>
            <p className="mt-1 text-sm font-medium text-[#b7c6c2]">
              {online.isHost
                ? 'Use WASD or Arrows to move & jump, Space or Enter to kick'
                : 'Waiting for the room host to kick off...'}
            </p>
            {online.isHost && (
              <button
                type="button"
                onClick={startKickoff}
                className="neo-btn mt-5 inline-flex items-center gap-2 bg-[#ffe17c] px-6 py-3 text-sm font-bold text-black cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                Kick Off Match
              </button>
            )}
          </div>
        )}

        {hud.goalBanner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border-2 border-black bg-[#ffe17c] px-8 py-4 text-center neo-shadow-lg">
              <p className="font-display text-3xl font-extrabold text-black">
                {hud.goalBanner}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Touch Controls */}
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] p-3 lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...touchBtnProps('left')}
            className="neo-btn flex h-12 w-16 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            LEFT
          </button>
          <button
            type="button"
            {...touchBtnProps('right')}
            className="neo-btn flex h-12 w-16 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            RIGHT
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            {...touchBtnProps('jump')}
            className="neo-btn flex h-12 w-16 items-center justify-center bg-[#b7c6c2] text-xs font-extrabold text-black touch-none select-none"
          >
            JUMP
          </button>
          <button
            type="button"
            {...touchBtnProps('kick')}
            className="neo-btn flex h-12 w-16 items-center justify-center bg-black text-xs font-extrabold text-[#ffe17c] touch-none select-none"
          >
            KICK
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-black/70">
        <span>
          Controls: <strong className="font-extrabold text-black">WASD or Arrow Keys</strong> to move &amp; jump ·{' '}
          <strong className="font-extrabold text-black">Space / Enter</strong> to kick
        </span>
        <span className="rounded-md border border-black bg-[#b7c6c2] px-2 py-0.5 font-bold text-black">
          {rtcOpen ? 'Connected' : 'Synced'}
        </span>
      </div>
    </div>
  );
};
