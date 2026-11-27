import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Crown, Flag, FlipVertical, Handshake } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { useArcade } from '../../state/arcadeStore';
import { GameComponentProps, PlayerId } from '../../types/arcade';
import { sound } from '../../utils/sound';
import { useDeviceMode } from '../../utils/useDeviceMode';

interface CheckerPiece {
  id: string;
  owner: PlayerId;
  king: boolean;
}

type Board = (CheckerPiece | null)[][];

interface Coord {
  r: number;
  c: number;
}

interface CheckerMove {
  from: Coord;
  to: Coord;
  capture?: Coord;
}

interface SerializedCheckerPiece {
  id: string;
  owner: PlayerId;
  king: boolean;
  r: number;
  c: number;
}

interface SyncedCheckersState {
  seed: number;
  board: Board;
  turn: PlayerId;
  mustJumpFrom: Coord | null;
  moveCount: number;
  lastFrom: Coord | null;
  lastTo: Coord | null;
  resignedBy: '' | PlayerId;
}

interface FirestoreCheckersPayload {
  seed: number;
  pieces: SerializedCheckerPiece[];
  turn: PlayerId;
  mustJumpFrom: Coord | null;
  moveCount: number;
  lastFrom: Coord | null;
  lastTo: Coord | null;
  resignedBy: '' | PlayerId;
}

function boardToPieces(board: Board): SerializedCheckerPiece[] {
  const pieces: SerializedCheckerPiece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r]?.[c];
      if (cell) {
        pieces.push({ id: cell.id, owner: cell.owner, king: cell.king, r, c });
      }
    }
  }
  return pieces;
}

function piecesToBoard(pieces: SerializedCheckerPiece[]): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const p of pieces) {
    if (p && typeof p.r === 'number' && typeof p.c === 'number' && p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8) {
      board[p.r][p.c] = {
        id: String(p.id),
        owner: p.owner === 'p2' ? 'p2' : 'p1',
        king: Boolean(p.king),
      };
    }
  }
  return board;
}

function serializeCheckersState(s: SyncedCheckersState): FirestoreCheckersPayload {
  return {
    seed: s.seed,
    pieces: boardToPieces(s.board),
    turn: s.turn,
    mustJumpFrom: s.mustJumpFrom ?? null,
    moveCount: s.moveCount,
    lastFrom: s.lastFrom ?? null,
    lastTo: s.lastTo ?? null,
    resignedBy: s.resignedBy ?? '',
  };
}

function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  let pid = 1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r <= 2) {
          board[r][c] = { id: `chk-${pid++}`, owner: 'p2', king: false };
        } else if (r >= 5) {
          board[r][c] = { id: `chk-${pid++}`, owner: 'p1', king: false };
        }
      }
    }
  }
  return board;
}

function getCapturesFrom(board: Board, r: number, c: number): CheckerMove[] {
  const piece = board[r][c];
  if (!piece) return [];
  const dirs: number[] = piece.king ? [-1, 1] : piece.owner === 'p1' ? [-1] : [1];
  const moves: CheckerMove[] = [];

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (lr < 0 || lr >= 8 || lc < 0 || lc >= 8) continue;
      const mid = board[mr][mc];
      if (mid && mid.owner !== piece.owner && board[lr][lc] === null) {
        moves.push({ from: { r, c }, to: { r: lr, c: lc }, capture: { r: mr, c: mc } });
      }
    }
  }
  return moves;
}

function getQuietMovesFrom(board: Board, r: number, c: number): CheckerMove[] {
  const piece = board[r][c];
  if (!piece) return [];
  const dirs: number[] = piece.king ? [-1, 1] : piece.owner === 'p1' ? [-1] : [1];
  const moves: CheckerMove[] = [];

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      if (board[nr][nc] === null) {
        moves.push({ from: { r, c }, to: { r: nr, c: nc } });
      }
    }
  }
  return moves;
}

function getAllLegalMoves(
  board: Board,
  turn: PlayerId,
  mustJumpFrom: Coord | null
): { moves: CheckerMove[]; hasMandatoryCapture: boolean } {
  if (mustJumpFrom) {
    const jumps = getCapturesFrom(board, mustJumpFrom.r, mustJumpFrom.c);
    return { moves: jumps, hasMandatoryCapture: jumps.length > 0 };
  }

  const allCaptures: CheckerMove[] = [];
  const allQuiet: CheckerMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.owner === turn) {
        allCaptures.push(...getCapturesFrom(board, r, c));
        allQuiet.push(...getQuietMovesFrom(board, r, c));
      }
    }
  }

  if (allCaptures.length > 0) {
    return { moves: allCaptures, hasMandatoryCapture: true };
  }
  return { moves: allQuiet, hasMandatoryCapture: false };
}

