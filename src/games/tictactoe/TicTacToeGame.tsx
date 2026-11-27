import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Flag, RotateCcw } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { useArcade } from '../../state/arcadeStore';
import { GameComponentProps, PlayerId } from '../../types/arcade';
import { sound } from '../../utils/sound';
import { useDeviceMode } from '../../utils/useDeviceMode';

type Cell = 'X' | 'O' | null;

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

interface SyncedTicTacToe {
  seed: number;
  board: Cell[];
  round: number;
  starter: PlayerId;
  turn: PlayerId;
  p1Score: number;
  p2Score: number;
  roundDraws: number;
  roundBanner: string;
  winLine: number[] | null;
  resignedBy: '' | PlayerId;
}

const TARGET_WINS = 2; // Best of 3 decisive rounds

function findWinLine(board: Cell[]): { winner: 'X' | 'O'; line: [number, number, number] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, line };
    }
  }
  return null;
}

function getLineCoords(line: number[]): { x1: number; y1: number; x2: number; y2: number } {
  const center = (idx: number) => ({
    x: (idx % 3) * 100 + 50,
    y: Math.floor(idx / 3) * 100 + 50,
  });
  const start = center(line[0]);
  const end = center(line[2]);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

export const TicTacToeGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const { voteDraw } = useArcade();
  const device = useDeviceMode();

  const [state, setState] = useState<SyncedTicTacToe>({
    seed: matchSeed,
    board: Array(9).fill(null),
    round: 1,
    starter: 'p1',
    turn: 'p1',
    p1Score: 0,
    p2Score: 0,
    roundDraws: 0,
    roundBanner: '',
    winLine: null,
    resignedBy: '',
  });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const startTimeRef = useRef(Date.now());
  const endedRef = useRef(false);
  const seqRef = useRef(0);
  const roundTimerRef = useRef<number | null>(null);

  const pushState = async (next: SyncedTicTacToe) => {
    const nextSeq = seqRef.current + 1;
    seqRef.current = nextSeq;
    setState(next);
    const path = `rooms/${online.roomCode}/sync/tictactoe`;
    await setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'tictactoe'), {
      docId: 'tictactoe',
      gameId: `ttt_${matchSeed}`,
      seq: nextSeq,
      updatedByUid: online.myUid,
      payload: next,
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
  };

  useEffect(() => {
    if (roundTimerRef.current) {
      window.clearTimeout(roundTimerRef.current);
      roundTimerRef.current = null;
    }
    const fresh: SyncedTicTacToe = {
      seed: matchSeed,
      board: Array(9).fill(null),
      round: 1,
      starter: 'p1',
      turn: 'p1',
      p1Score: 0,
      p2Score: 0,
      roundDraws: 0,
      roundBanner: '',
      winLine: null,
      resignedBy: '',
    };
    setState(fresh);
    startTimeRef.current = Date.now();
    endedRef.current = false;
    seqRef.current = 0;

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/tictactoe`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'tictactoe'), {
        docId: 'tictactoe',
        gameId: `ttt_${matchSeed}`,
        seq: 0,
        updatedByUid: online.myUid,
        payload: fresh,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }

    return () => {
      if (roundTimerRef.current) {
        window.clearTimeout(roundTimerRef.current);
        roundTimerRef.current = null;
      }
    };
  }, [matchSeed, online.isHost, online.myUid, online.roomCode]);

  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/tictactoe`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'tictactoe'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const p = d.payload as SyncedTicTacToe | undefined;
        if (!p || p.seed !== matchSeed) return;
        if (d.seq > seqRef.current) {
          seqRef.current = d.seq;
          setState(p);
          if (p.winLine) sound.playPowerUp();
          else sound.playChessMove();
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [matchSeed, online.roomCode]);

  // Match End detection
  useEffect(() => {
    if (endedRef.current) return;
    if (state.resignedBy) {
      endedRef.current = true;
      const winner = state.resignedBy === 'p1' ? p2 : p1;
      const loser = state.resignedBy === 'p1' ? p1 : p2;
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${p1.name} ${state.p1Score} — ${state.p2Score} ${p2.name}`,
        summary: `${loser.name} conceded the Tic Tac Toe series.`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
      return;
    }

    if (state.p1Score >= TARGET_WINS || state.p2Score >= TARGET_WINS) {
      endedRef.current = true;
      const winner = state.p1Score >= TARGET_WINS ? p1 : p2;
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${p1.name} ${state.p1Score} — ${state.p2Score} ${p2.name}`,
        summary: `${winner.name} won the Best-of-3 Tic Tac Toe series in ${state.round} rounds!`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
    } else if (state.roundDraws >= 4 && state.roundBanner === '' && state.board.every((c) => c === null)) {
      // If 4 consecutive draws happened without a decisive winner, call it a draw or keep going
    }
  }, [onMatchEnd, p1, p2, state]);

  const myMark: 'X' | 'O' = online.mySide === 'p2' ? 'O' : 'X';
  const isMyTurn =
    online.mySide === state.turn &&
    !endedRef.current &&
    !state.winLine &&
    !state.roundBanner;

  const handleCellClick = (idx: number) => {
    if (!isMyTurn || state.board[idx] !== null) return;
    const mark: 'X' | 'O' = state.turn === 'p1' ? 'X' : 'O';
    const nextBoard = [...state.board];
    nextBoard[idx] = mark;

    const win = findWinLine(nextBoard);
    const isBoardFull = nextBoard.every((c) => c !== null);

    if (win) {
      sound.playPowerUp();
      const roundWinnerSide: PlayerId = win.winner === 'X' ? 'p1' : 'p2';
      const nextP1 = state.p1Score + (roundWinnerSide === 'p1' ? 1 : 0);
      const nextP2 = state.p2Score + (roundWinnerSide === 'p2' ? 1 : 0);
      const winnerName = roundWinnerSide === 'p1' ? p1.name : p2.name;

      const updated: SyncedTicTacToe = {
        ...state,
        board: nextBoard,
        p1Score: nextP1,
        p2Score: nextP2,
        winLine: win.line,
        roundBanner: `${winnerName} wins Round ${state.round}!`,
      };
      pushState(updated);

      if (nextP1 < TARGET_WINS && nextP2 < TARGET_WINS) {
        const nextStarter: PlayerId = state.starter === 'p1' ? 'p2' : 'p1';
        roundTimerRef.current = window.setTimeout(() => {
          pushState({
            ...updated,
            board: Array(9).fill(null),
            round: updated.round + 1,
            starter: nextStarter,
            turn: nextStarter,
            winLine: null,
            roundBanner: '',
          });
        }, 1450);
      }
      return;
    }

    if (isBoardFull) {
      sound.playFoul();
      const updated: SyncedTicTacToe = {
        ...state,
        board: nextBoard,
        roundDraws: state.roundDraws + 1,
        roundBanner: `Round ${state.round} Draw!`,
      };
      pushState(updated);

      const nextStarter: PlayerId = state.starter === 'p1' ? 'p2' : 'p1';
      roundTimerRef.current = window.setTimeout(() => {
        pushState({
          ...updated,
          board: Array(9).fill(null),
          round: updated.round + 1,
          starter: nextStarter,
          turn: nextStarter,
          winLine: null,
          roundBanner: '',
        });
      }, 1350);
      return;
    }

    sound.playChessMove();
    pushState({
      ...state,
      board: nextBoard,
      turn: state.turn === 'p1' ? 'p2' : 'p1',
    });
  };

  const handleConcede = () => {
    if (!online.mySide || endedRef.current) return;
    sound.playFoul();
    pushState({ ...state, resignedBy: online.mySide });
  };

  const strikeCoords = useMemo(
    () => (state.winLine ? getLineCoords(state.winLine) : null),
    [state.winLine]
  );

  const activePlayer = state.turn === 'p1' ? p1 : p2;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-black bg-white p-4 neo-shadow-lg sm:p-6">
        {/* Series Score Header */}
        <div className="flex w-full max-w-[440px] items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-[#ffe17c] font-display text-sm font-extrabold text-black">
              X
            </span>
            <div>
              <p className="text-xs font-extrabold text-black truncate max-w-[90px] sm:max-w-[120px]">
                {p1.name}
              </p>
              <p className="text-[11px] font-bold text-black/60 tabular-nums">
                {state.p1Score}/{TARGET_WINS}
              </p>
            </div>
          </div>

          <div className="text-center">
            <span className="rounded-lg border-2 border-black bg-[#171e19] px-3 py-1 text-xs font-extrabold text-[#ffe17c]">
              Round {state.round}
            </span>
          </div>

          <div className="flex items-center gap-2 text-right">
            <div>
              <p className="text-xs font-extrabold text-black truncate max-w-[90px] sm:max-w-[120px]">
                {p2.name}
              </p>
              <p className="text-[11px] font-bold text-black/60 tabular-nums">
                {state.p2Score}/{TARGET_WINS}
              </p>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-[#b7c6c2] font-display text-sm font-extrabold text-black">
              O
            </span>
          </div>
        </div>

        {/* 3x3 Neo-Brutalist Grid */}
        <div className="relative aspect-square w-full max-w-[420px] rounded-2xl border-2 border-black bg-[#171e19] p-3 neo-shadow-sm select-none">
          <div className="grid h-full w-full grid-cols-3 grid-rows-3 gap-2.5">
            {state.board.map((cell, idx) => {
              const isWinCell = state.winLine?.includes(idx) ?? false;
              const canClick = isMyTurn && cell === null;
              const showGhost = !device.isTouch && canClick && hoverIdx === idx;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!canClick && cell === null}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx((cur) => (cur === idx ? null : cur))}
                  onClick={() => handleCellClick(idx)}
                  aria-label={`Cell ${idx + 1}`}
                  className={`relative flex items-center justify-center rounded-xl border-2 border-black transition-colors touch-manipulation ${
                    isWinCell
                      ? 'bg-[#ffe17c]'
                      : cell
                        ? 'bg-white'
                        : canClick
                          ? 'bg-white hover:bg-[#ffe17c]/35 active:bg-[#ffe17c] cursor-pointer'
                          : 'bg-[#f4f4f5]'
                  }`}
                >
                  {cell === 'X' && (
                    <motion.svg
                      viewBox="0 0 80 80"
                      className="h-3/4 w-3/4"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                    >
                      <line
                        x1="18"
                        y1="18"
                        x2="62"
                        y2="62"
                        stroke="#171e19"
                        strokeWidth="12"
                        strokeLinecap="round"
                      />
                      <line
                        x1="62"
                        y1="18"
                        x2="18"
                        y2="62"
                        stroke="#171e19"
                        strokeWidth="12"
                        strokeLinecap="round"
                      />
                    </motion.svg>
                  )}

                  {cell === 'O' && (
                    <motion.svg
                      viewBox="0 0 80 80"
                      className="h-3/4 w-3/4"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 450, damping: 24 }}
                    >
                      <circle
                        cx="40"
                        cy="40"
                        r="23"
                        fill="#b7c6c2"
                        stroke="#000000"
                        strokeWidth="8"
                      />
                    </motion.svg>
                  )}

                  {showGhost && (
                    <span className="font-display text-4xl font-extrabold text-black/20">
                      {myMark}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Animated Strike-through Line */}
          {strikeCoords && (
            <svg
              viewBox="0 0 300 300"
              className="pointer-events-none absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]"
            >
              <motion.line
                x1={strikeCoords.x1}
                y1={strikeCoords.y1}
                x2={strikeCoords.x2}
                y2={strikeCoords.y2}
                stroke="#000000"
                strokeWidth="12"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28 }}
              />
            </svg>
          )}

          {state.roundBanner && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 p-4">
              <div className="rounded-xl border-2 border-black bg-[#ffe17c] px-5 py-2.5 text-center neo-shadow-sm">
                <p className="font-display text-xl font-extrabold text-black">
                  {state.roundBanner}
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs font-medium text-black/65">
          {device.isMobile
            ? 'Tap any empty square to drop your mark. First to 2 round wins takes the match!'
            : 'Click any square on your turn. First to 2 round wins takes the match!'}
        </p>
      </div>

      {/* Side Info Panel */}
      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <div className="border-b-2 border-black pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-black/60">Turn Status</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-black">
            {isMyTurn ? 'Your Turn!' : `${activePlayer.name}'s Turn`}
          </p>
          <p className="mt-1 text-xs font-medium text-black/70">
            {online.mySide === 'p1'
              ? `Playing as ${p1.name} (X)`
              : online.mySide === 'p2'
                ? `Playing as ${p2.name} (O)`
                : 'Claim a side in the room to play'}
          </p>
        </div>

        <div className="rounded-xl border-2 border-black bg-[#f4f4f5] p-3.5 text-xs space-y-1.5">
          <p className="font-extrabold text-black">Match Format: Best of 3 Wins</p>
          <p className="text-black/75">
            Draws: <span className="font-bold text-black">{state.roundDraws}</span> · Opening turn alternates every round.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {online.opponentJoined && (
            <button
              type="button"
              onClick={() => voteDraw('yes')}
              className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#b7c6c2] px-3 py-2 text-xs font-bold text-black cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Vote Draw
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
