"use client";

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { fileUrl } from "../_lib/client";
import type { JobStatus, ResultFile } from "../_lib/types";

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

export function JobProgress({ job, error }: { job: JobStatus | null; error: string | null }) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!job) return null;
  const pct = Math.round((job.status === "succeeded" ? 1 : job.progress || 0) * 100);
  const text = job.status === "queued"
    ? `Queued${job.queue_position ? ` (position ${job.queue_position})` : ""}`
    : job.status === "failed" ? `Analysis failed: ${job.error ?? "unknown error"}` : job.message ?? job.status;
  if (job.status === "failed") return <Notice tone="error">{text}</Notice>;
  if (job.status === "cancelled") return <Notice tone="warn">The analysis was cancelled.</Notice>;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs font-bold text-slate-300">
        <span>{text}</span>
        <span className="font-mono text-cyan-200">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Analysis progress">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
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
