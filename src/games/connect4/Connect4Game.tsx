import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Flag, Handshake } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { useArcade } from '../../state/arcadeStore';
import { GameComponentProps, PlayerId } from '../../types/arcade';
import { sound } from '../../utils/sound';
import { useDeviceMode } from '../../utils/useDeviceMode';

const COLS = 7;
const ROWS = 6;

type Disc = PlayerId | null;

interface WinCheckResult {
  winner: PlayerId;
  cells: [number, number][];
}

function buildBoardFromMoves(moves: number[]): {
  board: Disc[][];
  lastMove: { r: number; c: number; side: PlayerId } | null;
} {
  const board: Disc[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let lastMove: { r: number; c: number; side: PlayerId } | null = null;

  moves.forEach((col, i) => {
    const side: PlayerId = i % 2 === 0 ? 'p1' : 'p2';
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][col] === null) {
        board[r][col] = side;
        lastMove = { r, c: col, side };
        break;
      }
    }
  });

  return { board, lastMove };
}

function findConnect4Win(board: Disc[][]): WinCheckResult | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const side = board[r][c];
      if (!side) continue;
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[r, c]];
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== side) {
            break;
          }
          cells.push([nr, nc]);
        }
        if (cells.length === 4) {
          return { winner: side, cells };
        }
      }
    }
  }
  return null;
}

