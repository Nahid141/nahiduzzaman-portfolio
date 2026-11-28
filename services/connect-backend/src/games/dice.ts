import { z } from "zod";
import { base, clone, dice, GameError, nextSeat, type BaseState, type Engine } from "./types.js";

/* ---------------------------------------------- Ludo ----------------------------------------------
 * Progress per token: -1 in the yard, 0..50 on the shared track (square (start + p) % 52), 51..55 in the
 * colour's home column, 56 home. A 6 brings a token out and earns another roll, as do a capture and reaching
 * home; three 6s in a row forfeit the turn. Tokens on the starting and star squares cannot be captured.
 */
export const LUDO_HOME = 56;
export const LUDO_SAFE = [0, 8, 13, 21, 26, 34, 39, 47];

type LudoState = BaseState & {
  colors: number[];
  tokens: number[][];
  phase: "roll" | "move";
  dice: number | null;
  sixes: number;
  last: { seat: number; dice: number; token: number | null; captured: number } | null;
};

const square = (color: number, p: number) => (color * 13 + p) % 52;

export function ludoMoves(s: LudoState, seat: number): number[] {
  if (s.phase !== "move" || s.dice === null) return [];
  return s.tokens[seat]!.map((p, i) => ({ p, i }))
    .filter(({ p }) => (p === -1 ? s.dice === 6 : p < LUDO_HOME && p + s.dice! <= LUDO_HOME))
    .map(({ i }) => i);
}

function passTurn(n: LudoState, seat: number) {
  n.turn = nextSeat(n, seat);
  n.phase = "roll";
  n.dice = null;
  n.sixes = 0;
}

export const ludo: Engine<LudoState> = {
  kind: "ludo",
  name: "Ludo",
  minPlayers: 2,
  maxPlayers: 4,
  init: (players) => ({
    ...base(players),
    // Two players sit opposite each other.
    colors: players === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, players),
    tokens: Array.from({ length: players }, () => [-1, -1, -1, -1]),
    phase: "roll",
    dice: null,
    sixes: 0,
    last: null,
  }),
  move(s, seat, input, rng) {
    const m = z.discriminatedUnion("action", [z.object({ action: z.literal("roll") }), z.object({ action: z.literal("move"), token: z.number().int().min(0).max(3) })]).parse(input);
    const n = clone(s);
    if (m.action === "roll") {
      if (s.phase !== "roll") throw new GameError("move_a_token");
      const d = dice(rng);
      n.dice = d;
      n.sixes = d === 6 ? s.sixes + 1 : 0;
      n.last = { seat, dice: d, token: null, captured: 0 };
      if (n.sixes === 3) passTurn(n, seat);
      else {
        n.phase = "move";
        if (!ludoMoves(n, seat).length) {
          if (d === 6) [n.phase, n.dice] = ["roll", null];
          else passTurn(n, seat);
        }
      }
      return n;
    }
    if (s.phase !== "move") throw new GameError("roll_first");
    if (!ludoMoves(s, seat).includes(m.token)) throw new GameError("illegal_move");
    const d = s.dice!;
    const from = n.tokens[seat]![m.token]!;
    const to = from === -1 ? 0 : from + d;
    n.tokens[seat]![m.token] = to;
    let captured = 0;
    if (to <= 50) {
      const sq = square(n.colors[seat]!, to);
      if (!LUDO_SAFE.includes(sq))
        n.tokens.forEach((list, other) => {
          if (other === seat) return;
          list.forEach((p, i) => {
            if (p >= 0 && p <= 50 && square(n.colors[other]!, p) === sq) {
              list[i] = -1;
              captured++;
            }
          });
        });
    }
    n.last = { seat, dice: d, token: m.token, captured };
    if (n.tokens[seat]!.every((p) => p === LUDO_HOME)) {
      n.outcome = { winners: [seat] };
      return n;
    }
    if (d === 6 || captured > 0 || to === LUDO_HOME) [n.phase, n.dice] = ["roll", null];
    else passTurn(n, seat);
    return n;
  },
  view: (s) => ({ ...s, legal: s.turn === null || s.outcome ? [] : ludoMoves(s, s.turn) }),
  afterResign(s, seat) {
    const n = clone(s);
    n.tokens[seat] = [-1, -1, -1, -1];
    if (n.turn === seat) passTurn(n, seat);
    return n;
  },
};

/* ---------------------------------------- Snakes and ladders ---------------------------------------- */

/** Our own board: ladders climb, snakes slide down. */
export const JUMPS: Record<number, number> = {
  3: 22, 8: 30, 20: 41, 27: 56, 50: 69, 57: 76, 63: 81, 72: 91,
  17: 4, 33: 12, 46: 25, 54: 34, 66: 47, 79: 58, 88: 67, 94: 71, 99: 80,
};

type SnakesState = BaseState & { pos: number[]; last: { seat: number; dice: number; from: number; to: number; jump: number | null } | null };

export const snakes: Engine<SnakesState> = {
  kind: "snakes",
  name: "Snakes and ladders",
  minPlayers: 2,
  maxPlayers: 4,
  init: (players) => ({ ...base(players), pos: Array(players).fill(0), last: null }),
  move(s, seat, input, rng) {
    z.object({ action: z.literal("roll") }).parse(input);
    const n = clone(s);
    const d = dice(rng);
    const from = n.pos[seat]!;
    let to = from + d > 100 ? from : from + d; // the last square needs an exact roll
    const landed = to;
    to = JUMPS[to] ?? to;
    n.pos[seat] = to;
    n.last = { seat, dice: d, from, to, jump: to !== landed ? landed : null };
    if (to === 100) n.outcome = { winners: [seat] };
    else n.turn = nextSeat(n, seat);
    return n;
  },
};

/* --------------------------------------- Rock, paper, scissors --------------------------------------- */

const PICKS = ["rock", "paper", "scissors"] as const;
type Pick = (typeof PICKS)[number];
const BEATS: Record<Pick, Pick> = { rock: "scissors", paper: "rock", scissors: "paper" };
export const RPS_TARGET = 3; // first to three wins

type RpsState = BaseState & { picks: (Pick | null)[]; scores: number[]; rounds: { picks: Pick[]; winner: number | null }[] };

export const rps: Engine<RpsState> = {
  kind: "rps",
  name: "Rock, paper, scissors",
  minPlayers: 2,
  maxPlayers: 2,
  simultaneous: true,
  init: () => ({ ...base(2), turn: null, picks: [null, null], scores: [0, 0], rounds: [] }),
  move(s, seat, input) {
    const { pick } = z.object({ pick: z.enum(PICKS) }).parse(input);
    if (s.picks[seat]) throw new GameError("already_picked");
    const n = clone(s);
    n.picks[seat] = pick;
    const [a, b] = n.picks;
    if (a && b) {
      const winner = a === b ? null : BEATS[a] === b ? 0 : 1;
      if (winner !== null) n.scores[winner]!++;
      n.rounds.push({ picks: [a, b], winner });
      n.picks = [null, null];
      if (winner !== null && n.scores[winner] === RPS_TARGET) n.outcome = { winners: [winner] };
    }
    return n;
  },
  // The other player's choice stays secret until both have picked.
  view: (s, seat) => ({ ...s, picks: s.picks.map((p, i) => (i === seat ? p : null)), picked: s.picks.map(Boolean) }),
};
