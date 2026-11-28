"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Workspace from "../_components/Workspace";
import { FilePreview, roomKey, UsageBar, useRooms, type Room } from "../_components/FileBits";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { ACCEPT, formatBytes, KIND_LABEL, uploadFile, type FileKind, type SharedFile, type Usage } from "../_lib/files";
import { getSocket } from "../_lib/realtime";

type Job = { key: string; name: string; progress: number; error?: string; done?: boolean };

function Files({ me }: { me: ConnectUser }) {
  const rooms = useRooms(me.id);
  const [room, setRoom] = useState<Room | null>(null);
  const [scope, setScope] = useState<"all" | "room" | "mine">("all");
  const [kind, setKind] = useState<FileKind | "">("");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [list, setList] = useState<SharedFile[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<SharedFile | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = room ?? rooms[0] ?? null;

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (kind) p.set("kind", kind);
    if (scope === "mine") p.set("mine", "true");
    if (scope === "room" && current) {
      p.set("targetKind", current.target.kind);
      p.set("targetId", current.target.id);
    }
    api<SharedFile[]>(`/files?${p}`).then(setList).catch((e) => setError(errorMessage(e)));
    api<Usage>("/files/usage").then(setUsage).catch(() => undefined);
  }, [q, kind, scope, current]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const s = getSocket();
    const refresh = () => load();
    s.on("file:new", refresh);
    s.on("file:deleted", refresh);
    return () => {
      s.off("file:new", refresh);
      s.off("file:deleted", refresh);
    };
  }, [load]);

  async function start(filesIn: FileList | File[]) {
    if (!current) return setError("Open a channel or conversation first; files are shared into one.");
    setError("");
    await Promise.all(
      [...filesIn].map(async (f) => {
        const key = `${f.name}-${f.size}-${Math.random()}`;
        setJobs((j) => [...j, { key, name: f.name, progress: 0 }]);
        const set = (patch: Partial<Job>) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, ...patch } : x)));
        try {
          await uploadFile(current.target, f, { folder, onProgress: (progress) => set({ progress }) });
          set({ progress: 1, done: true });
        } catch (e) {
          set({ error: errorMessage(e) });
        }
      })
    );
    load();
  }

  async function remove(f: SharedFile) {
    try {
      await api(`/files/${f.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const roomLabel = (f: SharedFile) => rooms.find((r) => roomKey(r.target) === roomKey(f.target))?.label ?? "";

  return (
    <div>
      <h1 className="text-3xl font-black text-white">Files</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Files belong to a channel or conversation, and only people in it can open them. Downloads use links that expire after five minutes.
      </p>

      {usage && !usage.storageConfigured && (
        <p className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">File storage is not configured on the server yet.</p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void start(e.dataTransfer.files);
        }}
        className={`mt-6 rounded-3xl border-2 border-dashed p-6 transition ${dragging ? "border-cyan-300 bg-cyan-300/10" : "border-white/15 bg-white/[0.02]"}`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-300">
            Share into
            <select
              value={current ? roomKey(current.target) : ""}
              onChange={(e) => setRoom(rooms.find((r) => roomKey(r.target) === e.target.value) ?? null)}
              className="mt-1 block rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
            >
              {rooms.map((r) => (
                <option key={roomKey(r.target)} value={roomKey(r.target)}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Folder (optional)
            <input value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={60} className="mt-1 block w-40 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
          </label>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={!usage?.storageConfigured || !current}
            className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
          >
            Choose files
          </button>
          <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && void start(e.target.files)} />
          <p className="text-sm text-slate-500">or drop them here</p>
        </div>
        <p className="mt-3 text-xs font-semibold text-amber-200/90">Shared files are deleted automatically 5 days after upload. Keep your own copy.</p>
        {usage && (
          <p className="mt-3 text-xs text-slate-500">
            Limits: images {formatBytes(usage.limits.image)}, documents {formatBytes(usage.limits.document)}, audio {formatBytes(usage.limits.audio)}, video{" "}
            {formatBytes(usage.limits.video)}, ZIP {formatBytes(usage.limits.archive)}.
          </p>
        )}
        {jobs.length > 0 && (
          <ul className="mt-4 space-y-2" aria-live="polite">
            {jobs.map((j) => (
              <li key={j.key} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate text-slate-200">{j.name}</span>
                  <span className={j.error ? "text-rose-300" : j.done ? "text-emerald-300" : "text-slate-400"}>
                    {j.error ?? (j.done ? "Shared" : j.progress >= 1 ? "Verifying…" : `${Math.round(j.progress * 100)}%`)}
                  </span>
                </div>
                {!j.error && !j.done && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-cyan-300 transition-all" style={{ width: `${j.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search files" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
        <select value={kind} onChange={(e) => setKind(e.target.value as FileKind | "")} aria-label="Type" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border border-white/10 p-1 text-sm" role="group" aria-label="Scope">
          {(["all", "room", "mine"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)} className={`rounded-lg px-3 py-1 font-bold ${scope === s ? "bg-cyan-300/15 text-cyan-200" : "text-slate-400"}`}>
              {s === "all" ? "Everything" : s === "room" ? "This room" : "Mine"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {list?.length === 0 && <li className="text-sm text-slate-500">No files yet. Share one above.</li>}
        {list?.map((f) => (
          <li key={f.id} className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-cyan-300/40">
            <button type="button" onClick={() => setOpen(f)} className="min-w-0 flex-1 text-left">
              <p className="truncate font-bold text-white">{f.name}</p>
              <p className="mt-1 text-xs text-slate-400">
                {KIND_LABEL[f.kind]}, {formatBytes(f.sizeBytes)} in {roomLabel(f)}
                {f.folder ? `, folder ${f.folder}` : ""}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(f.createdAt).toLocaleString()}
                {f.expiresAt ? `; expires ${new Date(f.expiresAt).toLocaleDateString()}` : ""}
              </p>
            </button>
            {(f.ownerId === me.id || (me.role === "admin" && f.target.kind === "channel")) && (
              <button type="button" onClick={() => remove(f)} className="text-xs font-bold text-slate-500 hover:text-rose-300">
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {open && <FilePreview file={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function UsageAside() {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    api<Usage>("/files/usage").then(setUsage).catch(() => undefined);
  }, []);
  if (!usage) return null;
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-black text-cyan-300">Storage</h2>
      <UsageBar label="Your files" used={usage.mine.usedBytes} cap={usage.mine.capBytes} />
      <UsageBar label="Shared storage" used={usage.storage.usedBytes} cap={usage.storage.capBytes} />
      <UsageBar label="Downloads this month" used={usage.egress.usedBytes} cap={usage.egress.capBytes} />
      <p className="text-xs leading-5 text-slate-500">Caps keep the workspace inside the free hosting allowance.</p>
    </div>
  );
}

export default function Page() {
  return <Workspace aside={() => <UsageAside />}>{(me) => <Files me={me} />}</Workspace>;
}
