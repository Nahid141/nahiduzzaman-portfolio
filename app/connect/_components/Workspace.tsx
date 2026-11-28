"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type ConnectUser } from "../_lib/api";
import type { ChatMessage } from "../_lib/realtime";
import { useSharedState } from "../_lib/sync";
import { useIncoming, useUnread, type Unread } from "../_lib/unread";
import { useMeetingDock } from "./MeetingDock";
import { usePlayDock } from "./PlayDock";
import { Avatar, BuzzReceiver, CreditNote } from "./Social";
import { ConnectionNotice, Skeleton, useMe } from "./ui";

/* Modules that exist today are links; the rest show which build phase adds them. */
const NAV: { href: string; label: string; phase?: number; adminOnly?: boolean }[] = [
  { href: "/connect/dashboard", label: "Dashboard" },
  { href: "/connect/chat", label: "General chat" },
  { href: "/connect/messages", label: "Direct messages" },
  { href: "/connect/conference", label: "Meetings" },
  { href: "/connect/files", label: "Files" },
  { href: "/connect/tasks", label: "To-do list" },
  { href: "/connect/calendar", label: "Calendar & coffee" },
  { href: "/connect/play", label: "Play together" },
  { href: "/connect/present", label: "Presentation" },
  { href: "/connect/members", label: "Members" },
  { href: "/connect/settings", label: "Settings" },
  { href: "/connect/admin", label: "Admin console", adminOnly: true },
];

