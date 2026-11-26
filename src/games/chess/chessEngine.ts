export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  id: string;
  type: PieceType;
  color: Color;
}

export interface SquareCoord {
  r: number; // 0 (rank 8) to 7 (rank 1)
  c: number; // 0 (file a) to 7 (file h)
}

export interface CastlingRights {
  wk: boolean;
  wq: boolean;
  bk: boolean;
  bq: boolean;
}

export interface ChessMove {
  from: SquareCoord;
  to: SquareCoord;
  piece: Piece;
  captured?: Piece;
  promotion?: PieceType;
  isCastle?: 'k' | 'q';
  isEnPassant?: boolean;
  san: string;
}

export interface ChessState {
  board: (Piece | null)[][];
  turn: Color;
  castling: CastlingRights;
  enPassant: SquareCoord | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  history: ChessMove[];
  capturedByWhite: Piece[];
  capturedByBlack: Piece[];
  status: 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw_insufficient' | 'draw_fifty';
  winner: Color | null;
}

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const coordToAlgebraic = (sq: SquareCoord) => `${FILES[sq.c]}${RANKS[sq.r]}`;

export const createInitialChessState = (): ChessState => {
  const backRank: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let c = 0; c < 8; c++) {
    board[0][c] = { id: `b-${backRank[c]}-${c}`, type: backRank[c], color: 'b' };
    board[1][c] = { id: `b-p-${c}`, type: 'p', color: 'b' };
    board[6][c] = { id: `w-p-${c}`, type: 'p', color: 'w' };
    board[7][c] = { id: `w-${backRank[c]}-${c}`, type: backRank[c], color: 'w' };
  }

  return {
    board,
    turn: 'w',
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    capturedByWhite: [],
    capturedByBlack: [],
    status: 'playing',
    winner: null,
  };
};

const cloneBoard = (board: (Piece | null)[][]): (Piece | null)[][] =>
  board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export const findKing = (board: (Piece | null)[][], color: Color): SquareCoord | null => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'k') return { r, c };
    }
  }
  return null;
};

export const isSquareAttacked = (
  board: (Piece | null)[][],
  sq: SquareCoord,
  byColor: Color
): boolean => {
  // Pawns
  const pawnDir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = sq.r + pawnDir;
    const pc = sq.c + dc;
    if (inBounds(pr, pc)) {
      const p = board[pr][pc];
      if (p && p.color === byColor && p.type === 'p') return true;
    }
  }

  // Knights
  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const nr = sq.r + dr;
    const nc = sq.c + dc;
    if (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (p && p.color === byColor && p.type === 'n') return true;
    }
  }

  // Kings
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const kr = sq.r + dr;
      const kc = sq.c + dc;
      if (inBounds(kr, kc)) {
        const p = board[kr][kc];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }
  }

  // Orthogonals (Rook / Queen)
  const orthoDirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of orthoDirs) {
    let r = sq.r + dr;
    let c = sq.c + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // Diagonals (Bishop / Queen)
  const diagDirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diagDirs) {
    let r = sq.r + dr;
    let c = sq.c + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
};

export const isInCheck = (board: (Piece | null)[][], color: Color): boolean => {
  const kingSq = findKing(board, color);
  if (!kingSq) return false;
  return isSquareAttacked(board, kingSq, color === 'w' ? 'b' : 'w');
};

interface CandidateMove {
  from: SquareCoord;
  to: SquareCoord;
  isCastle?: 'k' | 'q';
  isEnPassant?: boolean;
  isPromotion?: boolean;
}

