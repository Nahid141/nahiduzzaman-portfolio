"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BuzzButton, CreditNote } from "../_components/Social";
import Workspace from "../_components/Workspace";
import { api, type ConnectUser } from "../_lib/api";
import { formatBytes, type SharedFile } from "../_lib/files";
import { getSocket } from "../_lib/realtime";
import { useSharedState } from "../_lib/sync";

type Stats = { totalMembers: number; byStatus: Record<string, number> };
type Member = { id: string; username: string; fullName: string; online: boolean };
type Announcement = { id: string; body: string; createdAt: string; author: string | null };
type Activity = { id: string; kind: string; payload: Record<string, string>; createdAt: string; actor: string | null };
type Task = { id: string; title: string; visibility: "public" | "admin"; highlight: boolean; dueAt: string | null; doneAt: string | null };
type MeetingSummary = { id: string; title: string; connected: number; maxParticipants: number; private?: boolean };

const ACTIVITY: Record<string, (a: Activity) => string> = {
  "file.shared": (a) => `@${a.actor} shared ${a.payload.name}`,
  "meeting.started": (a) => `@${a.actor} started the meeting “${a.payload.title}”`,
  "lounge.playing": (a) => `Now playing in the lounge: ${a.payload.title}`,
  "presentation.started": (a) => `@${a.actor} started presenting ${a.payload.title}`,
  "task.done": (a) => `@${a.actor} ticked off “${a.payload.title}” 🎉`,
  "watch.started": (a) => `@${a.actor} is playing “${a.payload.title}” for everyone`,
  "game.finished": (a) => (a.payload.winners ? `@${a.payload.winners} won a game of ${a.payload.game}` : `A game of ${a.payload.game} ended in a draw`),
};

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-cyan-300">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-bold text-slate-400 hover:text-white">
            Open
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Dashboard({ me }: { me: ConnectUser }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Announcement[]>([]);
  const [feed, setFeed] = useState<Activity[]>([]);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [todo, setTodo] = useState<Task[]>([]);
  const presentation = useSharedState<{ active: boolean; title: string }>("presentation").value?.state;
  const watch = useSharedState<{ youtubeId: string | null; status: string; title: string }>("watch").value?.state;

  const load = useCallback(() => {
    api<Member[]>("/members").then((m) => {
      setMembers(m);
      setOnline(new Set(m.filter((x) => x.online).map((x) => x.id)));
    }).catch(() => undefined);
    api<Announcement[]>("/announcements").then(setNotes).catch(() => undefined);
    api<{ meetings: MeetingSummary[] }>("/meetings").then((r) => setMeetings(r.meetings)).catch(() => undefined);
    api<SharedFile[]>("/files?limit=5").then(setFiles).catch(() => undefined);
    api<Task[]>("/tasks").then((t) => setTodo(t.filter((x) => !x.doneAt))).catch(() => undefined);
    if (me.role === "admin") {
      api<Stats>("/admin/stats").then(setStats).catch(() => undefined);
      api<Activity[]>("/activity").then(setFeed).catch(() => undefined);
    }
  }, [me.role]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    const presence = (p: { userId: string; online: boolean }) =>
      setOnline((o) => {
        const n = new Set(o);
        if (p.online) n.add(p.userId);
        else n.delete(p.userId);
        return n;
      });
    const reload = () => load();
    s.on("presence:update", presence);
    for (const e of ["announcement:new", "activity:new", "meetings:changed", "file:new", "tasks:changed", "members:changed", "connect"]) s.on(e, reload);
    return () => {
      window.clearTimeout(t);
      s.off("presence:update", presence);
      for (const e of ["announcement:new", "activity:new", "meetings:changed", "file:new", "tasks:changed", "members:changed", "connect"]) s.off(e, reload);
    };
  }, [load]);

  const onlineMembers = members.filter((m) => online.has(m.id));
  const pending = stats?.byStatus.pending ?? 0;

  return (
    <div>
      <h1 className="text-3xl font-black text-white md:text-4xl">Welcome, {me.fullName.split(" ")[0]}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {onlineMembers.length} of {members.length} members online. Everything here updates live.
      </p>
      {me.role === "admin" && (
        <div className="mt-3">
          <BuzzButton everyone label="Buzz everyone" />
        </div>
      )}

      {notes[0] && (
        <div className="mt-6 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-5">
          <p className="text-xs font-bold text-cyan-200">Announcement from @{notes[0].author}</p>
          <p className="mt-1 text-lg font-semibold text-white">{notes[0].body}</p>
        </div>
      )}

      {me.role === "admin" && pending > 0 && (
        <Link href="/connect/admin" className="mt-4 block rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-amber-50">
          {pending} registration{pending === 1 ? "" : "s"} waiting for approval
        </Link>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Meetings" href="/connect/conference">
          {meetings.length === 0 ? (
            <p className="text-sm text-slate-500">No meetings running.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {meetings.slice(0, 4).map((m) => (
                <li key={m.id} className="flex justify-between text-slate-200">
                  <span>{m.title}</span>
                  <span className="text-slate-500">
                    {m.connected}/{m.maxParticipants}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="To-do list" href="/connect/tasks">
          {todo.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing to do right now.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {todo.slice(0, 5).map((t) => (
                <li key={t.id} className={`truncate ${t.visibility === "admin" ? "font-bold text-amber-200" : t.highlight ? "text-cyan-200" : "text-slate-200"}`}>
                  ☐ {t.title}
                  {t.dueAt && <span className="ml-2 text-xs text-slate-500">{new Date(t.dueAt).toLocaleDateString()}</span>}
                </li>
              ))}
              {todo.length > 5 && <li className="text-xs text-slate-500">and {todo.length - 5} more</li>}
            </ul>
          )}
        </Card>
        <Card title="Play together" href="/connect/play">
          <p className="text-sm text-slate-200">{watch?.youtubeId && watch.status !== "stopped" ? `Playing: ${watch.title}` : "Nothing playing. Start music or a video with a YouTube link."}</p>
        </Card>
        <Card title="Presentation" href="/connect/present">
          <p className="text-sm text-slate-200">{presentation?.active ? `Showing ${presentation.title}` : "Nothing being presented."}</p>
        </Card>
        <Card title="Recently shared files" href="/connect/files">
          {files.length === 0 ? (
            <p className="text-sm text-slate-500">No files yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex justify-between gap-3 text-slate-200">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-slate-500">{formatBytes(f.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Online now" href="/connect/members">
          <div className="flex flex-wrap gap-2">
            {onlineMembers.length === 0 && <p className="text-sm text-slate-500">Only you, it seems.</p>}
            {onlineMembers.map((m) => (
              <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />@{m.username}
              </span>
            ))}
          </div>
        </Card>
        {me.role === "admin" && (
          <Card title="Activity (admins only)">
            {feed.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing has happened yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {feed.slice(0, 8).map((a) => (
                  <li key={a.id} className="text-slate-300">
                    {(ACTIVITY[a.kind] ?? (() => a.kind))(a)}
                    <span className="ml-2 text-xs text-slate-600">{new Date(a.createdAt).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
      <div className="mt-8 rounded-3xl border border-amber-300/20 bg-amber-300/[0.05] p-5">
        <CreditNote />
        <a href="/connect/calendar" className="mt-3 inline-block rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white">
          ☕ Request a coffee chat
        </a>
      </div>
    </div>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Dashboard me={me} />}</Workspace>;
}
