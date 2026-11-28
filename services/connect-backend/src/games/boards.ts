import { z } from "zod";
import { base, clone, GameError, nextSeat, topScorers, type BaseState, type Engine } from "./types.js";

type Cells = (number | null)[];
const cellInput = (size: number) => z.object({ cell: z.number().int().min(0).max(size - 1) });

/** Length of the run through `at` in direction (dr, dc), counting both ways. */
function run(board: Cells, cols: number, rows: number, at: number, dr: number, dc: number) {
  const who = board[at];
  const r0 = Math.floor(at / cols);
  const c0 = at % cols;
  let n = 1;
  for (const sign of [1, -1]) {
    let r = r0 + dr * sign;
    let c = c0 + dc * sign;
    while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === who) {
      n++;
      r += dr * sign;
      c += dc * sign;
    }
  }
  return n;
}
const longestThrough = (board: Cells, cols: number, rows: number, at: number) =>
  Math.max(...[[0, 1], [1, 0], [1, 1], [1, -1]].map(([dr, dc]) => run(board, cols, rows, at, dr!, dc!)));

/* ------------------------------- Tic-tac-toe, Five in a row ------------------------------- */

type LineState = BaseState & { board: Cells; last: number | null };

function lineGame(kind: string, name: string, size: number, need: number): Engine<LineState> {
  return {
    kind,
    name,
    minPlayers: 2,
    maxPlayers: 2,
    init: () => ({ ...base(2), board: Array(size * size).fill(null), last: null }),
    move(s, seat, input) {
      const { cell } = cellInput(size * size).parse(input);
      if (s.board[cell] !== null) throw new GameError("cell_taken");
      const n = clone(s);
      n.board[cell] = seat;
      n.last = cell;
      if (longestThrough(n.board, size, size, cell) >= need) n.outcome = { winners: [seat] };
      else if (n.board.every((c) => c !== null)) n.outcome = { winners: [] };
      else n.turn = 1 - seat;
      return n;
    },
  };
}

export const ticTacToe = lineGame("tictactoe", "Tic-tac-toe", 3, 3);
export const gomoku = lineGame("gomoku", "Five in a row", 15, 5);

/* ----------------------------------------- Connect four ----------------------------------------- */

const C4_COLS = 7;
const C4_ROWS = 6;

export const connectFour: Engine<LineState> = {
  kind: "connect4",
  name: "Four in a row",
  minPlayers: 2,
  maxPlayers: 2,
  init: () => ({ ...base(2), board: Array(C4_COLS * C4_ROWS).fill(null), last: null }),
  move(s, seat, input) {
    const { column } = z.object({ column: z.number().int().min(0).max(C4_COLS - 1) }).parse(input);
    let row = C4_ROWS - 1;
    while (row >= 0 && s.board[row * C4_COLS + column] !== null) row--;
    if (row < 0) throw new GameError("column_full");
    const n = clone(s);
    const at = row * C4_COLS + column;
    n.board[at] = seat;
    n.last = at;
    if (longestThrough(n.board, C4_COLS, C4_ROWS, at) >= 4) n.outcome = { winners: [seat] };
    else if (n.board.every((c) => c !== null)) n.outcome = { winners: [] };
    else n.turn = 1 - seat;
    return n;
  },
};

/* -------------------------------------------- Reversi -------------------------------------------- */

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

function flips(board: Cells, at: number, seat: number): number[] {
  if (board[at] !== null) return [];
  const r0 = Math.floor(at / 8);
  const c0 = at % 8;
  const all: number[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let r = r0 + dr;
    let c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 1 - seat) {
      line.push(r * 8 + c);
      r += dr;
      c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === seat) all.push(...line);
  }
  return all;
}
export const reversiMoves = (board: Cells, seat: number) => board.map((_, i) => i).filter((i) => flips(board, i, seat).length > 0);

type ReversiState = LineState & { passed: boolean };

export const reversi: Engine<ReversiState> = {
  kind: "reversi",
  name: "Reversi",
  minPlayers: 2,
  maxPlayers: 2,
  init: () => {
    const board: Cells = Array(64).fill(null);
    board[27] = 1;
    board[36] = 1;
    board[28] = 0;
    board[35] = 0;
    return { ...base(2), board, last: null, passed: false };
  },
  move(s, seat, input) {
    const { cell } = cellInput(64).parse(input);
    const f = flips(s.board, cell, seat);
    if (!f.length) throw new GameError("illegal_move");
    const n = clone(s);
    n.board[cell] = seat;
    for (const i of f) n.board[i] = seat;
    n.last = cell;
    n.passed = false;
    const other = 1 - seat;
    if (reversiMoves(n.board, other).length) n.turn = other;
    else if (reversiMoves(n.board, seat).length) n.passed = true; // the opponent cannot move: same player again
    else {
      const count = [0, 1].map((p) => n.board.filter((c) => c === p).length);
      n.outcome = { winners: topScorers(count, n.out) };
    }
    return n;
  },
  view: (s) => ({ ...s, legal: s.turn === null || s.outcome ? [] : reversiMoves(s.board, s.turn) }),
};

/* ----------------------------------------- Dots and boxes ----------------------------------------- */

export const DOTS = 5; // boxes per side
const H_LINES = (DOTS + 1) * DOTS;
const LINES = H_LINES * 2;

/** The four line indices around box (r, c): top, bottom, left, right. */
export function boxLines(r: number, c: number) {
  return [r * DOTS + c, (r + 1) * DOTS + c, H_LINES + r * (DOTS + 1) + c, H_LINES + r * (DOTS + 1) + c + 1];
}

type DotsState = BaseState & { lines: Cells; boxes: Cells; scores: number[]; last: number | null };

export const dotsAndBoxes: Engine<DotsState> = {
  kind: "dots",
  name: "Dots and boxes",
  minPlayers: 2,
  maxPlayers: 4,
  init: (players) => ({ ...base(players), lines: Array(LINES).fill(null), boxes: Array(DOTS * DOTS).fill(null), scores: Array(players).fill(0), last: null }),
  move(s, seat, input) {
    const { line } = z.object({ line: z.number().int().min(0).max(LINES - 1) }).parse(input);
    if (s.lines[line] !== null) throw new GameError("line_taken");
    const n = clone(s);
    n.lines[line] = seat;
    n.last = line;
    let closed = 0;
    for (let r = 0; r < DOTS; r++)
      for (let c = 0; c < DOTS; c++) {
        const b = r * DOTS + c;
        if (n.boxes[b] === null && boxLines(r, c).every((l) => n.lines[l] !== null)) {
          n.boxes[b] = seat;
          n.scores[seat]!++;
          closed++;
        }
      }
    if (n.lines.every((l) => l !== null)) n.outcome = { winners: topScorers(n.scores, n.out) };
    else if (!closed) n.turn = nextSeat(n, seat); // closing a box earns another line
    return n;
  },
};
