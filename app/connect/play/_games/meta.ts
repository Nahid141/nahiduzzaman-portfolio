/** The ten games in the games room. The rules run on the Connect server; these are labels for the lobby. */
export const GAMES = [
  { kind: "chess", name: "Chess", icon: "♞", players: "2 players", blurb: "The classic. Checkmate the other king." },
  { kind: "ludo", name: "Ludo", icon: "🎲", players: "2–4 players", blurb: "Race your four tokens home. Sixes bring them out." },
  { kind: "tictactoe", name: "Tic-tac-toe", icon: "✖️", players: "2 players", blurb: "Three in a row on a 3 × 3 grid." },
  { kind: "connect4", name: "Four in a row", icon: "🔴", players: "2 players", blurb: "Drop discs; line up four in any direction." },
  { kind: "checkers", name: "Checkers", icon: "⛀", players: "2 players", blurb: "Jump to capture. Captures are compulsory." },
  { kind: "reversi", name: "Reversi", icon: "⚫", players: "2 players", blurb: "Trap discs between yours to flip them." },
  { kind: "gomoku", name: "Five in a row", icon: "⭕", players: "2 players", blurb: "Five stones in a line on a 15 × 15 board." },
  { kind: "dots", name: "Dots and boxes", icon: "🔲", players: "2–4 players", blurb: "Draw lines; close a box to score and go again." },
  { kind: "snakes", name: "Snakes and ladders", icon: "🐍", players: "2–4 players", blurb: "Climb ladders, dodge snakes, reach 100." },
  { kind: "rps", name: "Rock, paper, scissors", icon: "✊", players: "2 players", blurb: "Secret picks, first to three wins." },
] as const;

export const gameInfo = (kind: string) => GAMES.find((g) => g.kind === kind);

export type Player = { id: string; username: string; fullName: string };
export type GameSummary = {
  id: string;
  kind: string;
  name: string;
  status: "waiting" | "active" | "finished" | "abandoned";
  players: Player[];
  minPlayers: number;
  maxPlayers: number;
  turn: number | null;
  winners: number[] | null;
  out: boolean[];
  version: number;
  updatedAt: string;
};
export type GameView<S = Record<string, unknown>> = GameSummary & { seat: number | null; simultaneous: boolean; state: (S & { turn: number | null; outcome: { winners: number[] } | null; out: boolean[] }) | null };

/** Seat colours; Ludo uses its board colours instead. */
export const SEAT = ["#22d3ee", "#fb7185", "#fbbf24", "#34d399"];
export const LUDO = ["#f43f5e", "#22c55e", "#eab308", "#3b82f6"];

export function seatColor(g: GameView, seat: number) {
  if (g.kind === "ludo" && g.state) return LUDO[(g.state as unknown as { colors: number[] }).colors[seat] ?? seat]!;
  if (g.kind === "chess") return seat === 0 ? "#f8fafc" : "#1e293b";
  if (g.kind === "reversi") return seat === 0 ? "#0f172a" : "#f8fafc";
  if (g.kind === "checkers") return seat === 0 ? "#fb7185" : "#e2e8f0";
  return SEAT[seat]!;
}

/** One line on where the game stands, from the viewer's side. */
export function statusLine(g: GameSummary, meSeat: number | null) {
  const name = (i: number) => (i === meSeat ? "You" : `@${g.players[i]?.username ?? "?"}`);
  if (g.status === "waiting") return `Waiting for players (${g.players.length}/${g.maxPlayers})`;
  if (g.status === "abandoned") return "Closed";
  if (g.status === "finished") {
    const w = g.winners ?? [];
    if (!w.length) return "Draw";
    return w.map(name).join(" and ") + (w.length === 1 && w[0] === meSeat ? " won! 🎉" : " won");
  }
  if (g.turn === null) return "Both pick at the same time";
  return g.turn === meSeat ? "Your turn" : `${name(g.turn)}'s turn`;
}
