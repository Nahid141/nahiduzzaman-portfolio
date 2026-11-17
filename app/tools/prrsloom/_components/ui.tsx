"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { downloadText, fileUrl } from "../_lib/client";
import type { JobStatus, LogEntry, ResultFile } from "../_lib/types";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl backdrop-blur-xl md:p-7 ${className}`}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "purple" }) {
  return (
    <p className={`text-xs font-black uppercase tracking-[0.25em] ${tone === "cyan" ? "text-cyan-300" : "text-purple-300"}`}>{children}</p>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const styles = {
    info: "border-cyan-300/30 bg-cyan-300/10 text-cyan-50",
    warn: "border-amber-300/40 bg-amber-300/10 text-amber-50",
    error: "border-rose-400/50 bg-rose-500/15 text-rose-50",
    ok: "border-emerald-300/40 bg-emerald-400/10 text-emerald-50",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${styles}`}>
      {children}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/40";

export function FileField({
  label, hint, accept, file, onChange,
}: { label: string; hint?: string; accept: string; file: File | null; onChange: (f: File | null) => void }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-slate-100">{label}</label>
      {hint && <p id={`${id}-hint`} className="text-xs leading-5 text-slate-400">{hint}</p>}
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="file"
          accept={accept}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-xl border border-dashed border-white/20 bg-slate-900/60 text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cyan-400 file:px-3 file:py-2 file:text-sm file:font-black file:text-slate-950 hover:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
        />
        {file && (
          <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 hover:text-white" aria-label={`Remove ${file.name}`}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 7 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-slate-100">{label}</label>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} spellCheck={false}
        onChange={(e) => onChange(e.target.value)} className={`${inputBase} resize-y font-mono text-xs leading-5`} />
    </div>
  );
}

export function Select({ label, value, options, onChange, hint }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-slate-100">{label}</label>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputBase}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function NumberField({ label, value, onChange, min, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-slate-100">{label}</label>
      <input id={id} type="number" min={min} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputBase} />
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="font-bold text-slate-100">{label}</label>
        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-xs text-cyan-200">{format ? format(value) : value}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400" />
    </div>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">{label}</label>
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className="w-full rounded-2xl bg-cyan-400 px-5 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-cyan-400">
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-100 transition hover:border-cyan-300/60 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300/40 disabled:opacity-50">
      {children}
    </button>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={`rounded-full px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${
            value === t.id ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/[0.04] text-slate-300 hover:text-white"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<JobStatus["status"], { label: string; pill: string; dot: string; bar: string }> = {
  queued: { label: "Queued", pill: "border-slate-300/30 bg-slate-300/10 text-slate-100", dot: "bg-slate-300", bar: "from-slate-400 to-slate-300" },
  running: { label: "Running", pill: "border-sky-300/40 bg-sky-400/15 text-sky-100", dot: "bg-sky-300 animate-pulse", bar: "from-sky-400 via-cyan-300 to-indigo-400" },
  succeeded: { label: "Completed", pill: "border-emerald-300/40 bg-emerald-400/15 text-emerald-100", dot: "bg-emerald-300", bar: "from-emerald-400 to-teal-300" },
  failed: { label: "Failed", pill: "border-rose-400/50 bg-rose-500/15 text-rose-100", dot: "bg-rose-400", bar: "from-rose-500 to-rose-400" },
  cancelled: { label: "Cancelled", pill: "border-amber-300/40 bg-amber-300/10 text-amber-100", dot: "bg-amber-300", bar: "from-amber-400 to-amber-300" },
  expired: { label: "Expired", pill: "border-slate-300/30 bg-slate-300/10 text-slate-200", dot: "bg-slate-400", bar: "from-slate-500 to-slate-400" },
};

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s` : `${m}m ${String(r).padStart(2, "0")}s`;
}

export function JobProgress({ job, error, log = [] }: { job: JobStatus | null; error: string | null; log?: LogEntry[] }) {
  const active = job?.status === "running" || job?.status === "queued";
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [active]);
  if (!job) return error ? <Notice tone="error">{error}</Notice> : null;
  const style = STATUS_STYLE[job.status] ?? STATUS_STYLE.running;
  const pct = job.status === "succeeded" ? 100 : Math.min(99.9, Math.max(0, (job.progress || 0) * 100));
  const step = job.status === "queued"
    ? `Waiting for a free analysis slot${job.queue_position ? ` (position ${job.queue_position} in the queue)` : ""}`
    : job.status === "failed" ? job.error ?? "The analysis failed."
    : job.status === "cancelled" ? "The analysis was cancelled; the server stopped it."
    : job.message ?? "Working…";
  const elapsed = job.started ? (job.finished ?? (active ? now : job.started)) - job.started : null;
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="overflow-hidden rounded-3xl border border-sky-300/20 bg-gradient-to-br from-sky-950/70 via-slate-950 to-indigo-950/60 p-5 shadow-xl shadow-sky-950/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${style.pill}`}>
              <span className={`h-2 w-2 rounded-full ${style.dot}`} />{style.label}
            </span>
            <p className={`text-sm font-semibold leading-6 ${job.status === "failed" ? "text-rose-100" : "text-slate-100"}`}>{step}</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-black tabular-nums text-sky-100">{pct.toFixed(pct < 100 ? 1 : 0)}<span className="text-lg text-sky-300">%</span></div>
            {elapsed !== null && <div className="text-xs font-semibold text-slate-400">elapsed {clock(elapsed)}</div>}
          </div>
        </div>
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(pct)} aria-label="Analysis progress">
          <div className={`relative h-full rounded-full bg-gradient-to-r ${style.bar} transition-all duration-700`} style={{ width: `${Math.max(pct, 2)}%` }}>
            {job.status === "running" && <div className="absolute inset-0 animate-pulse rounded-full bg-white/20" />}
          </div>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <LiveLog lines={log} live={active} />
    </div>
  );
}

