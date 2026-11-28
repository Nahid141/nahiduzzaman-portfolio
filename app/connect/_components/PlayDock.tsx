"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../_lib/realtime";
import { syncClock, useSharedState } from "../_lib/sync";
import YouTubeSync from "./YouTubeSync";

export type Watch = {
  youtubeId: string | null;
  title: string;
  status: "stopped" | "playing" | "paused";
  anchorMs: number | null;
  positionMs: number;
  hostId: string | null;
};

/** Identifies one Play together session, so closing it stays closed until something new starts. */
export const sessionKey = (s: Watch | null | undefined) => (s?.youtubeId && s.status !== "stopped" ? `${s.youtubeId}:${s.hostId ?? ""}` : null);

type DockApi = {
  /** The Play together page offers a spot for the big player; elsewhere it shrinks into the corner. */
  attachSlot: (el: HTMLElement | null) => void;
  height: number;
  closedKey: string | null;
  close: (key: string) => void;
  reopen: () => void;
  setSignedIn: (v: boolean) => void;
};

const Ctx = createContext<DockApi | null>(null);
const CLOSED = "connect.play.closed";

export function usePlayDock() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayDock outside PlayDockProvider");
  return c;
}

/**
 * Lives in the /connect layout, so it survives moving between Connect pages: the shared video keeps playing (with
 * sound, unless this person muted it) while they chat, play a game or join a meeting. It stops only when they close
 * it, sign out or leave Private Connect.
 */
export function PlayDockProvider({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [slot, attachSlot] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  const [closedKey, setClosedKey] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage.getItem(CLOSED);
    } catch {
      return null;
    }
  });
  const close = useCallback((key: string) => {
    setClosedKey(key);
    try {
      window.sessionStorage.setItem(CLOSED, key);
    } catch {
      /* private mode: closed for this page view only */
    }
  }, []);
  const reopen = useCallback(() => {
    setClosedKey(null);
    try {
      window.sessionStorage.removeItem(CLOSED);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(() => ({ attachSlot, height, closedKey, close, reopen, setSignedIn }), [height, closedKey, close, reopen]);

  return (
    <Ctx.Provider value={value}>
      <div ref={root} className="relative">
        {children}
        {signedIn && <Dock root={root} slot={slot} closedKey={closedKey} onClose={close} onHeight={setHeight} />}
      </div>
    </Ctx.Provider>
  );
}

type Floating = { id: number; emoji: string; left: number };

/** Where the corner player sits; people move it off whatever it covers. Remembered on this device. */
const CORNERS = {
  "bottom-right": "bottom-3 sm:right-4",
  "bottom-left": "bottom-3 sm:left-4",
  "top-right": "top-24 sm:right-4",
  "top-left": "top-24 sm:left-4",
} as const;
type Corner = keyof typeof CORNERS;
const NEXT: Record<Corner, Corner> = { "bottom-right": "bottom-left", "bottom-left": "top-left", "top-left": "top-right", "top-right": "bottom-right" };
const CORNER = "connect.play.corner";

function Dock({
  root,
  slot,
  closedKey,
  onClose,
  onHeight,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  slot: HTMLElement | null;
  closedKey: string | null;
  onClose: (key: string) => void;
  onHeight: (h: number) => void;
}) {
  const { value } = useSharedState<Watch>("watch");
  const s = value?.state ?? null;
  const key = sessionKey(s);
  const show = Boolean(key && key !== closedKey && s?.youtubeId);
  const wrap = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState<Floating[]>([]);
  const [corner, setCorner] = useState<Corner>(() => {
    try {
      const v = window.localStorage.getItem(CORNER);
      return v && v in CORNERS ? (v as Corner) : "bottom-right";
    } catch {
      return "bottom-right";
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

  useEffect(() => {
    void syncClock().catch(() => undefined);
    const sock = getSocket();
    let n = 0;
    const onReaction = (r: { emoji: string }) => {
      const id = ++n;
      setFloating((f) => [...f.slice(-30), { id, emoji: r.emoji, left: 10 + Math.random() * 80 }]);
      window.setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 2600);
    };
    sock.on("watch:reaction", onReaction);
    return () => void sock.off("watch:reaction", onReaction);
  }, []);

  // Over the page's slot, follow it as the layout moves; otherwise the corner classes apply.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || !slot || !show) return;
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
  }, [slot, show, root]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [show, onHeight]);

  if (!show || !s?.youtubeId || !key) return null;
  const docked = Boolean(slot);

  return (
    <div
      ref={wrap}
      className={
        docked
          ? "absolute z-30"
          : `fixed inset-x-3 z-40 rounded-2xl border border-white/15 bg-slate-950/95 p-2 shadow-2xl backdrop-blur sm:inset-x-auto sm:w-[380px] ${CORNERS[corner]}`
      }
      aria-label="Play together player"
    >
      {!docked && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-400" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-200">
            {s.status === "paused" ? "Paused" : "Playing"}: {s.title}
          </p>
          <button type="button" onClick={moveCorner} aria-label="Move the player to another corner" title="Move to another corner" className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10">
            ⇱
          </button>
          <Link href="/connect/play" className="rounded-lg px-2 py-1 text-xs font-bold text-cyan-200 hover:bg-white/10">
            Open
          </Link>
          <button type="button" onClick={() => onClose(key)} aria-label="Close the player" className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-white/10">
            ✕
          </button>
        </div>
      )}
      <div className="relative">
        <YouTubeSync videoId={s.youtubeId} title={s.title} state={s} compact={!docked} />
        <div className="pointer-events-none absolute inset-x-0 bottom-12 top-0 overflow-hidden" aria-hidden>
          {floating.map((f) => (
            <span key={f.id} className={`watch-float absolute bottom-0 ${docked ? "text-3xl" : "text-xl"}`} style={{ left: `${f.left}%` }}>
              {f.emoji}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
