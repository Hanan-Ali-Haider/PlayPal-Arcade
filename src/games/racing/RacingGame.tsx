import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Flag, Play, Rocket } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { createRoomRtcChannel, RtcChannelHandle } from '../../firebase/rtcSync';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';

const CW = 1000;
const CH = 560;
const ROAD_L = 240;
const ROAD_R = 760;
const ROAD_W = ROAD_R - ROAD_L; // 520 (4 lanes of 130px)
const LANE_W = ROAD_W / 4;
const FINISH_DIST = 1200; // meters
const METER_PX = 16; // 1 meter = 16px on screen
const CAR_W = 46;
const CAR_H = 74;

interface DashInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
}

interface DashCar {
  x: number;
  vx: number;
  dist: number; // meters traveled (0 -> FINISH_DIST)
  speed: number; // m/s
  tilt: number; // visual lean angle
  boostCharge: number; // 0..100
  boosting: boolean;
  hitTimer: number; // seconds of wobble/recovery
  trail: { x: number; dist: number }[];
}

interface RoadItem {
  id: number;
  kind: 'traffic' | 'cone' | 'oil' | 'star';
  lane: number;
  x: number;
  dist: number;
  speed: number; // traffic moves forward slowly
  color: string;
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

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrackItems(seed: number): RoadItem[] {
  const rng = mulberry32(seed * 7919 + 104729);
  const items: RoadItem[] = [];
  const trafficColors = ['#ffffff', '#93c5fd', '#fca5a5', '#d8b4fe'];
  let id = 1;

  for (let d = 140; d < FINISH_DIST - 80; d += 52) {
    const roll = rng();
    const lane = Math.floor(rng() * 4);
    const x = ROAD_L + LANE_W * (lane + 0.5);

    if (roll < 0.34) {
      items.push({
        id: id++,
        kind: 'traffic',
        lane,
        x,
        dist: d + rng() * 14,
        speed: 10 + rng() * 8,
        color: trafficColors[Math.floor(rng() * trafficColors.length)],
      });
    } else if (roll < 0.6) {
      items.push({
        id: id++,
        kind: 'star',
        lane,
        x,
        dist: d + rng() * 12,
        speed: 0,
        color: '#ffe17c',
      });
    } else if (roll < 0.8) {
      items.push({
        id: id++,
        kind: 'cone',
        lane,
        x,
        dist: d + rng() * 12,
        speed: 0,
        color: '#f97316',
      });
    } else {
      items.push({
        id: id++,
        kind: 'oil',
        lane,
        x,
        dist: d + rng() * 12,
        speed: 0,
        color: '#000000',
      });
    }
  }
  return items;
}

function makeCar(laneIdx: number): DashCar {
  return {
    x: ROAD_L + LANE_W * (laneIdx + 0.5),
    vx: 0,
    dist: 0,
    speed: 0,
    tilt: 0,
    boostCharge: 100,
    boosting: false,
    hitTimer: 0,
    trail: [],
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const RacingGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<DashInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  });
  const remoteInputRef = useRef<DashInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
  });
  const rtcRef = useRef<RtcChannelHandle | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);
  const hostStartedRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [rtcOpen, setRtcOpen] = useState(false);
  const [hud, setHud] = useState({
    d1: 0,
    d2: 0,
    spd1: 0,
    spd2: 0,
    boost1: 100,
    boost2: 100,
    countdown: 3,
  });

  const isHost = online.isHost;
  const mySide = online.mySide ?? 'p1';

  const readLocalInput = useCallback((): DashInput => {
    const k = keysRef.current;
    const t = touchRef.current;
    return {
      up: t.up || k.has('KeyW') || k.has('ArrowUp'),
      down: t.down || k.has('KeyS') || k.has('ArrowDown'),
      left: t.left || k.has('KeyA') || k.has('ArrowLeft'),
      right: t.right || k.has('KeyD') || k.has('ArrowRight'),
      boost: t.boost || k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }, []);

  const syncDocRef = doc(db, 'rooms', online.roomCode, 'sync', 'racing');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target?.closest('[data-chat-panel]') || target?.closest('[data-modal]')) return;

      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'ShiftLeft',
          'ShiftRight',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keysRef.current.add(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    endedRef.current = false;
    hostStartedRef.current = false;
    keysRef.current.clear();
    touchRef.current = { up: false, down: false, left: false, right: false, boost: false };
    remoteInputRef.current = { up: false, down: false, left: false, right: false, boost: false };
    setStarted(false);
    setRtcOpen(false);
    setHud({
      d1: 0,
      d2: 0,
      spd1: 0,
      spd2: 0,
      boost1: 100,
      boost2: 100,
      countdown: 3,
    });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const c1 = makeCar(1);
    const c2 = makeCar(2);
    const items = buildTrackItems(matchSeed);
    const collectedStars = new Set<number>();

    const target1 = { ...c1 };
    const target2 = { ...c2 };
    let countdown = 3;
    let countdownTimer = 3.2;
    let lastBeep = 4;
    let shake = 0;
    const particles: Particle[] = [];
    let lastSendTime = 0;
    let lastFsSendTime = 0;
    let seq = 0;
    let lastInputSig = '';

    const spawnSparks = (x: number, y: number, color: string, count = 10) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 5;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          color,
          size: 3 + Math.random() * 4,
        });
      }
    };

    const applyPacket = (msg: Record<string, unknown>) => {
      if (msg.t === 'in' && isHost) {
        remoteInputRef.current = {
          up: Boolean(msg.u),
          down: Boolean(msg.d),
          left: Boolean(msg.l),
          right: Boolean(msg.r),
          boost: Boolean(msg.b),
        };
      } else if (msg.t === 'st' && !isHost) {
        if (Boolean(msg.started) && !hostStartedRef.current) {
          hostStartedRef.current = true;
          startTimeRef.current = Date.now();
          setStarted(true);
        }
        countdown = Number(msg.cd ?? 0);
        const s1 = msg.c1 as Record<string, unknown> | undefined;
        const s2 = msg.c2 as Record<string, unknown> | undefined;
        if (s1) {
          target1.x = Number(s1.x ?? c1.x);
          target1.dist = Number(s1.dist ?? 0);
          target1.speed = Number(s1.spd ?? 0);
          target1.tilt = Number(s1.tilt ?? 0);
          target1.boostCharge = Number(s1.bc ?? 100);
          target1.boosting = Boolean(s1.bo);
          target1.hitTimer = Number(s1.ht ?? 0);
        }
        if (s2) {
          target2.x = Number(s2.x ?? c2.x);
          target2.dist = Number(s2.dist ?? 0);
          target2.speed = Number(s2.spd ?? 0);
          target2.tilt = Number(s2.tilt ?? 0);
          target2.boostCharge = Number(s2.bc ?? 100);
          target2.boosting = Boolean(s2.bo);
          target2.hitTimer = Number(s2.ht ?? 0);
        }
        if (Array.isArray(msg.stars)) {
          collectedStars.clear();
          for (const id of msg.stars) collectedStars.add(Number(id));
        }

        const winner = msg.winner as string | undefined;
        if ((winner === 'p1' || winner === 'p2') && !endedRef.current) {
          endedRef.current = true;
          onMatchEnd({
            winner,
            scoreLabel: `${Math.round(target1.dist)}m — ${Math.round(target2.dist)}m`,
            summary: `${winner === 'p1' ? p1.name : p2.name} crossed the ${FINISH_DIST}m finish line first!`,
            durationSeconds: (Date.now() - startTimeRef.current) / 1000,
          });
        }
      }
    };

    const rtc = createRoomRtcChannel({
      roomCode: online.roomCode,
      myUid: online.myUid,
      isHost,
      sessionKey: `racing-${matchSeed}`,
      onMessage: (payload) => {
        if (payload && typeof payload === 'object') {
          applyPacket(payload as Record<string, unknown>);
        }
      },
      onStatusChange: (open) => setRtcOpen(open),
    });
    rtcRef.current = rtc;

    let lastSeenSeq = -1;
    const unsubFs = onSnapshot(
      syncDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as {
          gameId: string;
          seq: number;
          updatedByUid: string;
          payload: Record<string, unknown>;
        };
        if (data.gameId !== `racing-${matchSeed}`) return;
        if (data.updatedByUid === online.myUid) return;
        if (data.seq <= lastSeenSeq) return;
        lastSeenSeq = data.seq;
        applyPacket(data.payload);
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, `rooms/${online.roomCode}/sync/racing`)
    );

    const stepCar = (car: DashCar, input: DashInput, dt: number, carScreenY: number) => {
      if (car.hitTimer > 0) {
        car.hitTimer = Math.max(0, car.hitTimer - dt);
      }

      // Steer cleanly left/right
      const steerDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const steerSpeed = car.hitTimer > 0 ? 220 : 390;
      const targetVx = steerDir * steerSpeed;
      car.vx = lerp(car.vx, targetVx, Math.min(1, dt * 14));
      car.x = Math.max(ROAD_L + 30, Math.min(ROAD_R - 30, car.x + car.vx * dt));
      car.tilt = lerp(car.tilt, (car.vx / 390) * 0.16, Math.min(1, dt * 14));

      // Boost
      const wantsBoost = input.boost && car.boostCharge > 4 && car.hitTimer <= 0.1;
      car.boosting = wantsBoost;
      if (wantsBoost) {
        car.boostCharge = Math.max(0, car.boostCharge - 38 * dt);
      } else {
        car.boostCharge = Math.min(100, car.boostCharge + 8 * dt);
      }

      // Forward speed (m/s)
      const topSpeed = wantsBoost ? 68 : input.up ? 48 : input.down ? 10 : 26;
      const accel = wantsBoost ? 58 : input.down ? 44 : 30;
      if (car.hitTimer > 0.25) {
        car.speed = lerp(car.speed, 16, Math.min(1, dt * 8));
      } else {
        car.speed = lerp(car.speed, topSpeed, Math.min(1, dt * (accel / 25)));
      }
      car.dist += car.speed * dt;

      if (Math.random() < (wantsBoost ? 0.85 : 0.35)) {
        car.trail.push({ x: car.x, dist: car.dist });
        if (car.trail.length > 14) car.trail.shift();
      }

      // Item & traffic collisions
      for (const item of items) {
        const itemDist = item.dist + item.speed * Math.max(0, (Date.now() - startTimeRef.current) / 1000) * 0.08;
        if (Math.abs(car.dist - itemDist) < 3.1 && Math.abs(car.x - item.x) < 40) {
          if (item.kind === 'star') {
            if (!collectedStars.has(item.id)) {
              collectedStars.add(item.id);
              car.boostCharge = Math.min(100, car.boostCharge + 48);
              car.speed = Math.max(car.speed, 62);
              sound.playPowerUp();
              spawnSparks(car.x, carScreenY, '#ffe17c', 12);
            }
          } else if (car.hitTimer <= 0) {
            car.hitTimer = item.kind === 'traffic' ? 0.72 : item.kind === 'oil' ? 0.65 : 0.45;
            car.speed = Math.min(car.speed, 16);
            shake = 7;
            sound.playFoul();
            spawnSparks(car.x, carScreenY, item.kind === 'cone' ? '#f97316' : '#ffffff', 10);
          }
        }
      }
    };

    const drawCar = (
      car: DashCar,
      screenY: number,
      fill: string,
      label: string,
      isMine: boolean
    ) => {
      // Speed trail
      for (let i = 0; i < car.trail.length; i++) {
        const pt = car.trail[i];
        const ty = screenY + (car.dist - pt.dist) * METER_PX;
        if (ty < -40 || ty > CH + 40) continue;
        ctx.save();
        ctx.globalAlpha = (i / car.trail.length) * (car.boosting ? 0.45 : 0.16);
        ctx.fillStyle = car.boosting ? '#ffe17c' : fill;
        ctx.fillRect(pt.x - 10, ty + 20, 20, 12);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(car.x, screenY);
      const wobble = car.hitTimer > 0 ? Math.sin(car.hitTimer * 35) * 0.28 : 0;
      ctx.rotate(car.tilt + wobble);

      // Tires
      ctx.fillStyle = '#000000';
      ctx.fillRect(-CAR_W / 2 - 4, -CAR_H / 2 + 8, 6, 16);
      ctx.fillRect(CAR_W / 2 - 2, -CAR_H / 2 + 8, 6, 16);
      ctx.fillRect(-CAR_W / 2 - 4, CAR_H / 2 - 24, 6, 16);
      ctx.fillRect(CAR_W / 2 - 2, CAR_H / 2 - 24, 6, 16);

      // Body
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 10);
      ctx.fill();
      ctx.stroke();

      // Racing stripe
      ctx.fillStyle = '#171e19';
      ctx.fillRect(-5, -CAR_H / 2 + 4, 10, CAR_H - 8);

      // Windshield
      ctx.fillStyle = '#171e19';
      ctx.beginPath();
      ctx.roundRect(-CAR_W / 2 + 7, -14, CAR_W - 14, 16, 4);
      ctx.fill();

      // Headlights
      ctx.fillStyle = '#ffe17c';
      ctx.fillRect(-CAR_W / 2 + 6, -CAR_H / 2 - 1, 9, 5);
      ctx.fillRect(CAR_W / 2 - 15, -CAR_H / 2 - 1, 9, 5);

      // Boost exhaust flare (geometric yellow burst — no fire emoji/flame)
      if (car.boosting) {
        ctx.fillStyle = '#ffe17c';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, CAR_H / 2);
        ctx.lineTo(0, CAR_H / 2 + 22 + Math.random() * 8);
        ctx.lineTo(10, CAR_H / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();

      // Clean floating tag
      ctx.font = '800 11px Satoshi, sans-serif';
      const tw = Math.max(44, ctx.measureText(label).width + 14);
      ctx.fillStyle = isMine ? '#000000' : '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(car.x - tw / 2, screenY + CAR_H / 2 + 8, tw, 20, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isMine ? '#ffe17c' : '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, car.x, screenY + CAR_H / 2 + 18);
    };

    const draw = () => {
      const myCar = mySide === 'p2' ? c2 : c1;
      const otherCar = mySide === 'p2' ? c1 : c2;
      const cameraDist = myCar.dist;
      const myScreenY = CH - 132;
      const distToScreenY = (d: number) => myScreenY - (d - cameraDist) * METER_PX;

      ctx.save();
      if (shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= 0.85;
      }

      // Grass shoulders
      ctx.fillStyle = '#b7c6c2';
      ctx.fillRect(0, 0, CW, CH);

      // Asphalt Highway
      ctx.fillStyle = '#171e19';
      ctx.fillRect(ROAD_L, 0, ROAD_W, CH);

      // Red & White Racing Curbs
      const curbOffset = (cameraDist * METER_PX) % 64;
      for (let y = -64 + curbOffset; y < CH + 64; y += 32) {
        const isDark = Math.floor((y - curbOffset) / 32) % 2 === 0;
        ctx.fillStyle = isDark ? '#ffe17c' : '#ffffff';
        ctx.fillRect(ROAD_L - 16, y, 16, 32);
        ctx.fillRect(ROAD_R, y, 16, 32);
      }
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ROAD_L - 16, 0);
      ctx.lineTo(ROAD_L - 16, CH);
      ctx.moveTo(ROAD_L, 0);
      ctx.lineTo(ROAD_L, CH);
      ctx.moveTo(ROAD_R, 0);
      ctx.lineTo(ROAD_R, CH);
      ctx.moveTo(ROAD_R + 16, 0);
      ctx.lineTo(ROAD_R + 16, CH);
      ctx.stroke();

      // Scrolling Lane Dividers
      const dashOffset = (cameraDist * METER_PX) % 72;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([36, 36]);
      ctx.lineDashOffset = -dashOffset;
      for (let i = 1; i <= 3; i++) {
        const lx = ROAD_L + LANE_W * i;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, CH);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Roadside Trees / Mileposts
      const propStep = 24; // meters
      const firstProp = Math.floor((cameraDist - 12) / propStep) * propStep;
      for (let d = firstProp; d < cameraDist + 42; d += propStep) {
        if (d < 0) continue;
        const py = distToScreenY(d);
        if (py < -50 || py > CH + 50) continue;
        // Left tree
        ctx.fillStyle = '#ffe17c';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(130, py, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Right tree
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(870, py, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 100m Distance Markers on Asphalt
      for (let m = 100; m < FINISH_DIST; m += 100) {
        const my = distToScreenY(m);
        if (my < -30 || my > CH + 30) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(ROAD_L, my - 2, ROAD_W, 4);
        ctx.font = '800 12px monospace';
        ctx.fillStyle = '#ffe17c';
        ctx.textAlign = 'left';
        ctx.fillText(`${m}m`, ROAD_L + 12, my - 10);
      }

      // Checkered Finish Line
      const finY = distToScreenY(FINISH_DIST);
      if (finY > -60 && finY < CH + 60) {
        const sq = 26;
        const cols = Math.ceil(ROAD_W / sq);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(ROAD_L + c * sq, finY - sq + r * sq, sq, sq);
          }
        }
        ctx.strokeStyle = '#ffe17c';
        ctx.lineWidth = 4;
        ctx.strokeRect(ROAD_L, finY - sq, ROAD_W, sq * 2);
      }

      // Road Items (Traffic, Stars, Cones, Oil)
      const elapsedSec = hostStartedRef.current
        ? Math.max(0, (Date.now() - startTimeRef.current) / 1000)
        : 0;
      for (const item of items) {
        if (item.kind === 'star' && collectedStars.has(item.id)) continue;
        const itemDist = item.dist + item.speed * elapsedSec * 0.08;
        const iy = distToScreenY(itemDist);
        if (iy < -60 || iy > CH + 60) continue;

        if (item.kind === 'oil') {
          ctx.fillStyle = '#000000';
          ctx.strokeStyle = '#b7c6c2';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(item.x, iy, 28, 16, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (item.kind === 'cone') {
          ctx.fillStyle = '#f97316';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(item.x, iy, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(item.x, iy, 6, 0, Math.PI * 2);
          ctx.fill();
        } else if (item.kind === 'star') {
          ctx.save();
          ctx.translate(item.x, iy);
          ctx.fillStyle = '#ffe17c';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const rad = i % 2 === 0 ? 18 : 8;
            const ang = (i * Math.PI) / 5 - Math.PI / 2;
            const px = Math.cos(ang) * rad;
            const py = Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else if (item.kind === 'traffic') {
          ctx.save();
          ctx.translate(item.x, iy);
          ctx.fillStyle = item.color;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-20, -32, 40, 64, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#171e19';
          ctx.fillRect(-13, -14, 26, 14);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-14, 26, 8, 4);
          ctx.fillRect(6, 26, 8, 4);
          ctx.restore();
        }
      }

      // Sparks / Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life -= 0.04;
        if (pt.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = pt.life;
        ctx.fillStyle = pt.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        ctx.strokeRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        ctx.restore();
      }

      // Draw Rival Car (if in view) & My Car
      const otherScreenY = distToScreenY(otherCar.dist);
      const otherFill = mySide === 'p2' ? '#ffe17c' : '#b7c6c2';
      const otherName = mySide === 'p2' ? p1.name : p2.name;
      const myFill = mySide === 'p2' ? '#b7c6c2' : '#ffe17c';
      const myName = mySide === 'p2' ? p2.name : p1.name;

      if (otherScreenY >= -90 && otherScreenY <= CH + 90) {
        drawCar(otherCar, otherScreenY, otherFill, otherName, false);
      } else {
        // Off-screen rival distance badge
        const isAhead = otherCar.dist > myCar.dist;
        const badgeY = isAhead ? 28 : CH - 28;
        const gap = Math.abs(Math.round(otherCar.dist - myCar.dist));
        ctx.fillStyle = otherFill;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(otherCar.x - 66, badgeY - 14, 132, 28, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.font = '800 11px Satoshi, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${isAhead ? '▲' : '▼'} ${otherName} (${gap}m)`, otherCar.x, badgeY);
      }

      drawCar(myCar, myScreenY, myFill, `${myName} (You)`, true);

      // Mini Vertical Race Progress Bar on Left Shoulder
      const barX = 42;
      const barTop = 64;
      const barH = CH - 128;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(barX, barTop, 28, barH, 10);
      ctx.fill();
      ctx.stroke();

      const p1Prog = Math.min(1, c1.dist / FINISH_DIST);
      const p2Prog = Math.min(1, c2.dist / FINISH_DIST);
      ctx.fillStyle = '#ffe17c';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(barX + 14, barTop + barH - p1Prog * barH, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#b7c6c2';
      ctx.beginPath();
      ctx.arc(barX + 14, barTop + barH - p2Prog * barH, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Countdown Banner
      if (hostStartedRef.current && countdown > 0) {
        ctx.fillStyle = '#171e19';
        ctx.strokeStyle = '#ffe17c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(CW / 2 - 58, CH / 2 - 52, 116, 104, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe17c';
        ctx.font = '900 58px Cabinet Grotesk, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(countdown), CW / 2, CH / 2 + 2);
      }

      ctx.restore();
    };

    let raf = 0;
    let lastTs = performance.now();
    let hudTick = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const localInput = readLocalInput();

      if (!isHost) {
        const sig = `${localInput.up ? 1 : 0}${localInput.down ? 1 : 0}${localInput.left ? 1 : 0}${localInput.right ? 1 : 0}${localInput.boost ? 1 : 0}`;
        const minInterval = rtcRef.current?.isOpen() ? 35 : 90;
        if (sig !== lastInputSig || now - lastSendTime > minInterval) {
          lastInputSig = sig;
          lastSendTime = now;
          const pkt = {
            t: 'in',
            u: localInput.up ? 1 : 0,
            d: localInput.down ? 1 : 0,
            l: localInput.left ? 1 : 0,
            r: localInput.right ? 1 : 0,
            b: localInput.boost ? 1 : 0,
          };
          if (rtcRef.current?.isOpen()) {
            rtcRef.current.send(pkt);
          } else {
            seq += 1;
            setDoc(syncDocRef, {
              docId: 'racing',
              gameId: `racing-${matchSeed}`,
              seq,
              updatedByUid: online.myUid,
              payload: pkt,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }

        // Smooth interpolation for Guest
        const alpha = Math.min(1, dt * 16);
        c1.x = lerp(c1.x, target1.x, alpha);
        c1.dist = lerp(c1.dist, target1.dist, alpha);
        c1.speed = target1.speed;
        c1.tilt = lerp(c1.tilt, target1.tilt, alpha);
        c1.boostCharge = target1.boostCharge;
        c1.boosting = target1.boosting;
        c1.hitTimer = target1.hitTimer;

        c2.x = lerp(c2.x, target2.x, alpha);
        c2.dist = lerp(c2.dist, target2.dist, alpha);
        c2.speed = target2.speed;
        c2.tilt = lerp(c2.tilt, target2.tilt, alpha);
        c2.boostCharge = target2.boostCharge;
        c2.boosting = target2.boosting;
        c2.hitTimer = target2.hitTimer;
      } else {
        if (hostStartedRef.current && !endedRef.current) {
          if (countdownTimer > 0) {
            countdownTimer = Math.max(0, countdownTimer - dt);
            const nextCd = Math.ceil(countdownTimer);
            countdown = nextCd;
            if (nextCd !== lastBeep && nextCd > 0) {
              lastBeep = nextCd;
              sound.playClick();
            }
            if (countdownTimer === 0) sound.playPowerUp();
          } else {
            const p1Input = mySide === 'p1' ? localInput : remoteInputRef.current;
            const p2Input = mySide === 'p2' ? localInput : remoteInputRef.current;
            const myDist = mySide === 'p2' ? c2.dist : c1.dist;
            stepCar(c1, p1Input, dt, CH - 132 - (c1.dist - myDist) * METER_PX);
            stepCar(c2, p2Input, dt, CH - 132 - (c2.dist - myDist) * METER_PX);

            // Friendly car-to-car bump
            if (Math.abs(c1.dist - c2.dist) < 4.5 && Math.abs(c1.x - c2.x) < CAR_W) {
              const push = c1.x <= c2.x ? -1 : 1;
              c1.x = Math.max(ROAD_L + 30, Math.min(ROAD_R - 30, c1.x + push * 14));
              c2.x = Math.max(ROAD_L + 30, Math.min(ROAD_R - 30, c2.x - push * 14));
              c1.vx = push * 150;
              c2.vx = -push * 150;
              sound.playBounce();
            }
          }

          let winner: 'p1' | 'p2' | undefined;
          if (c1.dist >= FINISH_DIST && c2.dist >= FINISH_DIST) {
            winner = c1.dist >= c2.dist ? 'p1' : 'p2';
          } else if (c1.dist >= FINISH_DIST) {
            winner = 'p1';
          } else if (c2.dist >= FINISH_DIST) {
            winner = 'p2';
          }

          const statePkt = {
            t: 'st',
            started: true,
            cd: countdown,
            c1: {
              x: Math.round(c1.x),
              dist: Number(c1.dist.toFixed(1)),
              spd: Math.round(c1.speed),
              tilt: Number(c1.tilt.toFixed(2)),
              bc: Math.round(c1.boostCharge),
              bo: c1.boosting,
              ht: Number(c1.hitTimer.toFixed(2)),
            },
            c2: {
              x: Math.round(c2.x),
              dist: Number(c2.dist.toFixed(1)),
              spd: Math.round(c2.speed),
              tilt: Number(c2.tilt.toFixed(2)),
              bc: Math.round(c2.boostCharge),
              bo: c2.boosting,
              ht: Number(c2.hitTimer.toFixed(2)),
            },
            stars: Array.from(collectedStars),
            winner,
          };

          if (rtcRef.current?.isOpen()) {
            if (now - lastSendTime > 30 || winner) {
              lastSendTime = now;
              rtcRef.current.send(statePkt);
            }
          } else if (now - lastFsSendTime > 95 || winner) {
            lastFsSendTime = now;
            seq += 1;
            setDoc(syncDocRef, {
              docId: 'racing',
              gameId: `racing-${matchSeed}`,
              seq,
              updatedByUid: online.myUid,
              payload: statePkt,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }

          if (winner && !endedRef.current) {
            endedRef.current = true;
            onMatchEnd({
              winner,
              scoreLabel: `${Math.round(c1.dist)}m — ${Math.round(c2.dist)}m`,
              summary: `${winner === 'p1' ? p1.name : p2.name} crossed the ${FINISH_DIST}m finish line first!`,
              durationSeconds: (Date.now() - startTimeRef.current) / 1000,
            });
          }
        }
      }

      draw();

      hudTick += 1;
      if (hudTick % 6 === 0) {
        setHud({
          d1: Math.min(FINISH_DIST, Math.round(c1.dist)),
          d2: Math.min(FINISH_DIST, Math.round(c2.dist)),
          spd1: Math.round(c1.speed * 3.6),
          spd2: Math.round(c2.speed * 3.6),
          boost1: Math.round(c1.boostCharge),
          boost2: Math.round(c2.boostCharge),
          countdown,
        });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      unsubFs();
      rtc.close();
    };
  }, [isHost, matchSeed, mySide, onMatchEnd, online.myUid, online.roomCode, p1.name, p2.name, readLocalInput]);

  const beginHostRace = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    sound.playPowerUp();
    startTimeRef.current = Date.now();
    hostStartedRef.current = true;
    setStarted(true);
  };

  const setTouch = (field: keyof DashInput, val: boolean) => {
    touchRef.current[field] = val;
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-3 sm:p-4 neo-shadow-lg">
      {/* Live Distance & Speed HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md border-2 border-black bg-[#ffe17c] px-2.5 py-1 text-xs font-extrabold text-black">
            {p1.name}
          </span>
          <span className="font-mono-num text-sm font-extrabold text-black">
            {hud.d1}m <span className="text-black/50">/ {FINISH_DIST}m</span>
          </span>
          <span className="hidden sm:inline font-mono-num text-xs font-bold text-black/65">
            {hud.spd1} km/h
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-extrabold text-black">
            <Flag className="h-3.5 w-3.5" />
            Street Dash
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-lg border-2 border-black bg-[#171e19] px-2.5 py-1 text-xs font-bold text-[#ffe17c]">
            <Rocket className="h-3.5 w-3.5" />
            {mySide === 'p2' ? hud.boost2 : hud.boost1}%
          </span>
          <span className="text-[11px] font-bold text-black/60">
            {rtcOpen ? 'Fast P2P' : 'Cloud Sync'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline font-mono-num text-xs font-bold text-black/65">
            {hud.spd2} km/h
          </span>
          <span className="font-mono-num text-sm font-extrabold text-black">
            {hud.d2}m <span className="text-black/50">/ {FINISH_DIST}m</span>
          </span>
          <span className="rounded-md border-2 border-black bg-[#b7c6c2] px-2.5 py-1 text-xs font-extrabold text-black">
            {p2.name}
          </span>
        </div>
      </div>

      {/* Highway Canvas */}
      <div className="relative overflow-hidden rounded-xl border-2 border-black bg-[#171e19]">
        <canvas ref={canvasRef} width={CW} height={CH} className="block aspect-[1000/560] w-full" />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-4 text-center">
            <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
              Street Dash Racing
            </h2>
            <p className="mt-2 max-w-md text-xs text-white/85 sm:text-sm">
              Steer left &amp; right with A/D or Arrows, hold W/↑ for full gas, and press Space for Turbo Boost. Dodge traffic &amp; grab yellow stars to hit {FINISH_DIST}m first!
            </p>
            {isHost ? (
              <button
                type="button"
                onClick={beginHostRace}
                className="neo-btn mt-5 inline-flex items-center gap-2 bg-[#ffe17c] px-6 py-3 text-sm font-extrabold text-black cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                Start Street Dash
              </button>
            ) : (
              <span className="mt-5 rounded-xl border-2 border-[#ffe17c] bg-[#171e19] px-5 py-2.5 text-xs font-bold text-[#ffe17c]">
                Waiting for Room Host to drop the green light...
              </span>
            )}
          </div>
        )}
      </div>

      {/* Mobile & Touch Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={() => setTouch('left', true)}
            onPointerUp={() => setTouch('left', false)}
            onPointerLeave={() => setTouch('left', false)}
            onPointerCancel={() => setTouch('left', false)}
            className="neo-btn bg-white px-5 py-3.5 text-sm font-extrabold text-black select-none"
          >
            Left
          </button>
          <button
            type="button"
            onPointerDown={() => setTouch('right', true)}
            onPointerUp={() => setTouch('right', false)}
            onPointerLeave={() => setTouch('right', false)}
            onPointerCancel={() => setTouch('right', false)}
            className="neo-btn bg-white px-5 py-3.5 text-sm font-extrabold text-black select-none"
          >
            Right
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={() => setTouch('down', true)}
            onPointerUp={() => setTouch('down', false)}
            onPointerLeave={() => setTouch('down', false)}
            onPointerCancel={() => setTouch('down', false)}
            className="neo-btn bg-[#b7c6c2] px-3.5 py-3.5 text-xs font-extrabold text-black select-none"
          >
            Brake
          </button>
          <button
            type="button"
            onPointerDown={() => setTouch('boost', true)}
            onPointerUp={() => setTouch('boost', false)}
            onPointerLeave={() => setTouch('boost', false)}
            onPointerCancel={() => setTouch('boost', false)}
            className="neo-btn bg-black px-4 py-3.5 text-xs font-extrabold text-[#ffe17c] select-none"
          >
            Turbo
          </button>
          <button
            type="button"
            onPointerDown={() => setTouch('up', true)}
            onPointerUp={() => setTouch('up', false)}
            onPointerLeave={() => setTouch('up', false)}
            onPointerCancel={() => setTouch('up', false)}
            className="neo-btn bg-[#ffe17c] px-5 py-3.5 text-sm font-extrabold text-black select-none"
          >
            Gas
          </button>
        </div>
      </div>

      <p className="hidden sm:block text-center text-xs font-medium text-black/65">
        Steer: A / D or Left / Right · Gas / Brake: W / S or Up / Down · Turbo Boost: Space or Shift
      </p>
    </div>
  );
};
