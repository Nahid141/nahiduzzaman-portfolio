"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../_lib/api";
import { formatBytes } from "../_lib/files";
import { UsageBar } from "./FileBits";

type FullSettings = Record<string, boolean | number>;
type System = {
  uptimeSeconds: number;
  memory: { rssBytes: number; heapUsedBytes: number };
  loadAverage: number[];
  cpus: number;
  sockets: number;
  database: { ok: boolean; latencyMs: number };
  storage: { readyBytes: number; pendingBytes: number; readyCount: number };
  egressBytesThisMonth: number;
  meetingMinutesThisMonth: number;
  liveMeetings: number;
  securityEvents24h: number;
  integrations: { storage: boolean; meetings: boolean; email: string };
};
type Announcement = { id: string; body: string; createdAt: string; author: string | null };

const MB = 1024 * 1024;
const FLAGS: [string, string][] = [
  ["uploadsEnabled", "File uploads"],
  ["meetingsEnabled", "Meetings"],
  ["membersCanCreateMeetings", "Members can start meetings"],
  ["musicRequestsEnabled", "Music requests"],
  ["followHostMode", "Follow Host Mode"],
];
const SIZES: [string, string, number][] = [
  ["maxImageBytes", "Image limit (MB)", 50],
  ["maxDocumentBytes", "Document limit (MB)", 50],
  ["maxAudioBytes", "Audio limit (MB)", 50],
  ["maxVideoBytes", "Video limit (MB)", 50],
  ["maxArchiveBytes", "ZIP limit (MB)", 50],
  ["storagePerUserBytes", "Storage per member (MB)", 1000],
  ["storageTotalBytes", "Total storage cap (MB)", 1000],
  ["egressMonthlyBytes", "Monthly download cap (MB)", 5000],
];

/** Free-tier limits, feature switches, announcements and system status. */
export default function AdminOps() {
  const [settings, setSettings] = useState<FullSettings | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const [notes, setNotes] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<FullSettings>("/admin/settings").then(setSettings).catch((e) => setError(errorMessage(e)));
    api<System>("/admin/system").then(setSystem).catch(() => undefined);
    api<Announcement[]>("/announcements").then(setNotes).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const id = window.setInterval(() => api<System>("/admin/system").then(setSystem).catch(() => undefined), 15_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [load]);

  const save = async (patch: FullSettings) => {
    setError("");
    try {
      setSettings(await api<FullSettings>("/admin/settings", { method: "PUT", body: patch }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="mt-10 space-y-8">
      {error && <p className="text-sm text-rose-200">{error}</p>}
      {system && (
        <section>
          <h2 className="text-xl font-black text-white">System</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Uptime", `${Math.floor(system.uptimeSeconds / 3600)} h ${Math.floor((system.uptimeSeconds % 3600) / 60)} min`],
              ["Memory", formatBytes(system.memory.rssBytes)],
              ["CPU load (1 min)", `${system.loadAverage[0]?.toFixed(2)} on ${system.cpus} CPU`],
              ["Live connections", String(system.sockets)],
              ["Database", system.database.ok ? `OK, ${system.database.latencyMs} ms` : "Down"],
              ["Live meetings", String(system.liveMeetings)],
              ["Security events (24 h)", String(system.securityEvents24h)],
              ["Integrations", `storage ${system.integrations.storage ? "on" : "off"}, meetings ${system.integrations.meetings ? "on" : "off"}, email ${system.integrations.email}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="mt-1 text-sm font-bold text-white">{v}</dd>
              </div>
            ))}
          </dl>
          {settings && (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <UsageBar label="Storage used" used={system.storage.readyBytes + system.storage.pendingBytes} cap={Number(settings.storageTotalBytes)} />
              <UsageBar label="Downloads this month" used={system.egressBytesThisMonth} cap={Number(settings.egressMonthlyBytes)} />
              <div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Meeting minutes this month</span>
                  <span>
                    {system.meetingMinutesThisMonth} of {String(settings.meetingMinutesMonthly)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-cyan-300" style={{ width: `${Math.min(100, (system.meetingMinutesThisMonth / Number(settings.meetingMinutesMonthly || 1)) * 100)}%` }} />
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {settings && (
        <section>
          <h2 className="text-xl font-black text-white">Features and limits</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {FLAGS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={Boolean(settings[k])} onClick={() => save({ [k]: !settings[k] })} className={`rounded-full px-4 py-2 text-sm font-bold ${settings[k] ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}>
                {label}: {settings[k] ? "on" : "off"}
              </button>
            ))}
          </div>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const patch: FullSettings = {};
              for (const [k, , max] of SIZES) patch[k] = Math.round(Math.min(max, Math.max(0, Number(fd.get(k)))) * MB);
              patch.meetingMinutesMonthly = Number(fd.get("meetingMinutesMonthly"));
              patch.maxMeetingParticipants = Number(fd.get("maxMeetingParticipants"));
              patch.fileRetentionDays = Number(fd.get("fileRetentionDays"));
              patch.channelMessageRetentionDays = Number(fd.get("channelMessageRetentionDays"));
              void save(patch);
            }}
          >
            {SIZES.map(([k, label, max]) => (
              <label key={k} className="text-xs text-slate-400">
                {label}
                <input name={k} type="number" min={0} max={max} step={1} defaultValue={Math.round(Number(settings[k]) / MB)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
            ))}
            <label className="text-xs text-slate-400">
              Meeting minutes per month
              <input name="meetingMinutesMonthly" type="number" min={0} max={100000} defaultValue={Number(settings.meetingMinutesMonthly)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              People per meeting (max 15)
              <input name="maxMeetingParticipants" type="number" min={2} max={15} defaultValue={Number(settings.maxMeetingParticipants)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              Delete shared files after (days)
              <input name="fileRetentionDays" type="number" min={1} max={365} defaultValue={Number(settings.fileRetentionDays ?? 5)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">
              Delete channel messages after (days)
              <input name="channelMessageRetentionDays" type="number" min={1} max={3650} defaultValue={Number(settings.channelMessageRetentionDays ?? 10)} className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950">Save limits</button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-500">Supabase Free: 1 GB storage, 5 GB downloads and 50 MB per file. LiveKit Build: 5,000 participant-minutes. Keep caps below these.</p>
        </section>
      )}

      <section>
        <h2 className="text-xl font-black text-white">Announcements</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/announcements", { body: { body: draft } });
              setDraft("");
              load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} required maxLength={1000} placeholder="Write an announcement for everyone" aria-label="Announcement" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
          <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950">Publish</button>
        </form>
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-200">
              <span>{n.body}</span>
              <button type="button" onClick={() => api(`/announcements/${n.id}`, { method: "DELETE" }).then(load)} className="text-xs font-bold text-slate-400 hover:text-rose-300">Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
