"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ConnectUser } from "../../_lib/api";
import { getSocket } from "../../_lib/realtime";
import { GAMES, gameInfo, statusLine, type GameSummary, type GameView } from "./meta";

/** The games room: pick a game to open a table, join someone's table, or watch a game in progress. */
export default function GamesLobby({ me }: { me: ConnectUser }) {
  const router = useRouter();
  const [list, setList] = useState<GameSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<GameSummary[]>("/games").then(setList).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    s.on("games:changed", load);
    s.on("connect", load);
    return () => {
      window.clearTimeout(t);
      s.off("games:changed", load);
      s.off("connect", load);
    };
  }, [load]);

  const go = async (key: string, path: string, body: Record<string, unknown> = {}) => {
    setBusy(key);
    setError("");
    try {
      const g = await api<GameView>(path, { body });
      router.push(`/connect/play/game/${g.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  const mine = list.filter((g) => g.players.some((p) => p.id === me.id) && (g.status === "waiting" || g.status === "active"));
  const open = list.filter((g) => g.status === "waiting" && !g.players.some((p) => p.id === me.id) && g.players.length < g.maxPlayers);
  const live = list.filter((g) => g.status === "active" && !g.players.some((p) => p.id === me.id));
  const recent = list.filter((g) => g.status === "finished").slice(0, 6);

  return (
    <section aria-labelledby="games-heading" className="space-y-5">
      <div>
        <h2 id="games-heading" className="text-2xl font-black text-white">Games</h2>
        <p className="mt-1 text-sm text-slate-400">Open a table and others can join from here. Anyone can watch a game in progress.</p>
      </div>
      {error && <p className="text-sm text-rose-200">{error}</p>}

      {mine.length > 0 && <Tables title="Your games" games={mine} meId={me.id} action="Continue" />}
      {open.length > 0 && <Tables title="Open tables" games={open} meId={me.id} action="Join" busy={busy} onAction={(g) => go(g.id, `/games/${g.id}/join`)} />}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {GAMES.map((g) => (
          <li key={g.kind} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl" aria-hidden>
                {g.icon}
              </span>
              <div className="min-w-0">
                <p className="font-black text-white">{g.name}</p>
                <p className="text-xs text-slate-500">{g.players}</p>
              </div>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-400">{g.blurb}</p>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => go(g.kind, "/games", { kind: g.kind })}
              className="mt-3 rounded-xl bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-white disabled:opacity-50"
            >
              {busy === g.kind ? "Opening…" : "Open a table"}
            </button>
          </li>
        ))}
      </ul>

      {live.length > 0 && <Tables title="Being played now" games={live} meId={me.id} action="Watch" />}
      {recent.length > 0 && <Tables title="Recent results" games={recent} meId={me.id} action="View" />}
    </section>
  );
}

function Tables({
  title,
  games,
  meId,
  action,
  busy,
  onAction,
}: {
  title: string;
  games: GameSummary[];
  meId: string;
  action: string;
  busy?: string | null;
  onAction?: (g: GameSummary) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-black text-slate-300">{title}</h3>
      <ul className="mt-2 divide-y divide-white/5 rounded-2xl border border-white/10">
        {games.map((g) => {
          const seat = g.players.findIndex((p) => p.id === meId);
          return (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-bold text-white">
                  <span aria-hidden>{gameInfo(g.kind)?.icon} </span>
                  {g.name}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {g.players.map((p) => `@${p.username}`).join(", ")} · {statusLine(g, seat >= 0 ? seat : null)}
                </p>
              </div>
              {onAction ? (
                <button type="button" disabled={Boolean(busy)} onClick={() => onAction(g)} className="rounded-xl bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950 disabled:opacity-50">
                  {busy === g.id ? "Joining…" : action}
                </button>
              ) : (
                <Link href={`/connect/play/game/${g.id}`} className="rounded-xl border border-white/15 px-4 py-1.5 text-sm font-bold text-slate-200 hover:border-cyan-300">
                  {action}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
