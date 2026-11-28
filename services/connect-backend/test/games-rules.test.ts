import { describe, expect, it } from "vitest";
import { boxLines, connectFour, dotsAndBoxes, gomoku, reversi, reversiMoves, ticTacToe } from "../src/games/boards.js";
import { checkers, checkersMoves, chess } from "../src/games/chess.js";
import { JUMPS, LUDO_HOME, ludo, rps, snakes } from "../src/games/dice.js";
import { ENGINES } from "../src/games/engines.js";
import type { BaseState, Engine } from "../src/games/types.js";

const fixed = (...rolls: number[]) => () => ((rolls.length ? rolls.shift()! : 4) - 1) / 6 + 0.01;
const r4 = fixed();
function play<S extends BaseState>(e: Engine<S>, s: S, moves: [number, unknown][]) {
  for (const [seat, m] of moves) s = e.move(s, seat, m, r4);
  return s;
}

describe("game rules", () => {
  it("offers ten different games", () => {
    expect(new Set(ENGINES.map((e) => e.kind)).size).toBe(10);
    expect(ENGINES.map((e) => e.kind)).toEqual(expect.arrayContaining(["chess", "ludo", "tictactoe"]));
  });

  it("tic-tac-toe: a row wins, taken cells are refused, a full board is a draw", () => {
    const s = play(ticTacToe, ticTacToe.init(2, r4), [[0, { cell: 0 }], [1, { cell: 3 }], [0, { cell: 1 }], [1, { cell: 4 }], [0, { cell: 2 }]]);
    expect(s.outcome).toEqual({ winners: [0] });
    expect(() => ticTacToe.move(ticTacToe.init(2, r4), 0, { cell: 9 }, r4)).toThrow();
    const one = ticTacToe.move(ticTacToe.init(2, r4), 0, { cell: 4 }, r4);
    expect(() => ticTacToe.move(one, 1, { cell: 4 }, r4)).toThrow("cell_taken");
    const draw = play(ticTacToe, ticTacToe.init(2, r4), [0, 1, 2, 4, 3, 5, 7, 6, 8].map((cell, i) => [i % 2, { cell }] as [number, unknown]));
    expect(draw.outcome).toEqual({ winners: [] });
  });

  it("four in a row: pieces fall, full columns are refused, a diagonal wins", () => {
    let s = connectFour.move(connectFour.init(2, r4), 0, { column: 3 }, r4);
    expect(s.board[5 * 7 + 3]).toBe(0);
    for (let i = 0; i < 5; i++) s = connectFour.move(s, (i + 1) % 2, { column: 3 }, r4);
    expect(() => connectFour.move(s, 0, { column: 3 }, r4)).toThrow("column_full");
    const diag = play(connectFour, connectFour.init(2, r4), [
      [0, { column: 0 }], [1, { column: 1 }], [0, { column: 1 }], [1, { column: 2 }], [0, { column: 2 }], [1, { column: 3 }],
      [0, { column: 2 }], [1, { column: 3 }], [0, { column: 3 }], [1, { column: 6 }], [0, { column: 3 }],
    ]);
    expect(diag.outcome).toEqual({ winners: [0] });
  });

  it("five in a row needs five", () => {
    const moves: [number, unknown][] = [];
    for (let i = 0; i < 4; i++) moves.push([0, { cell: i }], [1, { cell: 15 + i }]);
    let s = play(gomoku, gomoku.init(2, r4), moves);
    expect(s.outcome).toBeNull();
    s = gomoku.move(s, 0, { cell: 4 }, r4);
    expect(s.outcome).toEqual({ winners: [0] });
  });

  it("reversi: only flipping moves are legal and they flip", () => {
    const s0 = reversi.init(2, r4);
    expect(reversiMoves(s0.board, 0).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
    expect(() => reversi.move(s0, 0, { cell: 0 }, r4)).toThrow("illegal_move");
    const s = reversi.move(s0, 0, { cell: 19 }, r4);
    expect(s.board[27]).toBe(0);
    expect(s.turn).toBe(1);
  });

  it("dots and boxes: closing a box scores and earns another turn", () => {
    let s = dotsAndBoxes.init(3, r4);
    const [top, bottom, left, right] = boxLines(0, 0);
    s = play(dotsAndBoxes, s, [[0, { line: top }], [1, { line: bottom }], [2, { line: left }]]);
    s = dotsAndBoxes.move(s, 0, { line: right }, r4);
    expect(s.scores[0]).toBe(1);
    expect(s.turn).toBe(0);
    expect(() => dotsAndBoxes.move(s, 0, { line: top }, r4)).toThrow("line_taken");
  });

  it("chess: legal moves only, promotion, and fool's mate", () => {
    const s0 = chess.init(2, r4);
    expect(() => chess.move(s0, 0, { from: "e2", to: "e5" }, r4)).toThrow("illegal_move");
    const mate = play(chess, s0, [[0, { from: "f2", to: "f3" }], [1, { from: "e7", to: "e5" }], [0, { from: "g2", to: "g4" }], [1, { from: "d8", to: "h4" }]]);
    expect(mate.outcome).toEqual({ winners: [1] });
    expect(mate.reason).toBe("checkmate");
    expect(mate.san.at(-1)).toBe("Qh4#");
    const v = chess.view!(s0, 0) as { legal: Record<string, string[]> };
    expect(v.legal.e2).toEqual(expect.arrayContaining(["e3", "e4"]));
  });

  it("checkers: captures are compulsory, multi-jumps continue, the last piece taken loses", () => {
    const s = checkers.init(2, r4);
    const board: typeof s.board = Array(64).fill(null);
    board[5 * 8 + 2] = { seat: 0, king: false }; // c3
    board[4 * 8 + 3] = { seat: 1, king: false }; // d4, can be jumped
    board[2 * 8 + 5] = { seat: 1, king: false }; // f6, second jump
    board[7 * 8 + 0] = { seat: 0, king: false };
    const st = { ...s, board };
    expect(checkersMoves(st, 0)).toEqual([{ from: 42, to: 28, capture: 35 }]);
    expect(() => checkers.move(st, 0, { from: 56, to: 49 }, r4)).toThrow("illegal_move");
    const mid = checkers.move(st, 0, { from: 42, to: 28 }, r4);
    expect(mid.chain).toBe(28);
    expect(mid.turn).toBe(0);
    const end = checkers.move(mid, 0, { from: 28, to: 14 }, r4);
    expect(end.outcome).toEqual({ winners: [0] });
  });

  it("ludo: a 6 brings a token out, rolls again, captures send tokens home", () => {
    let s = ludo.init(2, r4);
    expect(s.colors).toEqual([0, 2]);
    s = ludo.move(s, 0, { action: "roll" }, fixed(3));
    expect(s.turn).toBe(1); // no token can move without a 6
    s = ludo.move(s, 1, { action: "roll" }, fixed(6));
    expect(s.phase).toBe("move");
    expect(() => ludo.move(s, 1, { action: "roll" }, r4)).toThrow("move_a_token");
    s = ludo.move(s, 1, { action: "move", token: 0 }, r4);
    expect(s.tokens[1]![0]).toBe(0);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe("roll");
    // Seat 0's token on its square 30 = shared square 30; seat 1 (colour 2, start 26) lands there from progress 0 with a 4.
    s = { ...s, tokens: [[30, -1, -1, -1], s.tokens[1]!] };
    s = ludo.move(s, 1, { action: "roll" }, fixed(4));
    s = ludo.move(s, 1, { action: "move", token: 0 }, r4);
    expect(s.tokens[0]![0]).toBe(-1);
    expect(s.last?.captured).toBe(1);
    expect(s.turn).toBe(1); // a capture earns another roll
    // Exact roll home; all four home wins.
    s = { ...s, tokens: [s.tokens[0]!, [LUDO_HOME - 2, LUDO_HOME, LUDO_HOME, LUDO_HOME]] };
    s = ludo.move(s, 1, { action: "roll" }, fixed(2));
    s = ludo.move(s, 1, { action: "move", token: 0 }, r4);
    expect(s.outcome).toEqual({ winners: [1] });
  });

  it("ludo: three sixes in a row lose the turn", () => {
    let s = { ...ludo.init(2, r4), tokens: [[5, -1, -1, -1], [-1, -1, -1, -1]] };
    for (let i = 0; i < 2; i++) {
      s = ludo.move(s, 0, { action: "roll" }, fixed(6));
      s = ludo.move(s, 0, { action: "move", token: 0 }, r4);
    }
    s = ludo.move(s, 0, { action: "roll" }, fixed(6));
    expect(s.turn).toBe(1);
  });

  it("snakes and ladders: ladders, snakes and an exact roll to 100", () => {
    let s = snakes.init(2, r4);
    s = snakes.move(s, 0, { action: "roll" }, fixed(3));
    expect(s.pos[0]).toBe(JUMPS[3]);
    s = { ...s, pos: [97, 0], turn: 0 };
    s = snakes.move(s, 0, { action: "roll" }, fixed(5));
    expect(s.pos[0]).toBe(97);
    s = { ...s, turn: 0 };
    s = snakes.move(s, 0, { action: "roll" }, fixed(3));
    expect(s.outcome).toEqual({ winners: [0] });
  });

  it("rock, paper, scissors: picks stay secret until both chose; first to three wins", () => {
    let s = rps.init(2, r4);
    s = rps.move(s, 0, { pick: "rock" }, r4);
    expect((rps.view!(s, 1) as { picks: unknown[] }).picks).toEqual([null, null]);
    expect((rps.view!(s, null) as { picked: boolean[] }).picked).toEqual([true, false]);
    expect(() => rps.move(s, 0, { pick: "paper" }, r4)).toThrow("already_picked");
    s = rps.move(s, 1, { pick: "scissors" }, r4);
    expect(s.scores).toEqual([1, 0]);
    for (let i = 0; i < 2; i++) s = rps.move(rps.move(s, 0, { pick: "paper" }, r4), 1, { pick: "rock" }, r4);
    expect(s.outcome).toEqual({ winners: [0] });
  });
});
