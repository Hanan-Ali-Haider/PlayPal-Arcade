import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Play } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { createRoomRtcChannel, RtcChannelHandle } from '../../firebase/rtcSync';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';

const CW = 1000;
const CH = 560;
const PAD = 34;
const TL = PAD;
const TR = CW - PAD;
const TT = PAD;
const TB = CH - PAD;
const TW = TR - TL;
const TH = TB - TT;
const GOAL_HALF = 96;
const GOAL_TOP = CH / 2 - GOAL_HALF;
const GOAL_BOT = CH / 2 + GOAL_HALF;
const MALLET_R = 30;
const PUCK_R = 17;
const WIN_GOALS = 7;

interface Mallet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface HockeyInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  pointerActive: boolean;
  tx: number;
  ty: number;
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

export const AirHockeyGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<{ active: boolean; tx: number; ty: number }>({
    active: false,
    tx: CW * 0.25,
    ty: CH / 2,
  });
  const remoteInputRef = useRef<HockeyInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    pointerActive: false,
    tx: CW * 0.75,
    ty: CH / 2,
  });
  const rtcRef = useRef<RtcChannelHandle | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [rtcOpen, setRtcOpen] = useState(false);
  const [hud, setHud] = useState({ s1: 0, s2: 0, banner: '' });

  const simRef = useRef({
    m1: { x: TL + TW * 0.2, y: CH / 2, vx: 0, vy: 0 } as Mallet,
    m2: { x: TR - TW * 0.2, y: CH / 2, vx: 0, vy: 0 } as Mallet,
    puck: { x: CW / 2, y: CH / 2, vx: 0, vy: 0, trail: [] as { x: number; y: number }[] },
    s1: 0,
    s2: 0,
    freeze: 0,
    banner: '',
    shake: 0,
    particles: [] as Particle[],
    started: false,
    targetRemote: null as null | {
      m1x: number;
      m1y: number;
      m2x: number;
      m2y: number;
      px: number;
      py: number;
    },
  });

  const resetPositions = useCallback((serveTo: 'p1' | 'p2' | 'center' = 'center') => {
    const s = simRef.current;
    s.m1 = { x: TL + TW * 0.18, y: CH / 2, vx: 0, vy: 0 };
    s.m2 = { x: TR - TW * 0.18, y: CH / 2, vx: 0, vy: 0 };
    const offset = serveTo === 'p1' ? -70 : serveTo === 'p2' ? 70 : 0;
    s.puck = { x: CW / 2 + offset, y: CH / 2, vx: 0, vy: 0, trail: [] };
  }, []);

  const resetMatch = useCallback(() => {
    const s = simRef.current;
    s.s1 = 0;
    s.s2 = 0;
    s.freeze = 0;
    s.banner = '';
    s.shake = 0;
    s.particles = [];
    s.started = false;
    s.targetRemote = null;
    endedRef.current = false;
    startTimeRef.current = Date.now();
    resetPositions('center');
    setStarted(false);
    setHud({ s1: 0, s2: 0, banner: '' });
  }, [resetPositions]);

  useEffect(() => {
    resetMatch();
  }, [matchSeed, resetMatch]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const onBlur = () => {
      keysRef.current.clear();
      pointerRef.current.active = false;
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

  const readLocalInput = (): HockeyInput => {
    const k = keysRef.current;
    return {
      up: k.has('KeyW') || k.has('ArrowUp'),
      down: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      pointerActive: pointerRef.current.active,
      tx: Math.round(pointerRef.current.tx),
      ty: Math.round(pointerRef.current.ty),
    };
  };

  useEffect(() => {
    const handlePacket = (pkt: unknown) => {
      const msg = pkt as {
        t?: string;
        seed?: number;
        inp?: HockeyInput;
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
          bn: string;
          m1x: number;
          m1y: number;
          m2x: number;
          m2y: number;
          px: number;
          py: number;
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
        s.banner = d.bn;
        s.targetRemote = {
          m1x: d.m1x,
          m1y: d.m1y,
          m2x: d.m2x,
          m2y: d.m2y,
          px: d.px,
          py: d.py,
        };
        if (d.ended && !endedRef.current) {
          endedRef.current = true;
          const winnerProfile = d.s1 > d.s2 ? p1 : p2;
          onMatchEnd({
            winner: winnerProfile.id,
            scoreLabel: `${p1.name} ${d.s1} — ${d.s2} ${p2.name}`,
            summary: `${winnerProfile.name} dominated the table ${d.s1}–${d.s2}!`,
            durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
          });
        }
      }
    };

    const rtc = createRoomRtcChannel({
      roomCode: online.roomCode,
      myUid: online.myUid,
      isHost: online.isHost,
      sessionKey: `ah_${matchSeed}`,
      onMessage: handlePacket,
      onStatusChange: (open) => setRtcOpen(open),
    });
    rtcRef.current = rtc;

    let unsubFb: (() => void) | null = null;
    if (online.isHost) {
      const p = `rooms/${online.roomCode}/sync/airhockey_input`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'airhockey_input'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `ah_${matchSeed}` || rtc.isOpen()) return;
          remoteInputRef.current = d.payload as HockeyInput;
        },
        (err) => handleFirestoreError(err, OperationType.GET, p)
      );
    } else {
      const p = `rooms/${online.roomCode}/sync/airhockey_state`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'airhockey_state'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `ah_${matchSeed}` || rtc.isOpen()) return;
          handlePacket({ t: 'st', seed: matchSeed, st: d.payload });
        },
        (err) => handleFirestoreError(err, OperationType.GET, p)
      );
    }

    return () => {
      rtc.close();
      unsubFb?.();
    };
  }, [matchSeed, onMatchEnd, online.isHost, online.myUid, online.roomCode, p1, p2]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudTick = 0;
    let netTick = 0;
    let fbNetTick = 0;
    let lastKey = '';

    const spawnParticles = (x: number, y: number, color: string, count: number, spd = 6) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 1.5 + Math.random() * spd;
        simRef.current.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
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
      const winnerProfile = s.s1 > s.s2 ? p1 : p2;
      onMatchEnd({
        winner: winnerProfile.id,
        scoreLabel: `${p1.name} ${s.s1} — ${s.s2} ${p2.name}`,
        summary: `${winnerProfile.name} dominated the table ${s.s1}–${s.s2}!`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
    };

    const tick = (now: number) => {
      const dtSec = Math.min(0.032, (now - last) / 1000);
      last = now;
      const dt = dtSec * 60;
      const s = simRef.current;

      if (!online.isHost) {
        const inp = readLocalInput();
        const key = `${inp.up ? 1 : 0}${inp.down ? 1 : 0}${inp.left ? 1 : 0}${inp.right ? 1 : 0}${
          inp.pointerActive ? `${inp.tx},${inp.ty}` : '0'
        }`;
        netTick += dtSec;
        if (rtcRef.current?.isOpen()) {
          if (key !== lastKey || netTick > 0.04) {
            rtcRef.current.send({ t: 'inp', seed: matchSeed, inp });
            lastKey = key;
            netTick = 0;
          }
        } else {
          fbNetTick += dtSec;
          if (key !== lastKey && fbNetTick > 0.08) {
            lastKey = key;
            fbNetTick = 0;
            const path = `rooms/${online.roomCode}/sync/airhockey_input`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'airhockey_input'), {
              docId: 'airhockey_input',
              gameId: `ah_${matchSeed}`,
              seq: Math.floor(now),
              updatedByUid: online.myUid,
              payload: inp,
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
          }
        }

        if (s.targetRemote) {
          const t = s.targetRemote;
          const lerp = Math.min(1, dtSec * 25);
          s.m1.x += (t.m1x - s.m1.x) * lerp;
          s.m1.y += (t.m1y - s.m1.y) * lerp;
          s.m2.x += (t.m2x - s.m2.x) * lerp;
          s.m2.y += (t.m2y - s.m2.y) * lerp;
          s.puck.x += (t.px - s.puck.x) * lerp;
          s.puck.y += (t.py - s.puck.y) * lerp;
        }
      } else if (s.started && !endedRef.current) {
        if (s.freeze > 0) {
          s.freeze -= dtSec;
          if (s.freeze <= 0) {
            const serveTo = s.puck.x < CW / 2 ? 'p1' : 'p2';
            s.banner = '';
            resetPositions(serveTo);
          }
        } else {
          const localInp = readLocalInput();
          const guestInp = remoteInputRef.current;
          const m1Inp = online.mySide === 'p2' ? guestInp : localInp;
          const m2Inp = online.mySide === 'p2' ? localInp : guestInp;

          const updateMallet = (m: Mallet, inp: HockeyInput, minX: number, maxX: number) => {
            const prevX = m.x;
            const prevY = m.y;

            if (inp.pointerActive) {
              const clampedX = Math.max(minX, Math.min(maxX, inp.tx));
              const clampedY = Math.max(TT + MALLET_R, Math.min(TB - MALLET_R, inp.ty));
              const follow = Math.min(1, 0.48 * dt);
              m.x += (clampedX - m.x) * follow;
              m.y += (clampedY - m.y) * follow;
            } else {
              const ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
              const iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
              const mag = Math.hypot(ix, iy) || 1;
              const spd = 11.5;
              m.x += (ix / mag) * (ix || iy ? spd : 0) * dt;
              m.y += (iy / mag) * (ix || iy ? spd : 0) * dt;
            }

            m.x = Math.max(minX, Math.min(maxX, m.x));
            m.y = Math.max(TT + MALLET_R, Math.min(TB - MALLET_R, m.y));
            m.vx = (m.x - prevX) / Math.max(0.25, dt);
            m.vy = (m.y - prevY) / Math.max(0.25, dt);
          };

          updateMallet(s.m1, m1Inp, TL + MALLET_R, CW / 2 - MALLET_R);
          updateMallet(s.m2, m2Inp, CW / 2 + MALLET_R, TR - MALLET_R);

          // Puck movement (sub-stepped x2 for crisp high-speed rebounds)
          const p = s.puck;
          for (let sub = 0; sub < 2; sub++) {
            const subDt = dt * 0.5;
            p.x += p.vx * subDt;
            p.y += p.vy * subDt;
            p.vx *= Math.pow(0.994, subDt);
            p.vy *= Math.pow(0.994, subDt);

            if (p.y - PUCK_R < TT) {
              p.y = TT + PUCK_R;
              p.vy = Math.abs(p.vy) * 0.94;
              sound.playWoodHit(0.6);
            } else if (p.y + PUCK_R > TB) {
              p.y = TB - PUCK_R;
              p.vy = -Math.abs(p.vy) * 0.94;
              sound.playWoodHit(0.6);
            }

            const inGoalY = p.y > GOAL_TOP + PUCK_R * 0.4 && p.y < GOAL_BOT - PUCK_R * 0.4;
            if (!inGoalY) {
              if (p.x - PUCK_R < TL) {
                p.x = TL + PUCK_R;
                p.vx = Math.abs(p.vx) * 0.94;
                sound.playWoodHit(0.6);
              } else if (p.x + PUCK_R > TR) {
                p.x = TR - PUCK_R;
                p.vx = -Math.abs(p.vx) * 0.94;
                sound.playWoodHit(0.6);
              }
            }

            const collideMallet = (m: Mallet, accent: string) => {
              const dx = p.x - m.x;
              const dy = p.y - m.y;
              const dist = Math.hypot(dx, dy);
              const minD = MALLET_R + PUCK_R;
              if (dist < minD && dist > 0.001) {
                const nx = dx / dist;
                const ny = dy / dist;
                p.x = m.x + nx * (minD + 0.5);
                p.y = m.y + ny * (minD + 0.5);

                const relVx = p.vx - m.vx;
                const relVy = p.vy - m.vy;
                const relDot = relVx * nx + relVy * ny;
                if (relDot < 0) {
                  p.vx -= 1.85 * relDot * nx;
                  p.vy -= 1.85 * relDot * ny;
                }
                p.vx += m.vx * 0.45;
                p.vy += m.vy * 0.45;

                const spd = Math.hypot(p.vx, p.vy);
                if (spd < 5.5) {
                  p.vx = nx * 6.5;
                  p.vy = ny * 6.5;
                } else if (spd > 23) {
                  p.vx = (p.vx / spd) * 23;
                  p.vy = (p.vy / spd) * 23;
                }

                sound.playKick(Math.min(1.4, spd / 14));
                s.shake = Math.min(8, spd * 0.3);
                spawnParticles(p.x, p.y, accent, 8, 5);
              }
            };

            collideMallet(s.m1, p1.accentColor);
            collideMallet(s.m2, p2.accentColor);
          }

          if (Math.hypot(p.vx, p.vy) > 6) {
            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 8) p.trail.shift();
          } else if (p.trail.length > 0) {
            p.trail.shift();
          }

          // Goal Detection
          if (p.x < TL - PUCK_R * 0.4 && p.y > GOAL_TOP && p.y < GOAL_BOT) {
            s.s2 += 1;
            s.freeze = 1.25;
            s.banner = `${p2.name} Scores!`;
            s.shake = 12;
            sound.playGoalHorn();
            spawnParticles(TL, p.y, p2.accentColor, 28, 8);
            if (s.s2 >= WIN_GOALS) finishMatch();
          } else if (p.x > TR + PUCK_R * 0.4 && p.y > GOAL_TOP && p.y < GOAL_BOT) {
            s.s1 += 1;
            s.freeze = 1.25;
            s.banner = `${p1.name} Scores!`;
            s.shake = 12;
            sound.playGoalHorn();
            spawnParticles(TR, p.y, p1.accentColor, 28, 8);
            if (s.s1 >= WIN_GOALS) finishMatch();
          }
        }

        const stateSnapshot = {
          started: s.started,
          s1: s.s1,
          s2: s.s2,
          bn: s.banner,
          m1x: Math.round(s.m1.x),
          m1y: Math.round(s.m1.y),
          m2x: Math.round(s.m2.x),
          m2y: Math.round(s.m2.y),
          px: Math.round(s.puck.x),
          py: Math.round(s.puck.y),
          ended: endedRef.current,
        };

        netTick += dtSec;
        if (rtcRef.current?.isOpen()) {
          if (netTick >= 0.022) {
            netTick = 0;
            rtcRef.current.send({ t: 'st', seed: matchSeed, st: stateSnapshot });
          }
        } else {
          fbNetTick += dtSec;
          if (fbNetTick >= 0.1) {
            fbNetTick = 0;
            const path = `rooms/${online.roomCode}/sync/airhockey_state`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'airhockey_state'), {
              docId: 'airhockey_state',
              gameId: `ah_${matchSeed}`,
              seq: Math.floor(now),
              updatedByUid: online.myUid,
              payload: stateSnapshot,
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
          }
        }
      }

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const pt = s.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= 0.03 * dt;
        if (pt.life <= 0) s.particles.splice(i, 1);
      }
      if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.65 * dt);

      hudTick += dtSec;
      if (hudTick > 0.08) {
        hudTick = 0;
        setHud({ s1: s.s1, s2: s.s2, banner: s.banner });
      }

      // Render Table
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.save();
        if (s.shake > 0.2) {
          ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
        }

        // Outer Frame
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, CW, CH);

        // Ice Rink Surface
        ctx.fillStyle = '#171E19';
        ctx.strokeStyle = '#FFE17C';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(TL, TT, TW, TH, 24);
        ctx.fill();
        ctx.stroke();

        // Center Line & Circle
        ctx.strokeStyle = 'rgba(183, 198, 194, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(CW / 2, TT);
        ctx.lineTo(CW / 2, TB);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(CW / 2, CH / 2, 72, 0, Math.PI * 2);
        ctx.stroke();

        // Goal Creases & Slots
        ctx.fillStyle = '#000000';
        ctx.fillRect(TL - 16, GOAL_TOP, 20, GOAL_HALF * 2);
        ctx.fillRect(TR - 4, GOAL_TOP, 20, GOAL_HALF * 2);

        ctx.strokeStyle = p1.accentColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(TL, CH / 2, GOAL_HALF, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        ctx.strokeStyle = p2.accentColor;
        ctx.beginPath();
        ctx.arc(TR, CH / 2, GOAL_HALF, Math.PI / 2, (Math.PI * 3) / 2);
        ctx.stroke();

        // Puck Trail
        for (let i = 0; i < s.puck.trail.length; i++) {
          const tr = s.puck.trail[i];
          ctx.fillStyle = `rgba(255, 225, 124, ${(i / s.puck.trail.length) * 0.28})`;
          ctx.beginPath();
          ctx.arc(tr.x, tr.y, PUCK_R * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mallets
        const drawMallet = (m: Mallet, color: string, label: string) => {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.fillStyle = color;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, MALLET_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#171E19';
          ctx.beginPath();
          ctx.arc(0, 0, MALLET_R * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 11px "Satoshi", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, 0, -MALLET_R - 9);
          ctx.restore();
        };

        drawMallet(s.m1, p1.accentColor, p1.name);
        drawMallet(s.m2, p2.accentColor, p2.name);

        // Puck
        ctx.save();
        ctx.translate(s.puck.x, s.puck.y);
        ctx.fillStyle = '#FFE17C';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, PUCK_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
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

  const toCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CW / rect.width),
      y: (e.clientY - rect.top) * (CH / rect.height),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!started) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toCanvasCoords(e);
    pointerRef.current = { active: true, tx: pt.x, ty: pt.y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerRef.current.active) return;
    const pt = toCanvasCoords(e);
    pointerRef.current.tx = pt.x;
    pointerRef.current.ty = pt.y;
  };

  const handlePointerUp = () => {
    pointerRef.current.active = false;
  };

  const startMatch = () => {
    if (!online.isHost) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    sound.playPowerUp();
    simRef.current.started = true;
    startTimeRef.current = Date.now();
    setStarted(true);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-3 neo-shadow-lg sm:p-5">
      <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md border-2 border-black bg-[#ffe17c] px-2.5 py-1 text-xs font-extrabold text-black">
            {p1.name}
          </span>
          <span className="tabular-nums text-2xl font-extrabold text-black sm:text-3xl">{hud.s1}</span>
        </div>

        <span className="rounded-lg border-2 border-black bg-[#171e19] px-3 py-1 text-xs font-extrabold text-[#ffe17c]">
          First to {WIN_GOALS}
        </span>

        <div className="flex items-center gap-2.5">
          <span className="tabular-nums text-2xl font-extrabold text-black sm:text-3xl">{hud.s2}</span>
          <span className="rounded-md border-2 border-black bg-[#b7c6c2] px-2.5 py-1 text-xs font-extrabold text-black">
            {p2.name}
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-black bg-[#171e19]">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block aspect-[1000/560] w-full touch-none cursor-crosshair"
        />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
            <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
              Smash Air Hockey
            </h2>
            <p className="mt-1 max-w-md text-xs font-medium text-[#b7c6c2] sm:text-sm">
              {online.isHost
                ? 'Touch & drag on your side of the table (or use WASD / Arrow Keys) to smash the puck!'
                : 'Waiting for the room host to drop the puck...'}
            </p>
            {online.isHost && (
              <button
                type="button"
                onClick={startMatch}
                className="neo-btn mt-5 inline-flex items-center gap-2 bg-[#ffe17c] px-6 py-3 text-sm font-bold text-black cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                Drop Puck
              </button>
            )}
          </div>
        )}

        {hud.banner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border-2 border-black bg-[#ffe17c] px-8 py-4 text-center neo-shadow-lg">
              <p className="font-display text-3xl font-extrabold text-black">{hud.banner}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-black/70">
        <span>
          Controls: <strong className="font-extrabold text-black">Drag with Mouse / Finger</strong> on your half ·{' '}
          <strong className="font-extrabold text-black">WASD / Arrows</strong> supported
        </span>
        <span className="rounded-md border border-black bg-[#b7c6c2] px-2 py-0.5 font-bold text-black">
          {rtcOpen ? 'Connected' : 'Synced'}
        </span>
      </div>
    </div>
  );
};