const generatePseudoMoves = (state: ChessState, from: SquareCoord): CandidateMove[] => {
  const piece = state.board[from.r][from.c];
  if (!piece || piece.color !== state.turn) return [];
  const moves: CandidateMove[] = [];
  const enemy: Color = piece.color === 'w' ? 'b' : 'w';

  if (piece.type === 'p') {
    const dir = piece.color === 'w' ? -1 : 1;
    const startRank = piece.color === 'w' ? 6 : 1;
    const promoRank = piece.color === 'w' ? 0 : 7;

    // 1 step forward
    const r1 = from.r + dir;
    if (inBounds(r1, from.c) && !state.board[r1][from.c]) {
      moves.push({ from, to: { r: r1, c: from.c }, isPromotion: r1 === promoRank });
      // 2 steps forward
      const r2 = from.r + dir * 2;
      if (from.r === startRank && !state.board[r2][from.c]) {
        moves.push({ from, to: { r: r2, c: from.c } });
      }
    }

    // Diagonal captures & en passant
    for (const dc of [-1, 1]) {
      const nc = from.c + dc;
      if (!inBounds(r1, nc)) continue;
      const target = state.board[r1][nc];
      if (target && target.color === enemy) {
        moves.push({ from, to: { r: r1, c: nc }, isPromotion: r1 === promoRank });
      } else if (
        state.enPassant &&
        state.enPassant.r === r1 &&
        state.enPassant.c === nc
      ) {
        moves.push({ from, to: { r: r1, c: nc }, isEnPassant: true });
      }
    }
  } else if (piece.type === 'n') {
    const jumps = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of jumps) {
      const nr = from.r + dr;
      const nc = from.c + dc;
      if (!inBounds(nr, nc)) continue;
      const target = state.board[nr][nc];
      if (!target || target.color === enemy) {
        moves.push({ from, to: { r: nr, c: nc } });
      }
    }
  } else if (piece.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = from.r + dr;
        const nc = from.c + dc;
        if (!inBounds(nr, nc)) continue;
        const target = state.board[nr][nc];
        if (!target || target.color === enemy) {
          moves.push({ from, to: { r: nr, c: nc } });
        }
      }
    }

    // Castling
    const homeRow = piece.color === 'w' ? 7 : 0;
    if (from.r === homeRow && from.c === 4 && !isInCheck(state.board, piece.color)) {
      const canK = piece.color === 'w' ? state.castling.wk : state.castling.bk;
      const canQ = piece.color === 'w' ? state.castling.wq : state.castling.bq;

      if (
        canK &&
        !state.board[homeRow][5] &&
        !state.board[homeRow][6] &&
        state.board[homeRow][7]?.type === 'r' &&
        state.board[homeRow][7]?.color === piece.color &&
        !isSquareAttacked(state.board, { r: homeRow, c: 5 }, enemy) &&
        !isSquareAttacked(state.board, { r: homeRow, c: 6 }, enemy)
      ) {
        moves.push({ from, to: { r: homeRow, c: 6 }, isCastle: 'k' });
      }

      if (
        canQ &&
        !state.board[homeRow][3] &&
        !state.board[homeRow][2] &&
        !state.board[homeRow][1] &&
        state.board[homeRow][0]?.type === 'r' &&
        state.board[homeRow][0]?.color === piece.color &&
        !isSquareAttacked(state.board, { r: homeRow, c: 3 }, enemy) &&
        !isSquareAttacked(state.board, { r: homeRow, c: 2 }, enemy)
      ) {
        moves.push({ from, to: { r: homeRow, c: 2 }, isCastle: 'q' });
      }
    }
  } else {
    const dirs: [number, number][] = [];
    if (piece.type === 'b' || piece.type === 'q') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (piece.type === 'r' || piece.type === 'q') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, dc] of dirs) {
      let nr = from.r + dr;
      let nc = from.c + dc;
      while (inBounds(nr, nc)) {
        const target = state.board[nr][nc];
        if (!target) {
          moves.push({ from, to: { r: nr, c: nc } });
        } else {
          if (target.color === enemy) {
            moves.push({ from, to: { r: nr, c: nc } });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  return moves;
};

const applyMoveToBoard = (
  board: (Piece | null)[][],
  move: CandidateMove,
  promoType: PieceType = 'q'
): { nextBoard: (Piece | null)[][]; captured?: Piece } => {
  const nextBoard = cloneBoard(board);
  const moving = nextBoard[move.from.r][move.from.c]!;
  let captured = nextBoard[move.to.r][move.to.c] ?? undefined;

  nextBoard[move.from.r][move.from.c] = null;

  if (move.isEnPassant) {
    const capRow = move.from.r;
    captured = nextBoard[capRow][move.to.c] ?? undefined;
    nextBoard[capRow][move.to.c] = null;
  }

  if (move.isPromotion) {
    nextBoard[move.to.r][move.to.c] = {
      ...moving,
      type: promoType,
    };
  } else {
    nextBoard[move.to.r][move.to.c] = moving;
  }

  if (move.isCastle === 'k') {
    const rook = nextBoard[move.from.r][7];
    nextBoard[move.from.r][7] = null;
    nextBoard[move.from.r][5] = rook;
  } else if (move.isCastle === 'q') {
    const rook = nextBoard[move.from.r][0];
    nextBoard[move.from.r][0] = null;
    nextBoard[move.from.r][3] = rook;
  }

  return { nextBoard, captured };
};

export const getLegalMovesForSquare = (
  state: ChessState,
  from: SquareCoord
): CandidateMove[] => {
  if (
    state.status === 'checkmate' ||
    state.status === 'stalemate' ||
    state.status === 'draw_insufficient' ||
    state.status === 'draw_fifty'
  ) {
    return [];
  }
  const piece = state.board[from.r][from.c];
  if (!piece || piece.color !== state.turn) return [];
  const pseudo = generatePseudoMoves(state, from);
  return pseudo.filter((m) => {
    const { nextBoard } = applyMoveToBoard(state.board, m);
    return !isInCheck(nextBoard, piece.color);
  });
};

const getAllLegalMoves = (state: ChessState): CandidateMove[] => {
  const all: CandidateMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.color === state.turn) {
        all.push(...getLegalMovesForSquare(state, { r, c }));
      }
    }
  }
  return all;
};

