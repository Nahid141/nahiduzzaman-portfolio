"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { confettiAt } from "../../../_components/Social";
import Workspace from "../../../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../../../_lib/api";
import { getSocket } from "../../../_lib/realtime";
import { ChessBoard, Checkers, ConnectFour, Gomoku, Reversi, RockPaperScissors, TicTacToe, type BoardProps } from "../../_games/Boards";
import { DotsAndBoxes, Ludo, Snakes } from "../../_games/DiceBoards";
import { gameInfo, seatColor, statusLine, type GameView } from "../../_games/meta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BOARDS: Record<string, (p: BoardProps<any>) => React.ReactNode> = {
  chess: ChessBoard,
  ludo: Ludo,
  tictactoe: TicTacToe,
  connect4: ConnectFour,
  checkers: Checkers,
  reversi: Reversi,
  gomoku: Gomoku,
  dots: DotsAndBoxes,
  snakes: Snakes,
  rps: RockPaperScissors,
};

const btn = "rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300 disabled:opacity-40";
const primary = "rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-white disabled:opacity-40";

function GameRoom({ id, me }: { id: string; me: ConnectUser }) {
  const router = useRouter();
  const [g, setG] = useState<GameView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = useRef(-1);
  const celebrated = useRef(false);

  const accept = useCallback((next: GameView) => {
    if (next.version < latest.current) return;
    latest.current = next.version;
    setG(next);
  }, []);
  const load = useCallback(() => {
    api<GameView>(`/games/${id}`).then(accept).catch((e) => setError(errorMessage(e)));
  }, [id, accept]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    const onChanged = (p: { id: string; version: number }) => p.id === id && p.version > latest.current && load();
    s.on("games:changed", onChanged);
    s.on("connect", load);
    return () => {
      window.clearTimeout(t);
      s.off("games:changed", onChanged);
      s.off("connect", load);
    };
  }, [id, load]);

  useEffect(() => {
    if (!g || g.status !== "finished" || celebrated.current || g.seat === null || !g.winners?.includes(g.seat)) return;
    celebrated.current = true;
    confettiAt(window.innerWidth / 2, window.innerHeight / 3);
  }, [g]);

  const act = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      accept(await api<GameView>(`/games/${id}/${path}`, { body }));
    } catch (e) {
      setError(errorMessage(e));
      load();
    }
    setBusy(false);
  };
  const newTable = async () => {
    if (!g) return;
    setBusy(true);
    try {
      const n = await api<GameView>("/games", { body: { kind: g.kind } });
      router.push(`/connect/play/game/${n.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (!g) return <p className="text-slate-400">{error || "Loading the game…"}</p>;
  const info = gameInfo(g.kind);
  const Board = BOARDS[g.kind];
  const seat = g.seat;
  const playing = seat !== null && g.status === "active" && !g.out[seat];
  const myTurn = playing && (g.simultaneous || g.turn === seat);
  const isCreator = g.players[0]?.id === me.id;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/connect/play" className="text-sm font-bold text-cyan-200 hover:underline">
            ← Play together
          </Link>
          <h1 className="mt-1 text-3xl font-black text-white">
            <span aria-hidden>{info?.icon} </span>
            {g.name}
          </h1>
          <p className={`mt-1 text-lg font-bold ${myTurn ? "text-cyan-200" : "text-slate-300"}`} role="status" aria-live="polite">
            {statusLine(g, seat)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {g.status === "waiting" && seat === null && g.players.length < g.maxPlayers && (
            <button type="button" className={primary} disabled={busy} onClick={() => act("join")}>
              Join this table
            </button>
          )}
          {g.status === "waiting" && (isCreator || me.role === "admin") && g.players.length >= g.minPlayers && (
            <button type="button" className={primary} disabled={busy} onClick={() => act("start")}>
              Start the game
            </button>
          )}
          {g.status === "waiting" && seat !== null && (
            <button type="button" className={btn} disabled={busy} onClick={() => act("leave")}>
              Leave the table
            </button>
          )}
          {playing && (
            <button type="button" className={btn} disabled={busy} onClick={() => act("resign")}>
              Resign
            </button>
          )}
          {(g.status === "finished" || g.status === "abandoned") && (
            <button type="button" className={primary} disabled={busy} onClick={newTable}>
              Open a new table
            </button>
          )}
        </div>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label="Players">
        {g.players.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${g.turn === i && g.status === "active" ? "border-cyan-300 bg-cyan-300/10 text-white" : "border-white/10 text-slate-300"} ${g.out[i] ? "line-through opacity-50" : ""}`}
          >
            <span className="h-3 w-3 rounded-full border border-slate-500" style={{ background: seatColor(g, i) }} aria-hidden />
            {i === seat ? "You" : `@${p.username}`}
            {g.winners?.includes(i) && " 🏆"}
          </li>
        ))}
        {g.status === "waiting" &&
          Array.from({ length: g.maxPlayers - g.players.length }, (_, i) => (
            <li key={`free-${i}`} className="rounded-full border border-dashed border-white/15 px-3 py-1 text-sm text-slate-500">
              Free seat
            </li>
          ))}
      </ul>

      {error && <p className="text-sm text-rose-200">{error}</p>}

      {g.status === "waiting" && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          {g.minPlayers === g.maxPlayers
            ? "The game starts when the second player joins. Others can join from Play together."
            : `${g.players.length < g.minPlayers ? "Waiting for at least one more player." : "Start whenever everyone is here."} Up to ${g.maxPlayers} people can play.`}
        </p>
      )}
      {g.state && Board && <Board g={g} s={g.state} seat={seat} myTurn={myTurn} busy={busy} send={(m) => void act("move", m)} />}
      {seat === null && g.status === "active" && <p className="text-center text-sm text-slate-500">You are watching this game.</p>}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Workspace>{(me) => <GameRoom id={id} me={me} />}</Workspace>;
}
