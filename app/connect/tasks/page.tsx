"use client";

import { useCallback, useEffect, useState } from "react";
import { confettiAt } from "../_components/Social";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Task = {
  id: string;
  title: string;
  visibility: "public" | "admin";
  highlight: boolean;
  dueAt: string | null;
  doneAt: string | null;
  createdBy: string | null;
  meetingRequestId: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Tasks({ me }: { me: ConnectUser }) {
  const admin = me.role === "admin";
  const [items, setItems] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<Task[]>("/tasks").then(setItems).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    s.on("tasks:changed", load);
    s.on("connect", load);
    return () => {
      window.clearTimeout(t);
      s.off("tasks:changed", load);
      s.off("connect", load);
    };
  }, [load]);

  const act = (p: Promise<unknown>) =>
    p.then(load).catch((e) => {
      setError(errorMessage(e));
      load();
    });
  const update = (id: string, body: Record<string, unknown>) => act(api(`/tasks/${id}`, { method: "PUT", body }));

  const open = items.filter((t) => !t.doneAt);
  const done = items.filter((t) => t.doneAt);

  const row = (t: Task) => {
    const overdue = !t.doneAt && t.dueAt && new Date(t.dueAt) < new Date();
    return (
      <li
        key={t.id}
        className={`flex items-start gap-3 rounded-2xl border p-3 transition ${
          t.visibility === "admin"
            ? "border-amber-300/40 bg-amber-300/10"
            : t.highlight
              ? "border-cyan-300/40 bg-cyan-300/10"
              : "border-white/10 bg-white/[0.03]"
        }`}
      >
        <input
          type="checkbox"
          checked={Boolean(t.doneAt)}
          aria-label={t.doneAt ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
          onChange={(e) => {
            if (e.target.checked) {
              const r = e.currentTarget.getBoundingClientRect();
              confettiAt(r.left + r.width / 2, r.top);
            }
            // Tick at once; the server's answer (or a reload on failure) confirms it.
            const done = e.target.checked;
            setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, doneAt: done ? new Date().toISOString() : null } : x)));
            void update(t.id, { done });
          }}
          className="mt-1 h-5 w-5 shrink-0 accent-cyan-300"
        />
        <div className="min-w-0 flex-1">
          {editing === t.id ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void update(t.id, { title: draft }).then(() => setEditing(null));
              }}
              className="flex gap-2"
            >
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} autoFocus aria-label="Task" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-sm text-white" />
              <button type="submit" className="text-xs font-black text-cyan-300">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="text-xs font-bold text-slate-400">Cancel</button>
            </form>
          ) : (
            <p className={`break-words ${t.doneAt ? "text-slate-500 line-through" : "text-white"}`}>{t.title}</p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
            {t.visibility === "admin" && <span className="font-black text-amber-200">Only you (admin)</span>}
            {t.dueAt && <span className={overdue ? "font-bold text-rose-300" : ""}>{overdue ? "Overdue: " : "Due "}{fmt(t.dueAt)}</span>}
            {t.createdBy && <span>added by @{t.createdBy}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs font-bold">
          {editing !== t.id && (
            <button type="button" onClick={() => { setEditing(t.id); setDraft(t.title); }} className="text-slate-400 hover:text-white">
              Edit
            </button>
          )}
          {admin && (
            <button type="button" onClick={() => void update(t.id, { highlight: !t.highlight })} className="text-slate-400 hover:text-cyan-200">
              {t.highlight ? "Unpin" : "Pin"}
            </button>
          )}
          <button type="button" onClick={() => void act(api(`/tasks/${t.id}`, { method: "DELETE" }))} className="text-slate-500 hover:text-rose-300">
            Delete
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">To-do list</h1>
        <p className="mt-2 text-sm text-slate-400">
          One shared list: everyone can add, edit, tick off and delete items, and changes appear for everybody at once.
          {admin && " Amber items are visible only to administrators; approved meeting requests land here."}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(api("/tasks", { body: { title, dueAt: due ? new Date(due).toISOString() : null, visibility: adminOnly ? "admin" : "public" } })).then(() => {
            setTitle("");
            setDue("");
          });
        }}
        className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center"
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} placeholder="Add something to do" aria-label="New task" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due (optional)" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        {admin && (
          <label className="flex items-center gap-2 text-xs text-amber-100">
            <input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} /> Only me
          </label>
        )}
        <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950">Add</button>
      </form>
      {error && <p className="text-sm text-rose-200">{error}</p>}

      <section>
        <h2 className="text-sm font-black text-cyan-300">To do ({open.length})</h2>
        <ul className="mt-2 space-y-2">
          {open.length === 0 && <li className="text-sm text-slate-500">Nothing to do. Add the first item above.</li>}
          {open.map(row)}
        </ul>
      </section>
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-black text-slate-400">Done in the last 14 days ({done.length})</h2>
          <ul className="mt-2 space-y-2">{done.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Tasks me={me} />}</Workspace>;
}