/** Blue console with the analysis steps reported by the server, newest at the bottom. */
export function LiveLog({ lines, live }: { lines: LogEntry[]; live: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // follow new lines unless the reader scrolled up
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  if (!lines.length && !live) return null;
  const fmtTime = (t: number | null) => (t ? new Date(t * 1000).toLocaleTimeString([], { hour12: false }) : "--:--:--");
  const download = () => downloadText(`prrsloom_analysis_log_${new Date().toISOString().slice(0, 10)}.txt`,
    lines.map((l) => `${fmtTime(l.t)}  ${l.p.toFixed(1).padStart(5)}%  ${l.l.toUpperCase().padEnd(5)}  ${l.m}`).join("\n"), "text/plain");
  return (
    <section className="overflow-hidden rounded-3xl border border-blue-400/30 bg-[#041226] shadow-xl shadow-blue-950/40" aria-label="Live analysis log">
      <header className="flex items-center justify-between gap-3 border-b border-blue-400/20 bg-blue-950/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-sky-300" : "bg-blue-400/60"}`} />
          Live analysis log
          {live && <span className="rounded bg-sky-400/20 px-1.5 py-0.5 text-[10px] text-sky-200">LIVE</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-semibold text-blue-200/70">
          <span>{lines.length} {lines.length === 1 ? "entry" : "entries"}</span>
          {lines.length > 0 && <button type="button" onClick={download} className="rounded-lg border border-blue-300/30 px-2 py-1 text-blue-100 hover:border-sky-300 hover:text-sky-200">Download log</button>}
        </div>
      </header>
      <div ref={box} role="log" aria-live="polite"
        onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
        className="max-h-72 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6">
        {lines.length === 0 && <div className="text-blue-300/70">Waiting for the server…</div>}
        {lines.map((l, i) => (
          <div key={i} className={`grid grid-cols-[4.6rem_3.6rem_1fr] gap-2 ${
            l.l === "error" ? "font-bold text-rose-300" : l.l === "warn" ? "text-amber-200" : i === lines.length - 1 && live ? "text-white" : "text-sky-200"}`}>
            <span className="text-blue-400/80">{fmtTime(l.t)}</span>
            <span className="text-right tabular-nums text-blue-300/80">{l.p.toFixed(1)}%</span>
            <span className="break-words">{l.l === "error" ? "✖ " : l.l === "warn" ? "⚠ " : ""}{l.m}</span>
          </div>
        ))}
        {live && <div className="mt-1 h-4 w-2 animate-pulse bg-sky-300/80" aria-hidden />}
      </div>
    </section>
  );
}

export function Downloads({ jobId, files }: { jobId: string; files: ResultFile[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={fileUrl(jobId, f.id)} download
          className={`rounded-xl px-3 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300/50 ${
            f.kind === "bundle" ? "bg-purple-400 text-slate-950 hover:bg-white" : "border border-white/15 bg-white/[0.04] text-slate-100 hover:border-cyan-300/60 hover:text-cyan-200"}`}>
          ↓ {f.label}
        </a>
      ))}
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "NA";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : Number(v.toPrecision(6)).toString();
  return String(v);
}

export function DataTable({ rows, columns, pageSize = 15, caption, onRowClick }: {
  rows: Record<string, unknown>[]; columns: string[]; pageSize?: number; caption: string; onRowClick?: (r: Record<string, unknown>) => void;
}) {
  const [query, setQuery] = useState("");
  // Filtering a large table (e.g. 11,175 TIMER pairs x 28 columns) on every keystroke would block
  // typing; the deferred value lets the input update first and the rows follow.
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let out = q ? rows.filter((r) => columns.some((c) => fmt(r[c]).toLowerCase().includes(q))) : rows;
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.col], y = b[sort.col];
        if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
        return fmt(x).localeCompare(fmt(y), undefined, { numeric: true }) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, deferredQuery, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * pageSize, current * pageSize + pageSize);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Filter rows…"
          aria-label={`Filter ${caption}`} className={`${inputBase} max-w-xs`} />
        <span className="text-xs text-slate-400">{filtered.length} of {rows.length} rows</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-white/[0.06] text-slate-200">
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-black">
                  <button type="button" className="hover:text-cyan-200" onClick={() => setSort(sort?.col === c ? { col: c, dir: sort.dir === 1 ? -1 : 1 } : { col: c, dir: 1 })}>
                    {c}{sort?.col === c ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-t border-white/5 text-slate-300 ${onRowClick ? "cursor-pointer hover:bg-cyan-300/10" : "hover:bg-white/[0.03]"}`}>
                {columns.map((c) => <td key={c} className="max-w-[22rem] truncate whitespace-nowrap px-3 py-1.5" title={fmt(r[c])}>{fmt(r[c])}</td>)}
              </tr>
            ))}
            {slice.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">No rows.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <GhostButton onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>Previous</GhostButton>
          <span className="text-slate-400">Page {current + 1} of {pages}</span>
          <GhostButton onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1}>Next</GhostButton>
        </div>
      )}
    </div>
  );
}
