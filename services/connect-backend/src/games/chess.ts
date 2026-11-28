import { Chess, type Square } from "chess.js";
import { z } from "zod";
import { base, clone, GameError, type BaseState, type Engine } from "./types.js";

/* ---------------------------------------------- Chess ---------------------------------------------- */

type ChessMove = { from: string; to: string; promotion?: string };
type ChessState = BaseState & { fen: string; moves: ChessMove[]; san: string[]; last: ChessMove | null; check: boolean; reason: string | null };

const square = z.string().regex(/^[a-h][1-8]$/);
const chessInput = z.object({ from: square, to: square, promotion: z.enum(["q", "r", "b", "n"]).optional() });

/** Replays the game so repetition and the fifty-move rule are judged on the real history. */
function replay(moves: ChessMove[]) {
  const c = new Chess();
  for (const m of moves) c.move(m);
  return c;
}

export const chess: Engine<ChessState> = {
  kind: "chess",
  name: "Chess",
  minPlayers: 2,
  maxPlayers: 2,
  init: () => ({ ...base(2), fen: new Chess().fen(), moves: [], san: [], last: null, check: false, reason: null }),
  move(s, seat, input) {
    const m = chessInput.parse(input);
    const c = replay(s.moves);
    if ((c.turn() === "w" ? 0 : 1) !== seat) throw new GameError("not_your_turn");
    const legal = c.moves({ square: m.from as Square, verbose: true }).filter((x) => x.to === m.to);
    if (!legal.length) throw new GameError("illegal_move");
    const promotion = legal.some((x) => x.promotion) ? (m.promotion ?? "q") : undefined;
    const done = c.move({ from: m.from, to: m.to, promotion });
    const n = clone(s);
    const played = promotion ? { from: m.from, to: m.to, promotion } : { from: m.from, to: m.to };
    n.moves.push(played);
    n.san.push(done.san);
    n.last = played;
    n.fen = c.fen();
    n.check = c.inCheck();
    if (c.isCheckmate()) [n.outcome, n.reason] = [{ winners: [seat] }, "checkmate"];
    else if (c.isGameOver()) {
      n.outcome = { winners: [] };
      n.reason = c.isStalemate() ? "stalemate" : c.isThreefoldRepetition() ? "repetition" : c.isInsufficientMaterial() ? "insufficient material" : "fifty-move rule";
    } else n.turn = 1 - seat;
    return n;
  },
  view(s) {
    const legal: Record<string, string[]> = {};
    if (!s.outcome) for (const m of new Chess(s.fen).moves({ verbose: true })) (legal[m.from] ??= []).push(m.to);
    return { ...s, moves: undefined, legal };
  },
};

/* -------------------------------------------- Checkers -------------------------------------------- */

/** board[r*8+c]: null, or a piece. Seat 0 starts on rows 5-7 and moves up; seat 1 on rows 0-2 and moves down. */
type Piece = { seat: number; king: boolean };
type CheckersState = BaseState & { board: (Piece | null)[]; chain: number | null; quiet: number; last: { from: number; to: number } | null };
type Step = { from: number; to: number; capture: number | null };

function steps(s: Pick<CheckersState, "board">, at: number): Step[] {
  const p = s.board[at];
  if (!p) return [];
  const r = Math.floor(at / 8);
  const c = at % 8;
  const dirs = p.king ? [-1, 1] : [p.seat === 0 ? -1 : 1];
  const out: Step[] = [];
  for (const dr of dirs)
    for (const dc of [-1, 1]) {
      const r1 = r + dr;
      const c1 = c + dc;
      if (r1 < 0 || r1 > 7 || c1 < 0 || c1 > 7) continue;
      const mid = s.board[r1 * 8 + c1];
      if (!mid) out.push({ from: at, to: r1 * 8 + c1, capture: null });
      else if (mid.seat !== p.seat) {
        const r2 = r1 + dr;
        const c2 = c1 + dc;
        if (r2 >= 0 && r2 <= 7 && c2 >= 0 && c2 <= 7 && !s.board[r2 * 8 + c2]) out.push({ from: at, to: r2 * 8 + c2, capture: r1 * 8 + c1 });
      }
    }
  return out;
}

/** Legal moves for the seat to move; captures are compulsory, and a capturing piece must keep jumping. */
export function checkersMoves(s: CheckersState, seat: number): Step[] {
  if (s.chain !== null) return steps(s, s.chain).filter((x) => x.capture !== null);
  const all = s.board.flatMap((p, i) => (p?.seat === seat ? steps(s, i) : []));
  const jumps = all.filter((x) => x.capture !== null);
  return jumps.length ? jumps : all;
}

export const checkers: Engine<CheckersState> = {
  kind: "checkers",
  name: "Checkers",
  minPlayers: 2,
  maxPlayers: 2,
  init: () => {
    const board: (Piece | null)[] = Array(64).fill(null);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1 && (r < 3 || r > 4)) board[r * 8 + c] = { seat: r < 3 ? 1 : 0, king: false };
    return { ...base(2), board, chain: null, quiet: 0, last: null };
  },
  move(s, seat, input) {
    const m = z.object({ from: z.number().int().min(0).max(63), to: z.number().int().min(0).max(63) }).parse(input);
    const step = checkersMoves(s, seat).find((x) => x.from === m.from && x.to === m.to);
    if (!step) throw new GameError("illegal_move");
    const n = clone(s);
    const piece = n.board[step.from]!;
    n.board[step.from] = null;
    n.board[step.to] = piece;
    n.last = { from: step.from, to: step.to };
    if (step.capture !== null) n.board[step.capture] = null;
    n.quiet = step.capture !== null ? 0 : n.quiet + 1;
    const row = Math.floor(step.to / 8);
    const crowned = !piece.king && (row === 0 || row === 7);
    if (crowned) piece.king = true;
    n.chain = null;
    // Crowning ends the move; otherwise a capture continues while the same piece can capture again.
    if (step.capture !== null && !crowned && steps(n, step.to).some((x) => x.capture !== null)) {
      n.chain = step.to;
      return n;
    }
    const other = 1 - seat;
    if (!checkersMoves(n, other).length) n.outcome = { winners: [seat] };
    else if (n.quiet >= 80) n.outcome = { winners: [] }; // 40 moves each without a capture
    else n.turn = other;
    return n;
  },
  view: (s) => ({ ...s, legal: s.turn === null || s.outcome ? [] : checkersMoves(s, s.turn).map(({ from, to }) => ({ from, to })) }),
};