export const CheckersGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const { voteDraw } = useArcade();
  const device = useDeviceMode();

  const [state, setState] = useState<SyncedCheckersState>(() => ({
    seed: matchSeed,
    board: createInitialBoard(),
    turn: 'p1',
    mustJumpFrom: null,
    moveCount: 0,
    lastFrom: null,
    lastTo: null,
    resignedBy: '',
  }));
  const [selected, setSelected] = useState<Coord | null>(null);
  const [manualFlipped, setManualFlipped] = useState(online.mySide === 'p2');

  const startTimeRef = useRef(Date.now());
  const endedRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (online.mySide === 'p2') setManualFlipped(true);
    else if (online.mySide === 'p1') setManualFlipped(false);
  }, [online.mySide]);

  useEffect(() => {
    const fresh: SyncedCheckersState = {
      seed: matchSeed,
      board: createInitialBoard(),
      turn: 'p1',
      mustJumpFrom: null,
      moveCount: 0,
      lastFrom: null,
      lastTo: null,
      resignedBy: '',
    };
    setState(fresh);
    setSelected(fresh.mustJumpFrom);
    startTimeRef.current = Date.now();
    endedRef.current = false;
    seqRef.current = 0;

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/checkers`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'checkers'), {
        docId: 'checkers',
        gameId: `chk_${matchSeed}`,
        seq: 0,
        updatedByUid: online.myUid,
        payload: serializeCheckersState(fresh),
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
    }
  }, [matchSeed, online.isHost, online.myUid, online.roomCode]);

  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/checkers`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'checkers'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const p = d.payload as Partial<FirestoreCheckersPayload> | undefined;
        if (!p || p.seed !== matchSeed) return;
        if (d.seq > seqRef.current) {
          seqRef.current = d.seq;
          const board = Array.isArray(p.pieces) ? piecesToBoard(p.pieces) : createInitialBoard();
          setState({
            seed: p.seed,
            board,
            turn: p.turn === 'p2' ? 'p2' : 'p1',
            mustJumpFrom: p.mustJumpFrom ?? null,
            moveCount: typeof p.moveCount === 'number' ? p.moveCount : 0,
            lastFrom: p.lastFrom ?? null,
            lastTo: p.lastTo ?? null,
            resignedBy: p.resignedBy === 'p1' || p.resignedBy === 'p2' ? p.resignedBy : '',
          });
          setSelected(p.mustJumpFrom ?? null);
          sound.playChessMove();
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [matchSeed, online.roomCode]);

  const counts = useMemo(() => {
    let p1Left = 0;
    let p2Left = 0;
    let p1Kings = 0;
    let p2Kings = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = state.board[r]?.[c];
        if (!piece) continue;
        if (piece.owner === 'p1') {
          p1Left++;
          if (piece.king) p1Kings++;
        } else {
          p2Left++;
          if (piece.king) p2Kings++;
        }
      }
    }
    return { p1Left, p2Left, p1Kings, p2Kings };
  }, [state.board]);

  const legalInfo = useMemo(
    () => getAllLegalMoves(state.board, state.turn, state.mustJumpFrom),
    [state.board, state.mustJumpFrom, state.turn]
  );

  // Check game over
  useEffect(() => {
    if (endedRef.current) return;
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    if (state.resignedBy) {
      endedRef.current = true;
      const winner = state.resignedBy === 'p1' ? p2 : p1;
      const loser = state.resignedBy === 'p1' ? p1 : p2;
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${winner.name} wins by resignation`,
        summary: `${loser.name} resigned after ${state.moveCount} moves.`,
        durationSeconds,
      });
      return;
    }

    if (counts.p1Left === 0 || counts.p2Left === 0 || legalInfo.moves.length === 0) {
      endedRef.current = true;
      const winner = state.turn === 'p1' ? p2 : p1;
      const reason =
        counts.p1Left === 0 || counts.p2Left === 0
          ? 'captured all opponent checkers'
          : 'left the opponent with no legal moves';
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${p1.name} ${12 - counts.p2Left} — ${12 - counts.p1Left} ${p2.name} captures`,
        summary: `${winner.name} ${reason}!`,
        durationSeconds,
      });
    }
  }, [counts.p1Left, counts.p2Left, legalInfo.moves.length, onMatchEnd, p1, p2, state]);

  const pushState = async (next: SyncedCheckersState) => {
    const nextSeq = seqRef.current + 1;
    seqRef.current = nextSeq;
    setState(next);
    setSelected(next.mustJumpFrom ?? null);
    const path = `rooms/${online.roomCode}/sync/checkers`;
    await setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'checkers'), {
      docId: 'checkers',
      gameId: `chk_${matchSeed}`,
      seq: nextSeq,
      updatedByUid: online.myUid,
      payload: serializeCheckersState(next),
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
  };

  const isMyTurn = online.mySide === state.turn && !endedRef.current;

  const selectedTargets = useMemo(() => {
    if (!selected || !isMyTurn) return [];
    return legalInfo.moves.filter((m) => m.from.r === selected.r && m.from.c === selected.c);
  }, [isMyTurn, legalInfo.moves, selected]);

  const handleSquareClick = (r: number, c: number) => {
    if (!isMyTurn) return;

    const targetMove = selectedTargets.find((m) => m.to.r === r && m.to.c === c);
    if (selected && targetMove) {
      const nextBoard: Board = state.board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
      const moving = nextBoard[targetMove.from.r][targetMove.from.c];
      if (!moving) return;

      nextBoard[targetMove.from.r][targetMove.from.c] = null;
      if (targetMove.capture) {
        nextBoard[targetMove.capture.r][targetMove.capture.c] = null;
      }

      const promoted =
        !moving.king &&
        ((moving.owner === 'p1' && targetMove.to.r === 0) ||
          (moving.owner === 'p2' && targetMove.to.r === 7));
      moving.king = moving.king || promoted;
      nextBoard[targetMove.to.r][targetMove.to.c] = moving;

      if (targetMove.capture) {
        sound.playChessCapture();
      } else {
        sound.playChessMove();
      }

      // Check for chained multi-jump (unless just crowned)
      const followUps =
        targetMove.capture && !promoted
          ? getCapturesFrom(nextBoard, targetMove.to.r, targetMove.to.c)
          : [];

      if (followUps.length > 0) {
        pushState({
          ...state,
          board: nextBoard,
          mustJumpFrom: { r: targetMove.to.r, c: targetMove.to.c },
          moveCount: state.moveCount + 1,
          lastFrom: targetMove.from,
          lastTo: targetMove.to,
        });
      } else {
        pushState({
          ...state,
          board: nextBoard,
          turn: state.turn === 'p1' ? 'p2' : 'p1',
          mustJumpFrom: null,
          moveCount: state.moveCount + 1,
          lastFrom: targetMove.from,
          lastTo: targetMove.to,
        });
      }
      return;
    }

    if (state.mustJumpFrom) {
      // Must finish multi-jump with locked piece
      setSelected(state.mustJumpFrom);
      return;
    }

    const clickedPiece = state.board[r][c];
    if (clickedPiece && clickedPiece.owner === state.turn) {
      const hasLegal = legalInfo.moves.some((m) => m.from.r === r && m.from.c === c);
      if (hasLegal) {
        sound.playClick();
        setSelected((prev) => (prev?.r === r && prev?.c === c ? null : { r, c }));
      }
    } else {
      setSelected(null);
    }
  };

  const handleResign = () => {
    if (!online.mySide || endedRef.current) return;
    sound.playFoul();
    pushState({ ...state, resignedBy: online.mySide });
  };

  const renderedPieces: { piece: CheckerPiece; r: number; c: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r]?.[c];
      if (p) renderedPieces.push({ piece: p, r, c });
    }
  }

  const activePlayer = state.turn === 'p1' ? p1 : p2;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-black bg-white p-3.5 neo-shadow-lg sm:p-5">
        {/* Top Opponent Strip */}
        <div className="flex w-full max-w-[540px] items-center justify-between rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border-2 border-black"
              style={{ backgroundColor: manualFlipped ? '#ffe17c' : '#171e19' }}
            />
            <span className="text-black">{manualFlipped ? p1.name : p2.name}</span>
          </div>
          <span className="tabular-nums text-black/70">
            {manualFlipped ? counts.p1Left : counts.p2Left} checkers left
          </span>
        </div>

        {/* 8x8 Board */}
        <div className="relative aspect-square w-full max-w-[540px] overflow-hidden rounded-xl border-2 border-black neo-shadow-sm select-none">
          <div className="grid h-full w-full grid-cols-8 grid-rows-8">
            {Array.from({ length: 64 }).map((_, idx) => {
              const displayR = Math.floor(idx / 8);
              const displayC = idx % 8;
              const r = manualFlipped ? 7 - displayR : displayR;
              const c = manualFlipped ? 7 - displayC : displayC;

              const isPlayableDark = (r + c) % 2 === 1;
              const isSelected = selected?.r === r && selected?.c === c;
              const isTarget = selectedTargets.some((m) => m.to.r === r && m.to.c === c);
              const isLast =
                (state.lastFrom?.r === r && state.lastFrom?.c === c) ||
                (state.lastTo?.r === r && state.lastTo?.c === c);
              const mustMoveThis =
                isMyTurn &&
                legalInfo.hasMandatoryCapture &&
                legalInfo.moves.some((m) => m.from.r === r && m.from.c === c);

              let bg = isPlayableDark ? 'bg-[#2c352e]' : 'bg-[#f4f4f5]';
              if (isLast && isPlayableDark) bg = 'bg-[#465749]';
              if (isSelected) bg = 'bg-[#ffe17c]';

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => handleSquareClick(r, c)}
                  aria-label={`Checker square ${r},${c}`}
                  className={`relative flex items-center justify-center touch-manipulation ${bg} ${
                    isPlayableDark ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {isTarget && (
                    <span className="h-5 w-5 rounded-full border-2 border-black bg-[#ffe17c] animate-pulse" />
                  )}
                  {mustMoveThis && !isSelected && (
                    <span className="pointer-events-none absolute inset-1 rounded-full border-2 border-[#ffe17c]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Animated Checkers Discs */}
          <div className="pointer-events-none absolute inset-0">
            {renderedPieces.map(({ piece, r, c }) => {
              const displayR = manualFlipped ? 7 - r : r;
              const displayC = manualFlipped ? 7 - c : c;
              const isSelected = selected?.r === r && selected?.c === c;
              return (
                <motion.div
                  key={piece.id}
                  layoutId={piece.id}
                  initial={false}
                  animate={{
                    left: `${displayC * 12.5}%`,
                    top: `${displayR * 12.5}%`,
                    scale: isSelected ? 1.1 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  className="absolute flex h-[12.5%] w-[12.5%] items-center justify-center p-1.5"
                >
                  <div
                    className={`flex h-full w-full items-center justify-center rounded-full border-2 border-black shadow-sm ${
                      piece.owner === 'p1' ? 'bg-[#ffe17c]' : 'bg-[#b7c6c2]'
                    }`}
                  >
                    <div
                      className={`flex h-[68%] w-[68%] items-center justify-center rounded-full border-2 border-black/50 ${
                        piece.owner === 'p1' ? 'bg-[#f4ce50]' : 'bg-[#94aba5]'
                      }`}
                    >
                      {piece.king && <Crown className="h-3.5 w-3.5 text-black sm:h-4 sm:w-4" />}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom Player Strip */}
        <div className="flex w-full max-w-[540px] items-center justify-between rounded-xl border-2 border-black bg-[#f4f4f5] px-4 py-2 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border-2 border-black"
              style={{ backgroundColor: manualFlipped ? '#171e19' : '#ffe17c' }}
            />
            <span className="text-black">{manualFlipped ? p2.name : p1.name}</span>
          </div>
          <span className="tabular-nums text-black/70">
            {manualFlipped ? counts.p2Left : counts.p1Left} checkers left
          </span>
        </div>

        <p className="text-xs font-medium text-black/65">
          {device.isMobile
            ? 'Tap a highlighted piece, then tap a glowing target square. Mandatory jumps apply!'
            : 'Click a piece to select, then click a highlighted diagonal square. Multi-jumps chain automatically.'}
        </p>
      </div>

      {/* Sidebar */}
      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <div className="border-b-2 border-black pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-black/60">Turn Status</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-black">
            {isMyTurn ? 'Your Turn!' : `${activePlayer.name}'s Turn`}
          </p>
          {isMyTurn && legalInfo.hasMandatoryCapture && (
            <span className="mt-2 inline-block rounded-md border-2 border-black bg-[#ffe17c] px-2.5 py-0.5 text-xs font-extrabold text-black">
              {state.mustJumpFrom ? 'Continue Multi-Jump!' : 'Capture Mandatory!'}
            </span>
          )}
          <p className="mt-1.5 text-xs font-medium text-black/70">
            {online.mySide === 'p1'
              ? `Playing as ${p1.name} (Yellow)`
              : online.mySide === 'p2'
                ? `Playing as ${p2.name} (Sage)`
                : 'Claim a side in the room to play'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setManualFlipped((f) => !f);
            }}
            className="neo-btn inline-flex items-center justify-center gap-1.5 bg-white px-3 py-2 text-xs font-bold text-black cursor-pointer"
          >
            <FlipVertical className="h-3.5 w-3.5" />
            Flip View
          </button>

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
        </div>

        {online.mySide && (
          <button
            type="button"
            onClick={handleResign}
            className="neo-btn inline-flex items-center justify-center gap-1.5 bg-[#ffe17c] px-3 py-2 text-xs font-bold text-black cursor-pointer"
          >
            <Flag className="h-3.5 w-3.5" />
            Resign Match
          </button>
        )}

        <div className="border-t-2 border-black pt-3 text-xs text-black/75 space-y-1">
          <p className="font-extrabold text-black">Quick Rules</p>
          <p>• Regular checkers move &amp; jump diagonally forward.</p>
          <p>• Reach the far row to crown a King (moves/jumps both ways).</p>
          <p>• Mandatory jumps &amp; chained multi-jumps apply automatically.</p>
        </div>
      </aside>
    </div>
  );
};
