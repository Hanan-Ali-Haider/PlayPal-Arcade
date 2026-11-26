import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { FlipVertical, Flag, Undo2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase/client';
import { GameComponentProps } from '../../types/arcade';
import { sound } from '../../utils/sound';
import { ChessPieceSvg } from './ChessPieces';
import {
  ChessState,
  Color,
  createInitialChessState,
  executeChessMove,
  findKing,
  getLegalMovesForSquare,
  getMaterialAdvantage,
  Piece,
  PieceType,
  SquareCoord,
} from './chessEngine';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

interface SerializedChessMove {
  fr: number;
  fc: number;
  tr: number;
  tc: number;
  promo?: PieceType;
}

export const ChessGame: React.FC<GameComponentProps> = ({
  p1,
  p2,
  online,
  onMatchEnd,
  matchSeed,
}) => {
  const [moves, setMoves] = useState<SerializedChessMove[]>([]);
  const [resignedBy, setResignedBy] = useState<'p1' | 'p2' | null>(null);
  const [selected, setSelected] = useState<SquareCoord | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: SquareCoord; to: SquareCoord } | null>(
    null
  );
  const [manualFlipped, setManualFlipped] = useState(online.mySide === 'p2');
  const startTimeRef = useRef<number>(Date.now());
  const endedRef = useRef<boolean>(false);
  const seqRef = useRef<number>(0);

  // Sync perspective when side changes
  useEffect(() => {
    if (online.mySide === 'p2') setManualFlipped(true);
    else if (online.mySide === 'p1') setManualFlipped(false);
  }, [online.mySide]);

  // Reset on matchSeed change
  useEffect(() => {
    setMoves([]);
    setResignedBy(null);
    setSelected(null);
    setPendingPromo(null);
    startTimeRef.current = Date.now();
    endedRef.current = false;
    seqRef.current = 0;

    if (online.isHost) {
      const path = `rooms/${online.roomCode}/sync/chess`;
      setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'chess'), {
        docId: 'chess',
        gameId: `chess_${matchSeed}`,
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

  // Subscribe to online chess moves
  useEffect(() => {
    const path = `rooms/${online.roomCode}/sync/chess`;
    const unsub = onSnapshot(
      doc(db, 'rooms', online.roomCode, 'sync', 'chess'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const p = d.payload as {
          seed?: number;
          moves?: SerializedChessMove[];
          resignedBy?: string;
        };
        if (p?.seed !== matchSeed) return;
        if (d.seq > seqRef.current || (d.seq === 0 && moves.length > 0)) {
          const prevLen = moves.length;
          const nextMoves = Array.isArray(p.moves) ? p.moves : [];
          if (nextMoves.length > prevLen) {
            sound.playChessMove();
          }
          seqRef.current = d.seq;
          setMoves(nextMoves);
          setResignedBy(
            p.resignedBy === 'p1' || p.resignedBy === 'p2' ? p.resignedBy : null
          );
          setSelected(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchSeed, online.roomCode]);

  // Deterministically derive ChessState from move list
  const currentState: ChessState = useMemo(() => {
    let st = createInitialChessState();
    for (const m of moves) {
      const next = executeChessMove(st, { r: m.fr, c: m.fc }, { r: m.tr, c: m.tc }, m.promo ?? 'q');
      if (next) st = next;
    }
    return st;
  }, [moves]);

  // Detect match end
  useEffect(() => {
    if (endedRef.current) return;
    if (resignedBy) {
      endedRef.current = true;
      const winner = resignedBy === 'p1' ? p2 : p1;
      const loser = resignedBy === 'p1' ? p1 : p2;
      onMatchEnd({
        winner: winner.id,
        scoreLabel: `${winner.name} wins by resignation`,
        summary: `${loser.name} resigned after ${currentState.history.length} moves.`,
        durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      });
      return;
    }

    if (
      currentState.status === 'checkmate' ||
      currentState.status === 'stalemate' ||
      currentState.status === 'draw_insufficient' ||
      currentState.status === 'draw_fifty'
    ) {
      endedRef.current = true;
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      const movesCount = currentState.history.length;
      if (currentState.status === 'checkmate' && currentState.winner) {
        const winProfile = currentState.winner === 'w' ? p1 : p2;
        onMatchEnd({
          winner: winProfile.id,
          scoreLabel: `Checkmate in ${Math.ceil(movesCount / 2)} moves`,
          summary: `${winProfile.name} delivered checkmate (${
            currentState.winner === 'w' ? 'White' : 'Black'
          }).`,
          durationSeconds: duration,
        });
      } else {
        const reason =
          currentState.status === 'stalemate'
            ? 'Stalemate'
            : currentState.status === 'draw_insufficient'
              ? 'Insufficient material'
              : '50-move rule';
        onMatchEnd({
          winner: 'draw',
          scoreLabel: `Draw · ${reason}`,
          summary: `Game ended in a draw by ${reason.toLowerCase()}.`,
          durationSeconds: duration,
        });
      }
    }
  }, [currentState, onMatchEnd, p1, p2, resignedBy]);

  const turnSide = currentState.turn === 'w' ? 'p1' : 'p2';
  const isMyTurn = online.mySide === turnSide && !endedRef.current;

  const pushState = async (nextMoves: SerializedChessMove[], nextResign: 'p1' | 'p2' | null = null) => {
    const nextSeq = seqRef.current + 1;
    seqRef.current = nextSeq;
    setMoves(nextMoves);
    setResignedBy(nextResign);

    const path = `rooms/${online.roomCode}/sync/chess`;
    await setDoc(doc(db, 'rooms', online.roomCode, 'sync', 'chess'), {
      docId: 'chess',
      gameId: `chess_${matchSeed}`,
      seq: nextSeq,
      updatedByUid: online.myUid,
      payload: {
        seed: matchSeed,
        moves: nextMoves,
        resignedBy: nextResign ?? '',
      },
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.WRITE, path));
  };

  const legalMoves = useMemo(() => {
    if (!selected || !isMyTurn) return [];
    return getLegalMovesForSquare(currentState, selected);
  }, [currentState, isMyTurn, selected]);

  const activePlayer = currentState.turn === 'w' ? p1 : p2;
  const lastMove = currentState.history[currentState.history.length - 1] ?? null;
  const kingInCheckSq =
    currentState.status === 'check' || currentState.status === 'checkmate'
      ? findKing(currentState.board, currentState.turn)
      : null;
  const material = useMemo(() => getMaterialAdvantage(currentState), [currentState]);

  const commitMove = (from: SquareCoord, to: SquareCoord, promo: PieceType = 'q') => {
    const next = executeChessMove(currentState, from, to, promo);
    if (!next) return;
    const last = next.history[next.history.length - 1];
    if (next.status === 'check' || next.status === 'checkmate') sound.playCheck();
    else if (last?.captured) sound.playChessCapture();
    else sound.playChessMove();

    const newMove: SerializedChessMove = {
      fr: from.r,
      fc: from.c,
      tr: to.r,
      tc: to.c,
      ...(promo && last?.promotion ? { promo } : {}),
    };
    setSelected(null);
    setPendingPromo(null);
    pushState([...moves, newMove], null);
  };

  const handleSquareClick = (r: number, c: number) => {
    if (!isMyTurn || pendingPromo) return;

    const clickedPiece = currentState.board[r][c];
    const targetLegal = legalMoves.find((m) => m.to.r === r && m.to.c === c);

    if (selected && targetLegal) {
      if (targetLegal.isPromotion) {
        setPendingPromo({ from: selected, to: { r, c } });
        return;
      }
      commitMove(selected, { r, c });
      return;
    }

    if (clickedPiece && clickedPiece.color === currentState.turn) {
      sound.playClick();
      if (selected && selected.r === r && selected.c === c) setSelected(null);
      else setSelected({ r, c });
    } else {
      setSelected(null);
    }
  };

  const handleUndo = () => {
    if (moves.length === 0 || endedRef.current) return;
    sound.playClick();
    pushState(moves.slice(0, -1), null);
  };

  const handleResign = () => {
    if (endedRef.current || !online.mySide) return;
    sound.playFoul();
    pushState(moves, online.mySide);
  };

  const renderedPieces: { piece: Piece; r: number; c: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = currentState.board[r][c];
      if (p) renderedPieces.push({ piece: p, r, c });
    }
  }

  const movePairs: { num: number; white: string; black?: string }[] = [];
  for (let i = 0; i < currentState.history.length; i += 2) {
    movePairs.push({
      num: i / 2 + 1,
      white: currentState.history[i].san,
      black: currentState.history[i + 1]?.san,
    });
  }

  const renderCapturedTray = (pieces: Piece[], advantage: number, colorLabel: Color) => (
    <div className="flex min-h-[28px] flex-wrap items-center gap-1">
      {pieces.map((p) => (
        <div key={p.id} className="h-5 w-5">
          <ChessPieceSvg type={p.type} color={p.color} />
        </div>
      ))}
      {advantage > 0 && (
        <span className="ml-1 tabular-nums text-xs font-extrabold text-black">
          +{advantage}
        </span>
      )}
      {pieces.length === 0 && advantage <= 0 && (
        <span className="text-[11px] font-medium text-black/50">
          No {colorLabel === 'w' ? 'Black' : 'White'} captures
        </span>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-black bg-white p-4 neo-shadow-lg sm:p-6">
        <div className="flex w-full max-w-[540px] items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 rounded-sm border-2 border-black"
              style={{ backgroundColor: manualFlipped ? '#FFFFFF' : '#171E19' }}
            />
            <span className="font-display text-sm font-extrabold text-black">
              {manualFlipped ? p1.name : p2.name}
            </span>
            <span className="text-xs font-bold text-black/60">
              {manualFlipped ? 'White' : 'Black'}
            </span>
          </div>
          {manualFlipped
            ? renderCapturedTray(currentState.capturedByWhite, material.whiteDiff, 'w')
            : renderCapturedTray(currentState.capturedByBlack, material.blackDiff, 'b')}
        </div>

        <div className="relative aspect-square w-full max-w-[540px] overflow-hidden rounded-xl border-2 border-black neo-shadow-sm select-none">
          <div className="grid h-full w-full grid-cols-8 grid-rows-8">
            {Array.from({ length: 64 }).map((_, idx) => {
              const displayR = Math.floor(idx / 8);
              const displayC = idx % 8;
              const r = manualFlipped ? 7 - displayR : displayR;
              const c = manualFlipped ? 7 - displayC : displayC;

              const isLight = (r + c) % 2 === 0;
              const isSelected = selected?.r === r && selected?.c === c;
              const isLastFrom = lastMove?.from.r === r && lastMove?.from.c === c;
              const isLastTo = lastMove?.to.r === r && lastMove?.to.c === c;
              const isLegalTarget = legalMoves.some((m) => m.to.r === r && m.to.c === c);
              const hasPieceOnTarget = Boolean(currentState.board[r][c]);
              const isKingCheck = kingInCheckSq?.r === r && kingInCheckSq?.c === c;

              let bgClass = isLight ? 'bg-[#F0D9B5]' : 'bg-[#B58863]';
              if (isLastFrom || isLastTo) bgClass = isLight ? 'bg-[#ffe17c]' : 'bg-[#d4a84f]';
              if (isSelected) bgClass = 'bg-[#b7c6c2]';
              if (isKingCheck) bgClass = 'bg-rose-400';

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  onClick={() => handleSquareClick(r, c)}
                  aria-label={`Square ${FILES[c]}${RANKS[r]}`}
                  className={`relative flex items-center justify-center transition-colors duration-100 cursor-pointer ${bgClass}`}
                >
                  {displayC === 0 && (
                    <span
                      className={`pointer-events-none absolute top-0.5 left-1 text-[10px] font-bold ${
                        isLight ? 'text-[#8B6242]' : 'text-[#F6E6CE]'
                      }`}
                    >
                      {RANKS[r]}
                    </span>
                  )}
                  {displayR === 7 && (
                    <span
                      className={`pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-bold ${
                        isLight ? 'text-[#8B6242]' : 'text-[#F6E6CE]'
                      }`}
                    >
                      {FILES[c]}
                    </span>
                  )}

                  {isLegalTarget && !hasPieceOnTarget && (
                    <span className="pointer-events-none h-3.5 w-3.5 rounded-full bg-black/30" />
                  )}
                  {isLegalTarget && hasPieceOnTarget && (
                    <span className="pointer-events-none absolute inset-1 rounded-full border-4 border-black/40" />
                  )}
                </button>
              );
            })}
          </div>

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
                    scale: isSelected ? 1.08 : 1,
                  }}
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute h-[12.5%] w-[12.5%] p-1.5"
                >
                  <ChessPieceSvg type={piece.type} color={piece.color} />
                </motion.div>
              );
            })}
          </div>

          {pendingPromo && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
              <div className="rounded-xl border-2 border-black bg-white p-4 text-center neo-shadow-lg">
                <p className="font-display text-sm font-extrabold text-black">Promote Pawn</p>
                <div className="mt-3 flex items-center gap-2">
                  {(['q', 'r', 'b', 'n'] as PieceType[]).map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => commitMove(pendingPromo.from, pendingPromo.to, pt)}
                      className="neo-btn h-14 w-14 bg-[#ffe17c] p-2 cursor-pointer"
                    >
                      <ChessPieceSvg type={pt} color={currentState.turn} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full max-w-[540px] items-center justify-between gap-3 rounded-xl border-2 border-black bg-[#f4f4f5] px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 rounded-sm border-2 border-black"
              style={{ backgroundColor: manualFlipped ? '#171E19' : '#FFFFFF' }}
            />
            <span className="font-display text-sm font-extrabold text-black">
              {manualFlipped ? p2.name : p1.name}
            </span>
            <span className="text-xs font-bold text-black/60">
              {manualFlipped ? 'Black' : 'White'}
            </span>
          </div>
          {manualFlipped
            ? renderCapturedTray(currentState.capturedByBlack, material.blackDiff, 'b')
            : renderCapturedTray(currentState.capturedByWhite, material.whiteDiff, 'w')}
        </div>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border-2 border-black bg-white p-5 neo-shadow-lg">
        <div className="border-b-2 border-black pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-black/60">Turn Status</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-display text-2xl font-extrabold text-black">
              {isMyTurn ? 'Your Turn!' : `${activePlayer.name}'s Turn`}
            </span>
            {currentState.status === 'check' && (
              <span className="rounded-md border-2 border-black bg-[#ffe17c] px-2 py-0.5 text-xs font-extrabold text-black">
                Check!
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium text-black/70">
            {online.mySide
              ? `Playing as ${online.mySide === 'p1' ? `${p1.name} (White)` : `${p2.name} (Black)`}`
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

          <button
            type="button"
            onClick={handleUndo}
            disabled={moves.length === 0}
            className="neo-btn inline-flex items-center justify-center gap-1.5 bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-45 cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
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

        <div className="flex flex-col border-t-2 border-black pt-4">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-black">Moves</h3>
          <div className="mt-2.5 h-60 overflow-y-auto rounded-xl border-2 border-black bg-[#f4f4f5] p-2.5">
            {movePairs.length === 0 ? (
              <p className="py-12 text-center text-xs font-medium text-black/50">
                {p1.name} (White) makes the opening move.
              </p>
            ) : (
              <div className="space-y-1 tabular-nums text-xs">
                {movePairs.map((pair) => (
                  <div
                    key={pair.num}
                    className="grid grid-cols-[36px_1fr_1fr] items-center rounded px-2 py-1 odd:bg-white"
                  >
                    <span className="font-bold text-black/50">{pair.num}.</span>
                    <span className="font-bold text-black">{pair.white}</span>
                    <span className="font-bold text-black/75">{pair.black ?? ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