const hasInsufficientMaterial = (board: (Piece | null)[][]): boolean => {
  const pieces: { type: PieceType; color: Color; r: number; c: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type !== 'k') pieces.push({ type: p.type, color: p.color, r, c });
    }
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;
  if (
    pieces.length === 2 &&
    pieces[0].type === 'b' &&
    pieces[1].type === 'b' &&
    pieces[0].color !== pieces[1].color &&
    (pieces[0].r + pieces[0].c) % 2 === (pieces[1].r + pieces[1].c) % 2
  ) {
    return true;
  }
  return false;
};

export const executeChessMove = (
  state: ChessState,
  from: SquareCoord,
  to: SquareCoord,
  promotionChoice: PieceType = 'q'
): ChessState | null => {
  const legal = getLegalMovesForSquare(state, from);
  const move = legal.find((m) => m.to.r === to.r && m.to.c === to.c);
  if (!move) return null;

  const movingPiece = state.board[from.r][from.c]!;
  const promoType = move.isPromotion ? promotionChoice : undefined;
  const { nextBoard, captured } = applyMoveToBoard(state.board, move, promoType ?? 'q');

  // Update castling rights
  const nextCastling = { ...state.castling };
  if (movingPiece.type === 'k') {
    if (movingPiece.color === 'w') {
      nextCastling.wk = false;
      nextCastling.wq = false;
    } else {
      nextCastling.bk = false;
      nextCastling.bq = false;
    }
  }
  if (movingPiece.type === 'r') {
    if (from.r === 7 && from.c === 0) nextCastling.wq = false;
    if (from.r === 7 && from.c === 7) nextCastling.wk = false;
    if (from.r === 0 && from.c === 0) nextCastling.bq = false;
    if (from.r === 0 && from.c === 7) nextCastling.bk = false;
  }
  if (captured && captured.type === 'r') {
    if (to.r === 7 && to.c === 0) nextCastling.wq = false;
    if (to.r === 7 && to.c === 7) nextCastling.wk = false;
    if (to.r === 0 && to.c === 0) nextCastling.bq = false;
    if (to.r === 0 && to.c === 7) nextCastling.bk = false;
  }

  // En passant target square
  let nextEnPassant: SquareCoord | null = null;
  if (movingPiece.type === 'p' && Math.abs(to.r - from.r) === 2) {
    nextEnPassant = { r: (from.r + to.r) / 2, c: from.c };
  }

  const nextTurn: Color = state.turn === 'w' ? 'b' : 'w';
  const nextHalfmove = movingPiece.type === 'p' || captured ? 0 : state.halfmoveClock + 1;
  const nextFullmove = state.turn === 'b' ? state.fullmoveNumber + 1 : state.fullmoveNumber;

  const capturedByWhite = [...state.capturedByWhite];
  const capturedByBlack = [...state.capturedByBlack];
  if (captured) {
    if (state.turn === 'w') capturedByWhite.push(captured);
    else capturedByBlack.push(captured);
  }

  // Build next provisional state to check game-over/check
  const nextState: ChessState = {
    board: nextBoard,
    turn: nextTurn,
    castling: nextCastling,
    enPassant: nextEnPassant,
    halfmoveClock: nextHalfmove,
    fullmoveNumber: nextFullmove,
    history: state.history,
    capturedByWhite,
    capturedByBlack,
    status: 'playing',
    winner: null,
  };

  const oppInCheck = isInCheck(nextBoard, nextTurn);
  const oppLegalMoves = getAllLegalMoves(nextState);

  if (oppLegalMoves.length === 0) {
    if (oppInCheck) {
      nextState.status = 'checkmate';
      nextState.winner = state.turn;
    } else {
      nextState.status = 'stalemate';
    }
  } else if (hasInsufficientMaterial(nextBoard)) {
    nextState.status = 'draw_insufficient';
  } else if (nextHalfmove >= 100) {
    nextState.status = 'draw_fifty';
  } else if (oppInCheck) {
    nextState.status = 'check';
  }

  // Format SAN
  let san = '';
  if (move.isCastle === 'k') {
    san = 'O-O';
  } else if (move.isCastle === 'q') {
    san = 'O-O-O';
  } else {
    const pieceChar = movingPiece.type === 'p' ? '' : movingPiece.type.toUpperCase();
    // Disambiguation for non-pawn pieces
    let disambig = '';
    if (movingPiece.type !== 'p') {
      const sameTypeOthers: SquareCoord[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === from.r && c === from.c) continue;
          const p = state.board[r][c];
          if (p && p.color === state.turn && p.type === movingPiece.type) {
            const otherLegal = getLegalMovesForSquare(state, { r, c });
            if (otherLegal.some((m) => m.to.r === to.r && m.to.c === to.c)) {
              sameTypeOthers.push({ r, c });
            }
          }
        }
      }
      if (sameTypeOthers.length > 0) {
        const sameFile = sameTypeOthers.some((sq) => sq.c === from.c);
        const sameRank = sameTypeOthers.some((sq) => sq.r === from.r);
        if (!sameFile) disambig = FILES[from.c];
        else if (!sameRank) disambig = RANKS[from.r];
        else disambig = coordToAlgebraic(from);
      }
    }

    const captureChar = captured ? 'x' : '';
    const pawnFile = movingPiece.type === 'p' && captured ? FILES[from.c] : '';
    const promoSuffix = promoType ? `=${promoType.toUpperCase()}` : '';
    san = `${pieceChar}${disambig}${pawnFile}${captureChar}${coordToAlgebraic(to)}${promoSuffix}`;
  }

  if (nextState.status === 'checkmate') san += '#';
  else if (nextState.status === 'check') san += '+';

  const recordedMove: ChessMove = {
    from,
    to,
    piece: movingPiece,
    captured,
    promotion: promoType,
    isCastle: move.isCastle,
    isEnPassant: move.isEnPassant,
    san,
  };

  nextState.history = [...state.history, recordedMove];
  return nextState;
};

export const getMaterialAdvantage = (state: ChessState) => {
  let wScore = 0;
  let bScore = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (p.color === 'w') wScore += PIECE_VALUES[p.type];
      else bScore += PIECE_VALUES[p.type];
    }
  }
  return { whiteDiff: wScore - bScore, blackDiff: bScore - wScore };
};
