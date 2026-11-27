"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket, sameTarget, type Target } from "../_lib/realtime";

type Poll = {
  id: string;
  target: Target;
  question: string;
  multiple: boolean;
  anonymous: boolean;
  closed: boolean;
  closesAt: string | null;
  createdBy: string | null;
  voters: number;
  mine: number[];
  options: { label: string; count: number; voters: string[] }[];
};

/** Polls for one channel or conversation; they follow the room's access rules on the server. */
export default function Polls({ target, me }: { target: Target; me: ConnectUser }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Poll[]>(`/polls?kind=${target.kind}&id=${target.id}`).then(setPolls).catch((e) => setError(errorMessage(e)));
  }, [target]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    const onChange = (p: { target: Target }) => sameTarget(p.target, target) && load();
    s.on("poll:changed", onChange);
    return () => {
      window.clearTimeout(t);
      s.off("poll:changed", onChange);
    };
  }, [load, target]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/polls", { body: { target, question, options: options.map((o) => o.trim()).filter(Boolean), multiple, anonymous } });
      setCreating(false);
      setQuestion("");
      setOptions(["", ""]);
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function vote(p: Poll, i: number) {
    const next = p.multiple ? (p.mine.includes(i) ? p.mine.filter((x) => x !== i) : [...p.mine, i]) : [i];
    try {
      const updated = await api<Poll>(`/polls/${p.id}/vote`, { body: { options: next } });
      setPolls((ps) => ps.map((x) => (x.id === p.id ? updated : x)));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-label="Polls" className="max-h-72 space-y-3 overflow-y-auto border-b border-white/10 py-3">
      {error && <p className="text-sm text-rose-200">{error}</p>}
      {polls.map((p) => {
        const total = p.options.reduce((a, o) => a + o.count, 0);
        return (
          <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-white">{p.question}</p>
              {!p.closed && (p.createdBy === me.id || (me.role === "admin" && target.kind === "channel")) && (
                <button type="button" onClick={() => api(`/polls/${p.id}/close`, { body: {} }).then(load)} className="text-xs font-bold text-slate-400 hover:text-white">
                  Close poll
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {p.options.map((o, i) => {
                const pct = total ? Math.round((o.count / total) * 100) : 0;
                const picked = p.mine.includes(i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={p.closed}
                      aria-pressed={picked}
                      onClick={() => vote(p, i)}
                      title={o.voters.join(", ")}
                      className={`relative w-full overflow-hidden rounded-xl border px-3 py-1.5 text-left text-sm ${picked ? "border-cyan-300/60" : "border-white/10"} disabled:cursor-default`}
                    >
                      <span className="absolute inset-y-0 left-0 bg-cyan-300/15" style={{ width: `${pct}%` }} aria-hidden />
                      <span className="relative flex justify-between gap-3 text-slate-100">
                        <span>{o.label}</span>
                        <span className="text-slate-400">
                          {o.count} ({pct}%)
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-xs text-slate-500">
              {p.voters} voted{p.multiple ? ", several choices allowed" : ""}
              {p.anonymous ? ", anonymous" : ""}
              {p.closed ? ", closed" : ""}
            </p>
          </div>
        );
      })}
      {polls.length === 0 && !creating && <p className="text-sm text-slate-500">No polls here yet.</p>}
      {creating ? (
        <form onSubmit={create} className="space-y-2 rounded-2xl border border-white/10 p-3">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} required maxLength={300} placeholder="Question" aria-label="Question" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
          {options.map((o, i) => (
            <input
              key={i}
              value={o}
              onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={120}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          ))}
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            {options.length < 10 && (
              <button type="button" onClick={() => setOptions((os) => [...os, ""])} className="font-bold text-cyan-200">
                Add option
              </button>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Several choices
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Anonymous
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-1.5 text-sm font-black text-slate-950">
              Create poll
            </button>
            <button type="button" onClick={() => setCreating(false)} className="text-sm font-bold text-slate-400">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="text-sm font-bold text-cyan-200">
          New poll
        </button>
      )}
    </section>
  );
}