export const Connect4Game: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const { voteDraw } = useArcade();
  const device = useDeviceMode();

  const [moves, setMoves] = useState<number[]>([]);
  const [resignedBy, setResignedBy] = useState<PlayerId | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  const startTimeRef = useRef(Date.now());
  const endedRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    setMoves([]);
    setResignedBy(null);
    setHoverCol(null);
    startTimeRef.current = Date.now();
    endedRef.current = false;
    seqRef.current = 0;

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/connect4`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'connect4'), {
        docId: 'connect4',
        gameId: `c4_${matchSeed}`,
        seq: 0,
        updatedByUid: online.myUid,
        payload: {
          seed: matchSeed,
          moves: [],
          resignedBy: '',
        },
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, [matchSeed, online.isHost, online.myUid, online.roomCode]);

  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/connect4`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'connect4'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const p = d.payload as {
          seed?: number;
          moves?: number[];
          resignedBy?: string;
        };
        if (p?.seed !== matchSeed) return;
        if (d.seq > seqRef.current) {
          const nextMoves = Array.isArray(p.moves) ? p.moves : [];
          if (nextMoves.length > moves.length) {
            sound.playWoodHit(0.75);
          }
          seqRef.current = d.seq;
          setMoves(nextMoves);
          setResignedBy(p.resignedBy === 'p1' || p.resignedBy === 'p2' ? p.resignedBy : null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchSeed, online.roomCode]);

  const { board, lastMove } = useMemo(() => buildBoardFromMoves(moves), [moves]);
  const winResult = useMemo(() => findConnect4Win(board), [board]);
  const isBoardFull = moves.length >= ROWS * COLS;

  useEffect(() => {
    if (endedRef.current) return;
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    if (resignedBy) {
      endedRef.current = true;
      const winner = resignedBy === 'p1' ? p2 : p1;
      const loser = resignedBy === 'p1' ? p1 : p2;
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${winner.name} wins by concession`,
        summary: `${loser.name} conceded after ${moves.length} discs.`,
        durationSeconds,
      });
      return;
    }

    if (winResult) {
      endedRef.current = true;
      const winner = winResult.winner === 'p1' ? p1 : p2;
      const timer = window.setTimeout(() => {
        onMatchEnd({
          winner: winner.id,
          scoreLabel: `4-in-a-Row (${moves.length} discs)`,
          summary: `${winner.name} connected 4 discs to take the victory!`,
          durationSeconds,
        });
      }, 650);
      return () => window.clearTimeout(timer);
    }

    if (isBoardFull) {
      endedRef.current = true;
      onMatchEnd({
        winner: 'draw',
        scoreLabel: '42/42 Board Full · Draw',
        summary: 'Every slot filled without a 4-in-a-row!',
        durationSeconds,
      });
    }
  }, [isBoardFull, moves.length, onMatchEnd, p1, p2, resignedBy, winResult]);

  const turnSide: PlayerId = moves.length % 2 === 0 ? 'p1' : 'p2';
  const isMyTurn = online.mySide === turnSide && !winResult && !isBoardFull && !resignedBy;

  const pushMoves = async (nextMoves: number[], resign: '' | PlayerId = '') => {
    const nextSeq = seqRef.current + 1;
    seqRef.current = nextSeq;
    setMoves(nextMoves);
    setResignedBy(resign || null);
    const path = `rooms/${online.roomCode}/sync/connect4`;
    await setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'connect4'), {
      docId: 'connect4',
      gameId: `c4_${matchSeed}`,
      seq: nextSeq,
      updatedByUid: online.myUid,
      payload: {
        seed: matchSeed,
        moves: nextMoves,
        resignedBy: resign,
      },
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
  };

  const canDropCol = (col: number) => board[0][col] === null;

  const handleDrop = (col: number) => {
    if (!isMyTurn || !canDropCol(col)) return;
    sound.playWoodHit(0.85);
    pushMoves([...moves, col]);
  };

  const handleConcede = () => {
    if (!online.mySide || endedRef.current) return;
    sound.playFoul();
    pushMoves(moves, online.mySide);
  };

  const isWinningCell = (r: number, c: number) =>
    winResult?.cells.some(([wr, wc]) => wr === r && wc === c) ?? false;

  const activePlayer = turnSide === 'p1' ? p1 : p2;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-black bg-white p-3.5 neo-shadow-lg sm:p-5">
        {/* Turn Pill Header */}
        <div className="flex w-full max-w-[540px] items-center justify-between rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2.5 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-black bg-[#ffe17c]" />
            <span className="text-black truncate max-w-[100px] sm:max-w-[140px]">{p1.name}</span>
          </div>
          <span className="rounded-lg border-2 border-black bg-white px-2.5 py-0.5 font-extrabold text-black">
            {isMyTurn ? 'Your Drop!' : `${activePlayer.name}'s Turn`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-black truncate max-w-[100px] sm:max-w-[140px]">{p2.name}</span>
            <span className="h-4 w-4 rounded-full border-2 border-black bg-[#b7c6c2]" />
          </div>
        </div>

        {/* Column Drop Buttons / Hover Indicator */}
        <div className="grid w-full max-w-[540px] grid-cols-7 gap-1.5 px-2 sm:gap-2 sm:px-3">
          {Array.from({ length: COLS }).map((_, c) => {
            const open = canDropCol(c) && isMyTurn;
            const activeHover = !device.isTouch && hoverCol === c && open;
            return (
              <button
                key={c}
                type="button"
                disabled={!open}
                onClick={() => handleDrop(c)}
                onMouseEnter={() => setHoverCol(c)}
                onMouseLeave={() => setHoverCol((prev) => (prev === c ? null : prev))}
                aria-label={`Drop disc in column ${c + 1}`}
                className={`flex h-9 sm:h-10 items-center justify-center rounded-lg border-2 border-black text-xs font-extrabold transition-all touch-manipulation ${
                  open
                    ? activeHover
                      ? turnSide === 'p1'
                        ? 'bg-[#ffe17c] -translate-y-0.5 cursor-pointer'
                        : 'bg-[#b7c6c2] -translate-y-0.5 cursor-pointer'
                      : 'bg-white hover:bg-[#f4f4f5] cursor-pointer'
                    : 'bg-[#f4f4f5] opacity-40 cursor-not-allowed'
                }`}
              >
                ▼
              </button>
            );
          })}
        </div>

        {/* 7x6 Charcoal Neo-Brutalist Connect 4 Frame */}
        <div className="w-full max-w-[540px] rounded-2xl border-2 border-black bg-[#171e19] p-2.5 neo-shadow-sm sm:p-3.5">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: COLS }).map((_, c) => {
              const colOpen = canDropCol(c) && isMyTurn;
              return (
                <div
                  key={c}
                  onClick={() => colOpen && handleDrop(c)}
                  onMouseEnter={() => setHoverCol(c)}
                  onMouseLeave={() => setHoverCol((prev) => (prev === c ? null : prev))}
                  className={`flex flex-col gap-1.5 sm:gap-2 rounded-lg p-0.5 transition-colors ${
                    colOpen ? 'cursor-pointer hover:bg-white/10' : ''
                  }`}
                >
                  {Array.from({ length: ROWS }).map((__, r) => {
                    const cell = board[r][c];
                    const isWin = isWinningCell(r, c);
                    const isLast = lastMove?.r === r && lastMove?.c === c;
                    return (
                      <div
                        key={r}
                        className="relative aspect-square w-full rounded-full border-2 border-black bg-[#0d120e] flex items-center justify-center overflow-hidden"
                      >
                        {cell && (
                          <motion.div
                            initial={isLast ? { y: -((r + 1) * 56), scale: 0.96 } : false}
                            animate={{ y: 0, scale: 1 }}
                            transition={{
                              type: 'spring',
                              stiffness: 340,
                              damping: 22,
                              mass: 0.9,
                            }}
                            className={`h-[88%] w-[88%] rounded-full border-2 ${
                              cell === 'p1' ? 'bg-[#ffe17c]' : 'bg-[#b7c6c2]'
                            } ${
                              isWin
                                ? 'border-white ring-2 ring-white'
                                : 'border-black'
                            } flex items-center justify-center`}
                          >
                            <div
                              className={`h-[56%] w-[56%] rounded-full border-2 border-black/35 ${
                                isWin ? 'bg-black/15' : ''
                              }`}
                            />
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs font-medium text-black/65">
          {device.isMobile
            ? 'Tap any column on the board or top arrow button to drop your disc.'
            : 'Click any column or top ▼ button to drop a disc. Connect 4 in any direction to win!'}
        </p>
      </div>

      {/* Side Info */}
      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <div className="border-b-2 border-black pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-black/60">Board Status</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-black">
            {winResult
              ? `${winResult.winner === 'p1' ? p1.name : p2.name} Wins!`
              : isBoardFull
                ? 'Draw — Board Full'
                : isMyTurn
                  ? 'Your Turn!'
                  : `${activePlayer.name}'s Turn`}
          </p>
          <p className="mt-1 text-xs font-medium text-black/70 tabular-nums">
            Discs played: {moves.length} / {ROWS * COLS}
          </p>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#ffe17c] px-3.5 py-2.5 font-bold text-black">
            <span>{p1.name} {online.mySide === 'p1' ? '(You)' : ''}</span>
            <span>Yellow Discs</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border-2 border-black bg-[#b7c6c2] px-3.5 py-2.5 font-bold text-black">
            <span>{p2.name} {online.mySide === 'p2' ? '(You)' : ''}</span>
            <span>Sage Discs</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          {online.opponentJoined && (
            <button
              type="button"
              onClick={() => voteDraw('yes')}
              className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#b7c6c2] px-3 py-2 text-xs font-bold text-black cursor-pointer"
            >
              <Handshake className="h-3.5 w-3.5" />
              Offer Draw
            </button>
          )}
          {online.mySide && (
            <button
              type="button"
              onClick={handleConcede}
              className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#ffe17c] px-3 py-2 text-xs font-bold text-black cursor-pointer"
            >
              <Flag className="h-3.5 w-3.5" />
              Concede
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};
