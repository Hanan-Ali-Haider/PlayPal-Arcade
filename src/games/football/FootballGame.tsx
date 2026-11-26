import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Play } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { createRoomRtcChannel, RtcChannelHandle } from '../../firebase/rtcSync';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';

const CW = 1000;
const CH = 580;
const PAD_X = 52;
const PAD_Y = 36;
const PITCH_L = PAD_X;
const PITCH_R = CW - PAD_X;
const PITCH_T = PAD_Y;
const PITCH_B = CH - PAD_Y;
const PITCH_W = PITCH_R - PITCH_L;
const PITCH_H = PITCH_B - PITCH_T;
const GOAL_HALF_H = 90;
const GOAL_TOP = CH / 2 - GOAL_HALF_H;
const GOAL_BOT = CH / 2 + GOAL_HALF_H;
const GOAL_DEPTH = 38;
const PLAYER_R = 20;
const GK_R = 16;
const BALL_R = 13;
const MATCH_SECONDS = 90;

interface TopPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirX: number;
  dirY: number;
  stamina: number;
  charge: number;
  charging: boolean;
  stride: number;
  trail: { x: number; y: number }[];
}

interface Keeper {
  x: number;
  y: number;
  vy: number;
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

interface FootballInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  shoot: boolean;
}

