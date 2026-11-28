import { connectFour, dotsAndBoxes, gomoku, reversi, ticTacToe } from "./boards.js";
import { checkers, chess } from "./chess.js";
import { ludo, rps, snakes } from "./dice.js";
import type { BaseState, Engine } from "./types.js";

export const ENGINES = [chess, ludo, ticTacToe, connectFour, checkers, reversi, gomoku, dotsAndBoxes, snakes, rps] as unknown as Engine<BaseState>[];
export const GAME_KINDS = ENGINES.map((e) => e.kind) as [string, ...string[]];
export const engineFor = (kind: string) => ENGINES.find((e) => e.kind === kind);
