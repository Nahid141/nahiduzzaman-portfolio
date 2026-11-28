/** Shared shapes for the server-side game rules. Every move is checked here; browsers only send intentions. */

export type Rng = () => number;

/** `winners` empty means a draw. */
export type Outcome = { winners: number[] } | null;

/** Fields every game state carries. `turn` is null for simultaneous games (rock-paper-scissors). */
export type BaseState = { turn: number | null; outcome: Outcome; out: boolean[] };

export interface Engine<S extends BaseState = BaseState> {
  kind: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** Players move at the same time; the service does not check `turn`. */
  simultaneous?: boolean;
  init(players: number, rng: Rng): S;
  /** Returns the next state, or throws GameError. Must not mutate `s`. */
  move(s: S, seat: number, input: unknown, rng: Rng): S;
  /** What a seat (or a spectator, null) may see; defaults to the whole state. */
  view?(s: S, seat: number | null): unknown;
  /** Called after `out[seat]` is set and at least two players remain. */
  afterResign?(s: S, seat: number): S;
}

export class GameError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

export const clone = <T>(v: T): T => structuredClone(v);
export const dice = (rng: Rng) => 1 + Math.floor(rng() * 6);

/** The next seat after `from` that has not resigned. */
export function nextSeat(s: BaseState, from: number): number {
  const n = s.out.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (!s.out[seat]) return seat;
  }
  return from;
}

export const base = (players: number): BaseState => ({ turn: 0, outcome: null, out: Array(players).fill(false) });

/** Seats with the highest score; everyone level means a draw. */
export function topScorers(scores: number[], out: boolean[]): number[] {
  const live = scores.map((v, i) => ({ v, i })).filter((x) => !out[x.i]);
  const best = Math.max(...live.map((x) => x.v));
  const top = live.filter((x) => x.v === best).map((x) => x.i);
  return top.length === live.length && live.length > 1 ? [] : top;
}