export const FootballGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<FootballInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    shoot: false,
  });
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);
  const rtcRef = useRef<RtcChannelHandle | null>(null);
  const remoteInputRef = useRef<FootballInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    sprint: false,
    shoot: false,
  });

  const [started, setStarted] = useState(false);
  const [rtcOpen, setRtcOpen] = useState(false);
  const [hud, setHud] = useState({
    s1: 0,
    s2: 0,
    timeLeft: MATCH_SECONDS,
    goldenGoal: false,
    goalBanner: '',
  });

  const simRef = useRef({
    p1: {
      x: PITCH_L + PITCH_W * 0.25,
      y: CH / 2,
      vx: 0,
      vy: 0,
      dirX: 1,
      dirY: 0,
      stamina: 100,
      charge: 0,
      charging: false,
      stride: 0,
      trail: [],
    } as TopPlayer,
    p2: {
      x: PITCH_R - PITCH_W * 0.25,
      y: CH / 2,
      vx: 0,
      vy: 0,
      dirX: -1,
      dirY: 0,
      stamina: 100,
      charge: 0,
      charging: false,
      stride: 0,
      trail: [],
    } as TopPlayer,
    gk1: { x: PITCH_L + 20, y: CH / 2, vy: 0 } as Keeper,
    gk2: { x: PITCH_R - 20, y: CH / 2, vy: 0 } as Keeper,
    ball: { x: CW / 2, y: CH / 2, vx: 0, vy: 0, angle: 0, trail: [] as { x: number; y: number }[] },
    s1: 0,
    s2: 0,
    timeLeft: MATCH_SECONDS,
    goldenGoal: false,
    goalFreeze: 0,
    goalBanner: '',
    shake: 0,
    particles: [] as Particle[],
    started: false,
    targetRemote: null as null | {
      p1x: number;
      p1y: number;
      p1dx: number;
      p1dy: number;
      p1st: number;
      p1ch: number;
      p2x: number;
      p2y: number;
      p2dx: number;
      p2dy: number;
      p2st: number;
      p2ch: number;
      gk1y: number;
      gk2y: number;
      bx: number;
      by: number;
      ba: number;
    },
  });

  const resetPositions = useCallback(() => {
    const s = simRef.current;
    s.p1 = {
      x: PITCH_L + PITCH_W * 0.25,
      y: CH / 2,
      vx: 0,
      vy: 0,
      dirX: 1,
      dirY: 0,
      stamina: 100,
      charge: 0,
      charging: false,
      stride: 0,
      trail: [],
    };
    s.p2 = {
      x: PITCH_R - PITCH_W * 0.25,
      y: CH / 2,
      vx: 0,
      vy: 0,
      dirX: -1,
      dirY: 0,
      stamina: 100,
      charge: 0,
      charging: false,
      stride: 0,
      trail: [],
    };
    s.gk1 = { x: PITCH_L + 20, y: CH / 2, vy: 0 };
    s.gk2 = { x: PITCH_R - 20, y: CH / 2, vy: 0 };
    s.ball = { x: CW / 2, y: CH / 2, vx: 0, vy: 0, angle: 0, trail: [] };
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
    s.particles = [];
    s.started = false;
    s.targetRemote = null;
    endedRef.current = false;
    startTimeRef.current = Date.now();
    resetPositions();
    setStarted(false);
    setHud({
      s1: 0,
      s2: 0,
      timeLeft: MATCH_SECONDS,
      goldenGoal: false,
      goalBanner: '',
    });
  }, [resetPositions]);

  useEffect(() => {
    resetFullMatch();
  }, [matchSeed, resetFullMatch]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const onBlur = () => {
      keysRef.current.clear();
      touchRef.current = {
        up: false,
        down: false,
        left: false,
        right: false,
        sprint: false,
        shoot: false,
      };
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

  const readLocalInput = (): FootballInput => {
    const k = keysRef.current;
    const t = touchRef.current;
    return {
      up: t.up || k.has('KeyW') || k.has('ArrowUp'),
      down: t.down || k.has('KeyS') || k.has('ArrowDown'),
      left: t.left || k.has('KeyA') || k.has('ArrowLeft'),
      right: t.right || k.has('KeyD') || k.has('ArrowRight'),
      sprint: t.sprint || k.has('ShiftLeft') || k.has('ShiftRight'),
      shoot: t.shoot || k.has('Space') || k.has('Enter') || k.has('KeyF'),
    };
  };

  useEffect(() => {
    const handlePacket = (pkt: unknown) => {
      const msg = pkt as {
        t?: string;
        seed?: number;
        inp?: FootballInput;
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
          p1x: number;
          p1y: number;
          p1dx: number;
          p1dy: number;
          p1st: number;
          p1ch: number;
          p2x: number;
          p2y: number;
          p2dx: number;
          p2dy: number;
          p2st: number;
          p2ch: number;
          gk1y: number;
          gk2y: number;
          bx: number;
          by: number;
          ba: number;
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
        s.targetRemote = {
          p1x: d.p1x,
          p1y: d.p1y,
          p1dx: d.p1dx,
          p1dy: d.p1dy,
          p1st: d.p1st,
          p1ch: d.p1ch,
          p2x: d.p2x,
          p2y: d.p2y,
          p2dx: d.p2dx,
          p2dy: d.p2dy,
          p2st: d.p2st,
          p2ch: d.p2ch,
          gk1y: d.gk1y,
          gk2y: d.gk2y,
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
              ? `${winnerProfile.name} netted the Golden Goal!`
              : `${winnerProfile.name} won Top-Down Football ${d.s1}–${d.s2}.`,
            durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
          });
        }
      }
    };

    const rtc = createRoomRtcChannel({
      roomCode: online.roomCode,
      myUid: online.myUid,
      isHost: online.isHost,
      sessionKey: `fb_${matchSeed}`,
      onMessage: handlePacket,
      onStatusChange: (open) => setRtcOpen(open),
    });
    rtcRef.current = rtc;

    let unsubFb: (() => void) | null = null;
    if (online.isHost) {
      const p = `rooms/${online.roomCode}/sync/football_input`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'football_input'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `fb_${matchSeed}` || rtc.isOpen()) return;
          remoteInputRef.current = d.payload as FootballInput;
        },
        (err) => handleFirestoreError(err, OperationType.GET, p)
      );
    } else {
      const p = `rooms/${online.roomCode}/sync/football_state`;
      unsubFb = onSnapshot(
        doc(db, 'rooms', online.roomCode, 'sync', 'football_state'),
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data();
          if (d.gameId !== `fb_${matchSeed}` || rtc.isOpen()) return;
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
    let hudTimer = 0;
    let netTick = 0;
    let fbNetTick = 0;
    let lastInpKey = '';

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
      const winnerId = s.s1 > s.s2 ? p1.id : p2.id;
      const winnerProfile = s.s1 > s.s2 ? p1 : p2;
      onMatchEnd({
        winner: winnerId,
        scoreLabel: `${p1.name} ${s.s1} — ${s.s2} ${p2.name}`,
        summary: s.goldenGoal
          ? `${winnerProfile.name} netted the Golden Goal!`
          : `${winnerProfile.name} won Top-Down Football ${s.s1}–${s.s2}.`,
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
          inp.sprint ? 1 : 0
        }${inp.shoot ? 1 : 0}`;
        netTick += dtSec;
        if (rtcRef.current?.isOpen()) {
          if (key !== lastInpKey || netTick > 0.05) {
            rtcRef.current.send({ t: 'inp', seed: matchSeed, inp });
            lastInpKey = key;
            netTick = 0;
          }
        } else {
          fbNetTick += dtSec;
          if (key !== lastInpKey && fbNetTick > 0.08) {
            lastInpKey = key;
            fbNetTick = 0;
            const path = `rooms/${online.roomCode}/sync/football_input`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'football_input'), {
              docId: 'football_input',
              gameId: `fb_${matchSeed}`,
              seq: Math.floor(now),
              updatedByUid: online.myUid,
              payload: inp,
              updatedAt: serverTimestamp(),
            }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
          }
        }

        if (s.targetRemote) {
          const t = s.targetRemote;
          const lerp = Math.min(1, dtSec * 22);
          s.p1.stride += Math.hypot(t.p1x - s.p1.x, t.p1y - s.p1.y) * 0.14;
          s.p2.stride += Math.hypot(t.p2x - s.p2.x, t.p2y - s.p2.y) * 0.14;
          s.p1.x += (t.p1x - s.p1.x) * lerp;
          s.p1.y += (t.p1y - s.p1.y) * lerp;
          s.p1.dirX = t.p1dx;
          s.p1.dirY = t.p1dy;
          s.p1.stamina = t.p1st;
          s.p1.charge = t.p1ch;
          s.p1.charging = t.p1ch > 0.02;

          s.p2.x += (t.p2x - s.p2.x) * lerp;
          s.p2.y += (t.p2y - s.p2.y) * lerp;
          s.p2.dirX = t.p2dx;
          s.p2.dirY = t.p2dy;
          s.p2.stamina = t.p2st;
          s.p2.charge = t.p2ch;
          s.p2.charging = t.p2ch > 0.02;

          s.gk1.y += (t.gk1y - s.gk1.y) * lerp;
          s.gk2.y += (t.gk2y - s.gk2.y) * lerp;
          s.ball.x += (t.bx - s.ball.x) * lerp;
          s.ball.y += (t.by - s.ball.y) * lerp;
          s.ball.angle = t.ba;
        }
      } else if (s.started && !endedRef.current) {
        if (s.goalFreeze > 0) {
          s.goalFreeze -= dtSec;
          if (s.goalFreeze <= 0) {
            s.goalBanner = '';
            resetPositions();
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

          const b = s.ball;
          const localInp = readLocalInput();
          const guestInp = remoteInputRef.current;
          const p1Inp = online.mySide === 'p2' ? guestInp : localInp;
          const p2Inp = online.mySide === 'p2' ? localInp : guestInp;

          const updateStriker = (pl: TopPlayer, inp: FootballInput, accent: string) => {
            let ix = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
            let iy = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
            const mag = Math.hypot(ix, iy);
            if (mag > 0) {
              ix /= mag;
              iy /= mag;
              pl.dirX = ix;
              pl.dirY = iy;
            }

            const isSprinting = inp.sprint && pl.stamina > 4 && mag > 0;
            if (isSprinting) pl.stamina = Math.max(0, pl.stamina - 34 * dtSec);
            else pl.stamina = Math.min(100, pl.stamina + 26 * dtSec);

            const speed = isSprinting ? 10.2 : 7.4;
            const targetVx = ix * speed;
            const targetVy = iy * speed;
            pl.vx += (targetVx - pl.vx) * 0.48 * dt;
            pl.vy += (targetVy - pl.vy) * 0.48 * dt;
            pl.x += pl.vx * dt;
            pl.y += pl.vy * dt;

            const moveSpd = Math.hypot(pl.vx, pl.vy);
            if (moveSpd > 0.6) pl.stride += moveSpd * 0.08 * dt;

            pl.x = Math.max(PITCH_L + PLAYER_R, Math.min(PITCH_R - PLAYER_R, pl.x));
            pl.y = Math.max(PITCH_T + PLAYER_R, Math.min(PITCH_B - PLAYER_R, pl.y));

            if (moveSpd > 4.2) {
              pl.trail.push({ x: pl.x, y: pl.y });
              if (pl.trail.length > 7) pl.trail.shift();
            } else if (pl.trail.length > 0) {
              pl.trail.shift();
            }

            if (inp.shoot) {
              pl.charging = true;
              pl.charge = Math.min(1, pl.charge + dtSec * 2.4);
            } else if (pl.charging) {
              const dist = Math.hypot(b.x - pl.x, b.y - pl.y);
              if (dist <= PLAYER_R + BALL_R + 34) {
                const shotPower = 12.5 + pl.charge * 11.5;
                const aimX = dist > 2 ? (b.x - pl.x) / dist : pl.dirX;
                const aimY = dist > 2 ? (b.y - pl.y) / dist : pl.dirY;
                const mixX = aimX * 0.55 + pl.dirX * 0.45;
                const mixY = aimY * 0.55 + pl.dirY * 0.45;
                const mixLen = Math.hypot(mixX, mixY) || 1;
                b.vx = (mixX / mixLen) * shotPower + pl.vx * 0.25;
                b.vy = (mixY / mixLen) * shotPower + pl.vy * 0.25;
                sound.playKick(0.9 + pl.charge * 0.55);
                if (pl.charge > 0.55) s.shake = 6;
                spawnParticles(b.x, b.y, accent, 12, 5.5);
              }
              pl.charging = false;
              pl.charge = 0;
            }

            // Close-control dribbling cushion
            const dx = b.x - pl.x;
            const dy = b.y - pl.y;
            const d = Math.hypot(dx, dy);
            const minD = PLAYER_R + BALL_R;
            if (d < minD && d > 0.01) {
              const nx = dx / d;
              const ny = dy / d;
              b.x = pl.x + nx * (minD + 0.5);
              b.y = pl.y + ny * (minD + 0.5);
              b.vx = pl.vx * 1.15 + nx * 1.5;
              b.vy = pl.vy * 1.15 + ny * 1.5;
              sound.playBounce();
            }
          };

          updateStriker(s.p1, p1Inp, p1.accentColor);
          updateStriker(s.p2, p2Inp, p2.accentColor);

          const pdx = s.p2.x - s.p1.x;
          const pdy = s.p2.y - s.p1.y;
          const pDist = Math.hypot(pdx, pdy);
          if (pDist < PLAYER_R * 2 && pDist > 0.01) {
            const nx = pdx / pDist;
            const ny = pdy / pDist;
            const ov = PLAYER_R * 2 - pDist;
            s.p1.x -= nx * ov * 0.5;
            s.p1.y -= ny * ov * 0.5;
            s.p2.x += nx * ov * 0.5;
            s.p2.y += ny * ov * 0.5;
          }

          const updateKeeper = (gk: Keeper, baseX: number, clearDir: 1 | -1) => {
            const targetY = Math.max(GOAL_TOP + GK_R + 6, Math.min(GOAL_BOT - GK_R - 6, b.y));
            const diff = targetY - gk.y;
            const maxSpd = 4.6;
            gk.vy = Math.max(-maxSpd, Math.min(maxSpd, diff * 0.18));
            gk.y += gk.vy * dt;
            gk.x = baseX;

            const dx = b.x - gk.x;
            const dy = b.y - gk.y;
            const dist = Math.hypot(dx, dy);
            const minD = GK_R + BALL_R;
            if (dist < minD && dist > 0.01) {
              const nx = dx / dist;
              const ny = dy / dist;
              b.x = gk.x + nx * minD;
              b.y = gk.y + ny * minD;
              const spd = Math.max(8.5, Math.hypot(b.vx, b.vy) * 0.88);
              b.vx = clearDir * Math.abs(nx * spd + 3);
              b.vy = ny * spd;
              sound.playKick(0.95);
              spawnParticles(b.x, b.y, '#FFFFFF', 8, 4);
            }
          };

          updateKeeper(s.gk1, PITCH_L + 18, 1);
          updateKeeper(s.gk2, PITCH_R - 18, -1);

          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vx *= Math.pow(0.986, dt);
          b.vy *= Math.pow(0.986, dt);
          b.angle += Math.hypot(b.vx, b.vy) * 0.045 * dt;

          if (Math.hypot(b.vx, b.vy) > 5) {
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 9) b.trail.shift();
          } else if (b.trail.length > 0) {
            b.trail.shift();
          }

          if (b.y - BALL_R < PITCH_T) {
            b.y = PITCH_T + BALL_R;
            b.vy = Math.abs(b.vy) * 0.85;
            sound.playBounce();
          } else if (b.y + BALL_R > PITCH_B) {
            b.y = PITCH_B - BALL_R;
            b.vy = -Math.abs(b.vy) * 0.85;
            sound.playBounce();
          }

          const inGoalMouthY = b.y > GOAL_TOP + BALL_R * 0.3 && b.y < GOAL_BOT - BALL_R * 0.3;
          if (!inGoalMouthY) {
            if (b.x - BALL_R < PITCH_L) {
              b.x = PITCH_L + BALL_R;
              b.vx = Math.abs(b.vx) * 0.85;
              sound.playBounce();
            } else if (b.x + BALL_R > PITCH_R) {
              b.x = PITCH_R - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.85;
              sound.playBounce();
            }
          }

          const posts = [
            { x: PITCH_L, y: GOAL_TOP },
            { x: PITCH_L, y: GOAL_BOT },
            { x: PITCH_R, y: GOAL_TOP },
            { x: PITCH_R, y: GOAL_BOT },
          ];
          for (const pt of posts) {
            const dx = b.x - pt.x;
            const dy = b.y - pt.y;
            const dist = Math.hypot(dx, dy);
            const minD = BALL_R + 6;
            if (dist < minD && dist > 0.01) {
              const nx = dx / dist;
              const ny = dy / dist;
              b.x = pt.x + nx * minD;
              b.y = pt.y + ny * minD;
              const dot = b.vx * nx + b.vy * ny;
              if (dot < 0) {
                b.vx -= 1.85 * dot * nx;
                b.vy -= 1.85 * dot * ny;
                sound.playWoodHit(1.2);
                s.shake = 6;
              }
            }
          }

          if (b.x < PITCH_L - BALL_R * 0.35 && inGoalMouthY) {
            s.s2 += 1;
            s.goalFreeze = 1.5;
            s.goalBanner = `${p2.name} Scores!`;
            s.shake = 14;
            sound.playGoalHorn();
            spawnParticles(PITCH_L, b.y, p2.accentColor, 36, 9);
            if (s.goldenGoal) finishMatch();
          } else if (b.x > PITCH_R + BALL_R * 0.35 && inGoalMouthY) {
            s.s1 += 1;
            s.goalFreeze = 1.5;
            s.goalBanner = `${p1.name} Scores!`;
            s.shake = 14;
            sound.playGoalHorn();
            spawnParticles(PITCH_R, b.y, p1.accentColor, 36, 9);
            if (s.goldenGoal) finishMatch();
          }
        }

        const stateSnapshot = {
          started: s.started,
          s1: s.s1,
          s2: s.s2,
          tl: Math.round(s.timeLeft * 10) / 10,
          gg: s.goldenGoal,
          gb: s.goalBanner,
          p1x: Math.round(s.p1.x),
          p1y: Math.round(s.p1.y),
          p1dx: Math.round(s.p1.dirX * 100) / 100,
          p1dy: Math.round(s.p1.dirY * 100) / 100,
          p1st: Math.round(s.p1.stamina),
          p1ch: Math.round(s.p1.charge * 100) / 100,
          p2x: Math.round(s.p2.x),
          p2y: Math.round(s.p2.y),
          p2dx: Math.round(s.p2.dirX * 100) / 100,
          p2dy: Math.round(s.p2.dirY * 100) / 100,
          p2st: Math.round(s.p2.stamina),
          p2ch: Math.round(s.p2.charge * 100) / 100,
          gk1y: Math.round(s.gk1.y),
          gk2y: Math.round(s.gk2.y),
          bx: Math.round(s.ball.x),
          by: Math.round(s.ball.y),
          ba: Math.round(s.ball.angle * 100) / 100,
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
            const path = `rooms/${online.roomCode}/sync/football_state`;
            setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'football_state'), {
              docId: 'football_state',
              gameId: `fb_${matchSeed}`,
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
        pt.life -= 0.026 * dt;
        if (pt.life <= 0) s.particles.splice(i, 1);
      }
      if (s.shake > 0) s.shake = Math.max(0, s.shake - 0.65 * dt);

      hudTimer += dtSec;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        setHud({
          s1: s.s1,
          s2: s.s2,
          timeLeft: Math.ceil(s.timeLeft),
          goldenGoal: s.goldenGoal,
          goalBanner: s.goalBanner,
        });
      }

      // Render Crisp Top-Down Pitch & Athletic Players
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.save();
        if (s.shake > 0.2) {
          ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
        }

        ctx.fillStyle = '#090F1A';
        ctx.fillRect(0, 0, CW, CH);

        const stripeW = PITCH_W / 10;
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#114D39' : '#0E4231';
          ctx.fillRect(PITCH_L + i * stripeW, PITCH_T, stripeW + 0.5, PITCH_H);
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.48)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(PITCH_L, PITCH_T, PITCH_W, PITCH_H);
        ctx.beginPath();
        ctx.moveTo(CW / 2, PITCH_T);
        ctx.lineTo(CW / 2, PITCH_B);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(CW / 2, CH / 2, 74, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(PITCH_L, CH / 2 - 135, 118, 270);
        ctx.strokeRect(PITCH_R - 118, CH / 2 - 135, 118, 270);

        const drawGoalNet = (x: number, accent: string) => {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
          ctx.fillRect(x, GOAL_TOP, GOAL_DEPTH, GOAL_HALF_H * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 4;
          ctx.strokeRect(x, GOAL_TOP, GOAL_DEPTH, GOAL_HALF_H * 2);
        };
        drawGoalNet(PITCH_L - GOAL_DEPTH, p1.accentColor);
        drawGoalNet(PITCH_R, p2.accentColor);

        for (let i = 0; i < s.ball.trail.length; i++) {
          const t = s.ball.trail[i];
          ctx.fillStyle = `rgba(248, 250, 252, ${(i / s.ball.trail.length) * 0.25})`;
          ctx.beginPath();
          ctx.arc(t.x, t.y, BALL_R * (0.5 + (i / s.ball.trail.length) * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }

        // Goalkeeper with Gloves
        const drawGk = (gk: Keeper, accent: string) => {
          ctx.save();
          ctx.translate(gk.x, gk.y);
          ctx.fillStyle = '#0F172A';
          ctx.strokeStyle = accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(-11, -18, 22, 36, 9);
          ctx.fill();
          ctx.stroke();
          // Gloves
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, -17, 5, 0, Math.PI * 2);
          ctx.arc(0, 17, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        };
        drawGk(s.gk1, p1.accentColor);
        drawGk(s.gk2, p2.accentColor);

        // Athletic Top-Down Striker
        const drawStriker = (
          pl: TopPlayer,
          accent: string,
          secondary: string,
          name: string,
          num: string
        ) => {
          for (let i = 0; i < pl.trail.length; i++) {
            const tr = pl.trail[i];
            ctx.fillStyle = accent;
            ctx.globalAlpha = (i / pl.trail.length) * 0.14;
            ctx.beginPath();
            ctx.arc(tr.x, tr.y, PLAYER_R * 0.72, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          if (pl.charging && pl.charge > 0.04) {
            ctx.strokeStyle = pl.charge > 0.65 ? '#F43F5E' : '#FBBF24';
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.arc(
              pl.x,
              pl.y,
              PLAYER_R + 8,
              -Math.PI / 2,
              -Math.PI / 2 + Math.PI * 2 * pl.charge
            );
            ctx.stroke();
          }

          ctx.save();
          ctx.translate(pl.x, pl.y);

          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.arc(2, 4, PLAYER_R, 0, Math.PI * 2);
          ctx.fill();

          const angle = Math.atan2(pl.dirY, pl.dirX);
          ctx.save();
          ctx.rotate(angle);

          // Running shoes
          const step = Math.sin(pl.stride) * 7;
          ctx.fillStyle = '#0F172A';
          ctx.beginPath();
          ctx.ellipse(6 + step, -10, 7, 4, 0, 0, Math.PI * 2);
          ctx.ellipse(6 - step, 10, 7, 4, 0, 0, Math.PI * 2);
          ctx.fill();

          // Broad Jersey Shoulders
          ctx.fillStyle = secondary;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, 0, 14, 20, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Head
          ctx.fillStyle = '#1E293B';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(2, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Aiming Arrow
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.moveTo(PLAYER_R + 7, 0);
          ctx.lineTo(PLAYER_R, -5);
          ctx.lineTo(PLAYER_R, 5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Name + Stamina bar
          ctx.fillStyle = accent;
          ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${name} #${num}`, 0, -PLAYER_R - 12);

          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(-16, PLAYER_R + 7, 32, 3.5);
          ctx.fillStyle = accent;
          ctx.fillRect(-16, PLAYER_R + 7, (32 * pl.stamina) / 100, 3.5);

          ctx.restore();
        };

        drawStriker(s.p1, p1.accentColor, p1.secondaryColor, p1.name, '1');
        drawStriker(s.p2, p2.accentColor, p2.secondaryColor, p2.name, '2');

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
        ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
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

  const touchBtnProps = (key: keyof FootballInput) => ({
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
      <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#f4f4f5] px-5 py-3">
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
        </div>

        <div className="flex items-center gap-3">
          <span className="tabular-nums text-3xl font-extrabold text-black">{hud.s2}</span>
          <span className="rounded-md border-2 border-black bg-[#b7c6c2] px-2.5 py-1 text-xs font-extrabold text-black">
            {p2.name}
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-black bg-[#171e19]">
        <canvas ref={canvasRef} width={CW} height={CH} className="block aspect-[1000/580] w-full" />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
            <h2 className="font-display text-3xl font-extrabold text-white">
              Football Match
            </h2>
            <p className="mt-1 text-sm font-medium text-[#b7c6c2]">
              {online.isHost
                ? 'Use WASD or Arrows to dribble, Space or Enter to shoot'
                : 'Waiting for the room host to kick off...'}
            </p>
            {online.isHost && (
              <button
                type="button"
                onClick={startMatch}
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

      {/* Mobile Touch D-Pad + Actions */}
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] p-3 lg:hidden">
        <div className="grid grid-cols-3 gap-1.5 w-[144px]">
          <div />
          <button
            type="button"
            {...touchBtnProps('up')}
            className="neo-btn flex h-11 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            UP
          </button>
          <div />
          <button
            type="button"
            {...touchBtnProps('left')}
            className="neo-btn flex h-11 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            L
          </button>
          <button
            type="button"
            {...touchBtnProps('down')}
            className="neo-btn flex h-11 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            DN
          </button>
          <button
            type="button"
            {...touchBtnProps('right')}
            className="neo-btn flex h-11 items-center justify-center bg-white text-xs font-extrabold text-black touch-none select-none active:bg-[#ffe17c]"
          >
            R
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            {...touchBtnProps('sprint')}
            className="neo-btn flex h-12 px-3.5 items-center justify-center bg-[#b7c6c2] text-xs font-extrabold text-black touch-none select-none"
          >
            SPRINT
          </button>
          <button
            type="button"
            {...touchBtnProps('shoot')}
            className="neo-btn flex h-12 px-4 items-center justify-center bg-black text-xs font-extrabold text-[#ffe17c] touch-none select-none"
          >
            SHOOT
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-black/70">
        <span>
          Controls: <strong className="font-extrabold text-black">WASD or Arrow Keys</strong> to run ·{' '}
          <strong className="font-extrabold text-black">Space / Enter / F</strong> to shoot ·{' '}
          <strong className="font-extrabold text-black">Shift</strong> to sprint
        </span>
        <span className="rounded-md border border-black bg-[#b7c6c2] px-2 py-0.5 font-bold text-black">
          {rtcOpen ? 'Connected' : 'Synced'}
        </span>
      </div>
    </div>
  );
};