export default function Workspace({
  admin = false,
  children,
  aside,
}: {
  admin?: boolean;
  children: (me: ConnectUser) => React.ReactNode;
  aside?: (me: ConnectUser) => React.ReactNode;
}) {
  const { me, error } = useMe({ admin });
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [shaking, setShaking] = useState(false);
  const shake = useCallback(() => {
    setShaking(false);
    window.requestAnimationFrame(() => setShaking(true));
    window.setTimeout(() => setShaking(false), 1300);
  }, []);

  // The Play together player keeps running across Connect pages once someone is signed in.
  const { setSignedIn } = usePlayDock();
  const meeting = useMeetingDock();
  useEffect(() => {
    if (me) setSignedIn(true);
  }, [me, setSignedIn]);

  // Unread messages: a count beside General chat and Direct messages, in the tab title, and a short pop-up notice.
  const unread = useUnread(Boolean(me));
  const badges: Record<string, number> = { "/connect/chat": unread.channels, "/connect/messages": unread.messages };
  const total = unread.channels + unread.messages;
  useEffect(() => {
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Private Connect` : "Private Connect";
  }, [total, pathname]);

  async function signOut() {
    setSignedIn(false);
    meeting.leave();
    await api("/auth/logout", { body: {} }).catch(() => undefined);
    router.replace("/connect");
  }

  if (error) {
    return <p className="mx-auto max-w-xl px-4 py-24 text-center text-rose-200">{error}</p>;
  }

  return (
    <div className={`mx-auto grid max-w-[1500px] gap-4 px-3 py-6 lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:px-6 ${shaking ? "buzz-shake" : ""}`}>
      {me && <BuzzReceiver meId={me.id} onShake={shake} />}
      {me && <MessageNotices meId={me.id} unread={unread} />}
      {/* Left: navigation and profile */}
      <aside className="rounded-3xl border border-white/10 bg-slate-950/85 p-4 backdrop-blur-xl lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between lg:block">
          <div className="flex items-center gap-3">
            {me ? <Avatar user={me} /> : <span className="h-10 w-10 rounded-full bg-white/5" />}
            <div className="min-w-0">
              {me ? (
                <>
                  <p className="truncate font-bold text-white">{me.fullName}</p>
                  <p className="truncate text-xs text-slate-400">
                    @{me.username} · {me.role === "admin" ? "Administrator" : "Member"}
                  </p>
                  {(me.statusEmoji || me.statusText) && (
                    <p className="truncate text-xs text-slate-300">
                      {me.statusEmoji} {me.statusText}
                    </p>
                  )}
                </>
              ) : (
                <Skeleton className="h-8 w-32" />
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-label={total > 0 ? `Menu, ${total} unread ${total === 1 ? "message" : "messages"}` : "Menu"}
            className="relative rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 lg:hidden"
          >
            Menu
            {total > 0 && !navOpen && <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full bg-rose-500" aria-hidden />}
          </button>
        </div>
        <nav aria-label="Private Connect" className={`${navOpen ? "block" : "hidden"} mt-5 space-y-1 lg:block`}>
          {NAV.filter((n) => !n.adminOnly || me?.role === "admin").map((n) => {
            const active = pathname === n.href;
            const count = badges[n.href] ?? 0;
            const live = n.href === "/connect/conference" && meeting.joined;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  active ? "bg-cyan-300/15 text-cyan-200" : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>
                  {n.label}
                  {count > 0 && <span className="sr-only">, {count} unread</span>}
                </span>
                {count > 0 && (
                  <span className="min-w-[1.5rem] rounded-full bg-rose-500 px-1.5 text-center text-xs font-black text-white" aria-hidden>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {live && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-200">In call</span>}
                {n.phase && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-500">soon</span>}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="mt-4 w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm font-semibold text-slate-400 transition hover:border-rose-300/40 hover:text-rose-200"
          >
            Sign out
          </button>
          <CreditNote className="mt-6 border-t border-white/10 pt-4" />
        </nav>
      </aside>

      {/* Center: the current module */}
      <main className="min-w-0 rounded-3xl border border-white/10 bg-slate-950/80 p-5 backdrop-blur-xl md:p-7">
        <ConnectionNotice />
        {me && <FollowHost pathname={pathname} meId={me.id} />}
        {me ? children(me) : <Skeleton className="h-64" />}
      </main>

      {/* Right: context panel */}
      <aside className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4 backdrop-blur-xl lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto">
        {me ? aside?.(me) ?? <DefaultAside /> : <Skeleton className="h-40" />}
      </aside>
    </div>
  );
}

type Notice = { id: string; who: string; where: string; text: string; href: string };

/** A short notice for a message in a chat that is not open; it links straight to that chat and fades after 6 s. */
function MessageNotices({ meId, unread }: { meId: string; unread: Unread }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismiss = useCallback((id: string) => setNotices((n) => n.filter((x) => x.id !== id)), []);
  useIncoming(meId, unread, (m: ChatMessage) => {
    const t = m.target;
    const c = t.kind === "conversation" ? unread.conversation(t.id) : undefined;
    const notice: Notice = {
      id: m.id,
      who: m.author?.fullName ?? "Someone",
      where: t.kind === "channel" ? `# ${unread.channelName(t.id) ?? "channel"}` : c?.isGroup ? (c.title ?? "Group") : "Direct message",
      text: m.body.trim() || (m.attachments?.length ? "Sent a file" : "New message"),
      href: t.kind === "channel" ? `/connect/chat?c=${t.id}` : `/connect/messages?c=${t.id}`,
    };
    setNotices((n) => [...n.filter((x) => x.id !== m.id).slice(-2), notice]);
    window.setTimeout(() => dismiss(m.id), 6000);
  });
  if (!notices.length) return null;
  return (
    <div className="fixed right-3 top-20 z-[60] flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className="flex items-start gap-2 rounded-2xl border border-cyan-300/30 bg-slate-950/95 p-3 shadow-2xl backdrop-blur">
          <Link href={n.href} onClick={() => dismiss(n.id)} className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-cyan-200">
              {n.who} <span className="font-semibold text-slate-400">in {n.where}</span>
            </p>
            <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-100">{n.text}</p>
          </Link>
          <button type="button" onClick={() => dismiss(n.id)} aria-label="Dismiss" className="rounded-lg px-1.5 text-slate-400 hover:bg-white/10">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

const PANEL_HREF: Record<string, string> = {
  dashboard: "/connect/dashboard",
  chat: "/connect/chat",
  files: "/connect/files",
  meetings: "/connect/conference",
  lounge: "/connect/play",
  presentation: "/connect/present",
  watch: "/connect/play",
};

/** Follow Host Mode: offers (never forces) a move to what the administrator is showing. */
function FollowHost({ pathname, meId }: { pathname: string; meId: string }) {
  const { value } = useSharedState<{ enabled: boolean; panel: string; hostId: string | null }>("follow");
  const f = value?.state;
  const href = f ? PANEL_HREF[f.panel] : undefined;
  if (!f?.enabled || !href || href === pathname || f.hostId === meId) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-50">
      <span>The host is showing the {f.panel} panel.</span>
      <Link href={href} className="rounded-lg bg-cyan-300 px-3 py-1 font-black text-slate-950">
        Follow the host
      </Link>
    </div>
  );
}

function DefaultAside() {
  return (
    <div>
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-cyan-300">Live chat</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Open General chat or Direct messages to see live conversations here.
      </p>
    </div>
  );
}

/** Honest placeholder for modules that later phases build. */
export function NotBuiltYet({ title, phase, what }: { title: string; phase: number; what: string }) {
  return (
    <Workspace>
      {() => (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Phase {phase}</p>
          <h1 className="mt-3 text-3xl font-black text-white">{title}</h1>
          <p className="mt-3 max-w-md leading-7 text-slate-400">{what}</p>
          <p className="mt-6 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">
            Not built yet. Nothing on this page is simulated.
          </p>
        </div>
      )}
    </Workspace>
  );
}
