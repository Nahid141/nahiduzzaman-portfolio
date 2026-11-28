"use client";

import { useEffect, useState } from "react";
import ChatView from "../_components/ChatView";
import Workspace from "../_components/Workspace";
import { api } from "../_lib/api";
import ConnectionDot from "../_components/ConnectionDot";
import { getSocket, type ChatMessage } from "../_lib/realtime";

type Channel = { id: string; name: string; description: string | null; kind: "public" | "restricted"; unread: number };

function Search({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  return (
    <div className="space-y-2">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (q.trim().length >= 2) setResults(await api<ChatMessage[]>(`/search?q=${encodeURIComponent(q.trim())}`).catch(() => []));
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search messages"
          aria-label="Search messages"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
        />
        <button type="button" onClick={onClose} className="text-xs font-bold text-slate-400">
          Close
        </button>
      </form>
      {results && (
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {results.length === 0 && <li className="text-slate-500">No messages match.</li>}
          {results.map((m) => (
            <li key={m.id} className="rounded-xl bg-white/5 p-2">
              <p className="text-xs text-slate-500">
                {m.author?.fullName} · {new Date(m.createdAt).toLocaleString()} · {m.target.kind === "channel" ? "channel" : "direct message"}
              </p>
              <p className="line-clamp-2 text-slate-200">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const load = () =>
      api<Channel[]>("/channels")
        .then((list) => {
          setChannels(list);
          setActive((cur) => cur ?? list[0]?.id ?? null);
        })
        .catch(() => undefined);
    load();
    const s = getSocket();
    s.on("channel:new", load);
    return () => {
      s.off("channel:new", load);
    };
  }, []);

  const current = channels.find((c) => c.id === active);

  return (
    <Workspace
      aside={() => (
        <div className="space-y-5">
          <ConnectionDot />
          {searching ? (
            <Search onClose={() => setSearching(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-slate-400 hover:text-white"
            >
              Search messages…
            </button>
          )}
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Channels</h2>
            <ul className="mt-2 space-y-1">
              {channels.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === active}
                    onClick={() => {
                      setActive(c.id);
                      setChannels((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                      c.id === active ? "bg-cyan-300/15 text-cyan-100" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>
                      # {c.name}
                      {c.kind === "restricted" && <span className="ml-1 text-xs text-slate-500">(private)</span>}
                    </span>
                    {c.unread > 0 && c.id !== active && (
                      <span className="rounded-full bg-cyan-300 px-2 text-xs font-black text-slate-950">{c.unread}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    >
      {(me) =>
        current ? (
          <ChatView
            key={current.id}
            target={{ kind: "channel", id: current.id }}
            me={me}
            title={`# ${current.name}`}
            subtitle={current.description ?? undefined}
          />
        ) : (
          <p className="py-24 text-center text-slate-400">Loading channels…</p>
        )
      }
    </Workspace>
  );
}
