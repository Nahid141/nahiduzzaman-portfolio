"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Entry = { id: string; startsAt: string; durationMin: number; status: string; kind: "meeting" | "coffee" | null; topic: string; mine: boolean; requestedBy?: string };
type Request = {
  id: string;
  kind: "meeting" | "coffee";
  topic: string;
  message: string;
  startsAt: string;
  durationMin: number;
  status: "pending" | "approved" | "declined" | "cancelled";
  decisionNote: string;
  requestedById: string;
  requestedBy: string;
  requesterName: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-300/15 text-amber-100",
  approved: "bg-emerald-300/15 text-emerald-100",
  declined: "bg-rose-300/15 text-rose-100",
  cancelled: "bg-white/5 text-slate-400",
};

function Calendar({ me }: { me: ConnectUser }) {
  const admin = me.role === "admin";
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [picked, setPicked] = useState<string>("");
  const [error, setError] = useState("");

  // Weeks start on Monday; show six rows so the grid height never jumps.
  const days = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }, [month]);

  const load = useCallback(() => {
    const from = days[0]!.toISOString();
    const to = new Date(days[41]!.getTime() + 86_400_000).toISOString();
    api<Entry[]>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(setEntries).catch((e) => setError(errorMessage(e)));
    api<Request[]>("/meeting-requests").then(setRequests).catch(() => undefined);
  }, [days]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    s.on("meeting-requests:changed", load);
    return () => {
      window.clearTimeout(t);
      s.off("meeting-requests:changed", load);
    };
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = dayKey(new Date(e.startsAt));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [entries]);

  const today = dayKey(new Date());
  const act = (p: Promise<unknown>) => p.then(load).catch((e) => setError(errorMessage(e)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Calendar &amp; coffee</h1>
        <p className="mt-2 text-sm text-slate-400">
          {admin
            ? "Members ask for a meeting or a coffee at a time they pick. Approving one adds it to your to-do list, highlighted and visible only to you."
            : "Ask Nahiduzzaman for a meeting or a coffee: pick a free time on the calendar. Busy times are shown without details."}
        </p>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-slate-200" aria-label="Previous month">
            ‹
          </button>
          <h2 className="font-black text-white">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold text-slate-200" aria-label="Next month">
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            const past = k < today;
            return (
              <button
                key={k}
                type="button"
                disabled={past}
                onClick={() => setPicked(k)}
                aria-pressed={picked === k}
                aria-label={`${d.toDateString()}${list.length ? `, ${list.length} booked` : ""}`}
                className={`min-h-16 rounded-xl border p-1 text-left align-top transition sm:min-h-20 ${picked === k ? "border-cyan-300 bg-cyan-300/10" : "border-white/5 hover:border-white/20"} ${inMonth ? "" : "opacity-40"} ${past ? "cursor-not-allowed opacity-30" : ""}`}
              >
                <span className={`text-xs font-bold ${k === today ? "rounded-full bg-cyan-300 px-1.5 text-slate-950" : "text-slate-300"}`}>{d.getDate()}</span>
                <span className="mt-1 block space-y-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className={`block truncate rounded px-1 text-[10px] leading-4 ${e.status === "pending" ? "bg-amber-300/20 text-amber-100" : e.mine || admin ? "bg-emerald-300/20 text-emerald-100" : "bg-white/10 text-slate-300"}`}>
                      {time(e.startsAt)} {e.kind === "coffee" ? "☕" : ""}{admin || e.mine ? e.topic : "Busy"}
                    </span>
                  ))}
                  {list.length > 3 && <span className="block text-[10px] text-slate-500">+{list.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <RequestForm key={picked} day={picked} onDone={load} setError={setError} />
      {error && <p className="text-sm text-rose-200">{error}</p>}

      <section>
        <h2 className="text-sm font-black text-cyan-300">{admin ? "Requests" : "Your requests"}</h2>
        <ul className="mt-2 space-y-2">
          {requests.length === 0 && <li className="text-sm text-slate-500">No requests yet.</li>}
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-white">
                  {r.kind === "coffee" ? "☕ Coffee" : "📅 Meeting"}: {r.topic}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {when(r.startsAt)} · {r.durationMin} min{admin ? ` · from ${r.requesterName} (@${r.requestedBy})` : ""}
              </p>
              {r.message && <p className="mt-1 text-slate-300">{r.message}</p>}
              {r.decisionNote && <p className="mt-1 text-xs text-slate-400">Note: {r.decisionNote}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {admin && r.status === "pending" && <Decide id={r.id} onDone={load} setError={setError} />}
                {(r.status === "pending" || r.status === "approved") && (r.requestedById === me.id || admin) && (
                  <button type="button" onClick={() => void act(api(`/meeting-requests/${r.id}/cancel`, { body: {} }))} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-300/40">
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Decide({ id, onDone, setError }: { id: string; onDone: () => void; setError: (s: string) => void }) {
  const [note, setNote] = useState("");
  const decide = (decision: "approve" | "decline") =>
    api(`/meeting-requests/${id}/decide`, { body: { decision, note } })
      .then(onDone)
      .catch((e) => setError(errorMessage(e)));
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional)" aria-label="Decision note" className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white" />
      <button type="button" onClick={() => void decide("approve")} className="rounded-xl bg-emerald-300 px-3 py-1.5 text-xs font-black text-slate-950">Approve</button>
      <button type="button" onClick={() => void decide("decline")} className="rounded-xl border border-rose-300/40 px-3 py-1.5 text-xs font-black text-rose-200">Decline</button>
    </span>
  );
}

function RequestForm({ day, onDone, setError }: { day: string; onDone: () => void; setError: (s: string) => void }) {
  const [kind, setKind] = useState<"meeting" | "coffee">("coffee");
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(day);
  const [clock, setClock] = useState("15:00");
  const [duration, setDuration] = useState(30);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const chosenDate = date;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(false);
        const startsAt = new Date(`${chosenDate}T${clock}`).toISOString();
        api("/meeting-requests", { body: { kind, topic, message, startsAt, durationMin: duration } })
          .then(() => {
            setSent(true);
            setTopic("");
            setMessage("");
            onDone();
          })
          .catch((err) => setError(errorMessage(err)));
      }}
      className="grid gap-3 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5 sm:grid-cols-2"
    >
      <h2 className="font-black text-white sm:col-span-2">Request a time</h2>
      <div className="flex gap-2 sm:col-span-2" role="group" aria-label="Kind">
        {(["coffee", "meeting"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 text-sm font-black ${kind === k ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}>
            {k === "coffee" ? "☕ Coffee" : "📅 Meeting"}
          </button>
        ))}
      </div>
      <label className="text-sm text-slate-300 sm:col-span-2">
        Topic
        <input value={topic} onChange={(e) => setTopic(e.target.value)} required maxLength={200} placeholder={kind === "coffee" ? "Catch up over coffee" : "What would you like to discuss?"} className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
      </label>
      <label className="text-sm text-slate-300">
        Date
        <input type="date" value={chosenDate} onChange={(e) => setDate(e.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm text-slate-300">
          Time
          <input type="time" value={clock} onChange={(e) => setClock(e.target.value)} required className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
        </label>
        <label className="text-sm text-slate-300">
          Length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white">
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm text-slate-300 sm:col-span-2">
        Message (optional)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={2} className="mt-1 block w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="rounded-xl bg-cyan-300 px-5 py-2 font-black text-slate-950">Send request</button>
        {sent && <span className="text-sm text-emerald-200">Sent. You will be notified when it is approved.</span>}
      </div>
    </form>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Calendar me={me} />}</Workspace>;
}
