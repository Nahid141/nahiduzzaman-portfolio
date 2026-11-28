"use client";

import "@livekit/components-styles";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

export type Participant = {
  userId: string;
  username: string;
  fullName: string;
  state: "invited" | "waiting" | "admitted" | "denied" | "removed";
  online: boolean;
  handRaised: boolean;
  shareRequested: boolean;
  canScreenShare: boolean;
};
export type Meeting = {
  id: string;
  title: string;
  hostId: string | null;
  audioOnly: boolean;
  inviteOnly: boolean;
  waitingRoom: boolean;
  locked: boolean;
  screenShare: "host" | "all" | "approved";
  maxParticipants: number;
  status: "scheduled" | "live" | "ended";
  connected: number;
  me: Participant["state"] | null;
  participants: Participant[];
  private?: boolean;
};
/** audioOnly is filled in from the first meeting details, before the call connects. */
type Joined = { meetingId: string; token: string; url: string; audioOnly?: boolean };

type MeetingApi = {
  joined: Joined | null;
  active: Meeting | null;
  /** Meeting id while this person waits for the host to let them in. */
  waiting: string | null;
  notice: string;
  setNotice: (s: string) => void;
  join: (id: string) => Promise<void>;
  leave: () => void;
  /** The Meetings page offers a spot for the full-size call; on every other page it shrinks into a corner. */
  attachSlot: (el: HTMLElement | null) => void;
  height: number;
};

// LiveKit is only downloaded once someone joins a call.
const MeetingStage = dynamic(() => import("../conference/MeetingStage"), { ssr: false });

const Ctx = createContext<MeetingApi | null>(null);

export function useMeetingDock() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMeetingDock outside MeetingDockProvider");
  return c;
}

/**
 * Lives in the /connect layout, so a call stays connected (camera, microphone and screen share included) while the
 * person moves to the dashboard, chat or any other Connect page. It ends only when they leave, the host ends or
 * removes them, they sign out, or they leave Private Connect.
 */
export function MeetingDockProvider({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [active, setActive] = useState<Meeting | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [slot, attachSlot] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const [ended, setEnded] = useState("");

  // A failed refresh keeps the last details: it must never drop a running call.
  const loadActive = useCallback(
    (id: string) =>
      api<Meeting>(`/meetings/${id}`)
        .then((m) => {
          setActive(m);
          setJoined((j) => (j && j.meetingId === m.id && j.audioOnly === undefined ? { ...j, audioOnly: m.audioOnly } : j));
        })
        .catch(() => undefined),
    []
  );

  const join = useCallback(
    async (id: string) => {
      setNotice("");
      try {
        const r = await api<{ state: "admitted" | "waiting"; token?: string; url?: string }>(`/meetings/${id}/join`, { body: {} });
        if (r.state === "waiting") setWaiting(id);
        else {
          setWaiting(null);
          setJoined({ meetingId: id, token: r.token!, url: r.url! });
          void loadActive(id);
        }
      } catch (e) {
        setWaiting(null);
        setNotice(errorMessage(e));
      }
    },
    [loadActive]
  );

  const leave = useCallback(() => {
    setJoined(null);
    setActive(null);
    setWaiting(null);
  }, []);

  useEffect(() => {
    if (!joined && !waiting) return;
    const s = getSocket();
    const onChanged = (p: { id: string }) => {
      if (joined?.meetingId === p.id) void loadActive(p.id);
      if (waiting === p.id) void join(p.id); // admitted (or denied) by the host
    };
    const onGone = (p: { id: string }) => {
      if (joined?.meetingId !== p.id && waiting !== p.id) return;
      leave();
      setNotice("The meeting ended or the host removed you.");
      setEnded("The meeting ended or the host removed you.");
    };
    s.on("meeting:changed", onChanged);
    s.on("meeting:ended", onGone);
    s.on("meeting:removed", onGone);
    return () => {
      s.off("meeting:changed", onChanged);
      s.off("meeting:ended", onGone);
      s.off("meeting:removed", onGone);
    };
  }, [joined, waiting, join, leave, loadActive]);

  useEffect(() => {
    if (!ended) return;
    const t = window.setTimeout(() => setEnded(""), 6000);
    return () => window.clearTimeout(t);
  }, [ended]);

  const value = useMemo(
    () => ({ joined, active, waiting, notice, setNotice, join, leave, attachSlot, height }),
    [joined, active, waiting, notice, join, leave, height]
  );

  return (
    <Ctx.Provider value={value}>
      <div ref={root} className="relative">
        {children}
        {joined && joined.audioOnly !== undefined && (
          <Dock
            root={root}
            slot={slot}
            joined={joined}
            meeting={active}
            onHeight={setHeight}
            onLeft={leave}
            onError={setNotice}
          />
        )}
        {ended && !slot && (
          <p role="status" className="fixed bottom-3 left-3 z-[60] rounded-2xl border border-white/15 bg-slate-950/95 px-4 py-3 text-sm text-slate-100 shadow-2xl">
            {ended}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Where the small call window sits; people move it off whatever it covers. Remembered on this device. */
const CORNERS = {
  "bottom-left": "bottom-3 sm:left-4",
  "bottom-right": "bottom-3 sm:right-4",
  "top-right": "top-24 sm:right-4",
  "top-left": "top-24 sm:left-4",
} as const;
type Corner = keyof typeof CORNERS;
const NEXT: Record<Corner, Corner> = { "bottom-left": "top-left", "top-left": "top-right", "top-right": "bottom-right", "bottom-right": "bottom-left" };
const CORNER = "connect.meet.corner";

function Dock({
  root,
  slot,
  joined,
  meeting,
  onHeight,
  onLeft,
  onError,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  slot: HTMLElement | null;
  joined: Joined;
  meeting: Meeting | null;
  onHeight: (h: number) => void;
  onLeft: () => void;
  onError: (message: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const docked = Boolean(slot);
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      const v = window.localStorage.getItem(CORNER);
      return v && v in CORNERS ? (v as Corner) : "bottom-left";
    } catch {
      return "bottom-left";
    }
  });
  const moveCorner = () =>
    setCorner((c) => {
      const n = NEXT[c];
      try {
        window.localStorage.setItem(CORNER, n);
      } catch {
        /* not remembered */
      }
      return n;
    });

  // Over the page's slot, follow it as the layout moves; otherwise the corner classes apply.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || !slot) return;
    const place = () => {
      const r = slot.getBoundingClientRect();
      const o = root.current?.getBoundingClientRect();
      if (!o) return;
      el.style.left = `${r.left - o.left}px`;
      el.style.top = `${r.top - o.top}px`;
      el.style.width = `${r.width}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(slot);
    ro.observe(document.body);
    window.addEventListener("resize", place);
    const id = window.setInterval(place, 500);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.clearInterval(id);
      el.style.left = el.style.top = el.style.width = "";
    };
  }, [slot, root]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div
      ref={wrap}
      aria-label="Meeting call"
      className={
        docked
          ? "absolute z-30"
          : `fixed inset-x-3 z-50 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur sm:inset-x-auto sm:w-[400px] ${CORNERS[corner]}`
      }
    >
      {!docked && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">In call: {meeting?.title ?? "Meeting"}</p>
          <button type="button" onClick={moveCorner} aria-label="Move the call to another corner" title="Move to another corner" className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10">
            ⇱
          </button>
          <Link href="/connect/conference" className="rounded-lg px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-white/10">
            Open
          </Link>
        </div>
      )}
      <MeetingStage url={joined.url} token={joined.token} audioOnly={joined.audioOnly ?? false} mini={!docked} onLeft={onLeft} onError={onError} />
    </div>
  );
}
