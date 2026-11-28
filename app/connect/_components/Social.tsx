"use client";

import { useEffect, useState } from "react";
import { api, CONNECT_API, errorMessage } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

/* ----------------------------------- Avatar ----------------------------------- */

const SIZES = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" };

/** Profile photo served by the backend (members only, versioned URL), or the initial as a fallback. */
export function Avatar({ user, size = "md" }: { user: { id: string; fullName: string; avatarKey?: string | null }; size?: keyof typeof SIZES }) {
  const [broken, setBroken] = useState<string | null>(null);
  const key = user.avatarKey ?? null;
  if (key && broken !== key) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a private, cookie-authenticated image on another origin
      <img
        src={`${CONNECT_API}/api/v1/users/${user.id}/avatar?v=${key}`}
        alt=""
        onError={() => setBroken(key)}
        className={`${SIZES[size]} shrink-0 rounded-full border border-white/10 object-cover`}
      />
    );
  }
  return (
    <span aria-hidden className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-cyan-300/15 font-black text-cyan-200`}>
      {user.fullName.slice(0, 1).toUpperCase() || "·"}
    </span>
  );
}

/* ------------------------------------ Buzz ------------------------------------ */

type BuzzPayload = { from: { id: string; username: string; fullName: string }; everyone: boolean; at: string };

const BUZZ_MUTED = "connect.buzz.muted";
export const buzzMuted = () => {
  try {
    return localStorage.getItem(BUZZ_MUTED) === "1";
  } catch {
    return false;
  }
};
export const setBuzzMuted = (on: boolean) => {
  try {
    localStorage.setItem(BUZZ_MUTED, on ? "1" : "0");
  } catch {
    /* private mode */
  }
};

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 660, 990].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "triangle";
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.16);
    });
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    /* audio unavailable */
  }
}

export async function sendBuzz(target: { userId: string } | { everyone: true }) {
  await api("/buzz", { body: target });
}

/**
 * Receives buzzes: vibrates the phone where the browser supports it (Android; iPhones do not expose vibration to web
 * pages), plays a short chime, shakes the workspace and shows who buzzed. "Mute buzz alerts" in Settings keeps only
 * the notice.
 */
export function BuzzReceiver({ meId, onShake }: { meId: string; onShake: () => void }) {
  const [notice, setNotice] = useState<BuzzPayload | null>(null);
  const [reply, setReply] = useState("");
  useEffect(() => {
    const sock = getSocket();
    let hide = 0;
    const onBuzz = (p: BuzzPayload) => {
      if (p.from.id === meId) return;
      if (!buzzMuted()) {
        navigator.vibrate?.([220, 90, 220, 90, 420]);
        chime();
        onShake();
      }
      setReply("");
      setNotice(p);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setNotice(null), 8000);
    };
    sock.on("buzz", onBuzz);
    return () => {
      sock.off("buzz", onBuzz);
      window.clearTimeout(hide);
    };
  }, [meId, onShake]);
  if (!notice) return null;
  return (
    <div role="alert" className="fixed right-4 top-24 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-amber-300/40 bg-slate-950/95 p-4 shadow-2xl shadow-amber-500/20 backdrop-blur">
      <p className="text-lg font-black text-amber-200">📳 Buzz!</p>
      <p className="mt-1 text-sm text-slate-200">
        {notice.from.fullName} (@{notice.from.username}) {notice.everyone ? "buzzed everyone" : "buzzed you"}.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() =>
            sendBuzz({ userId: notice.from.id })
              .then(() => setReply("Buzzed back."))
              .catch((e) => setReply(errorMessage(e)))
          }
          className="rounded-xl bg-amber-300 px-3 py-1.5 text-sm font-black text-slate-950"
        >
          Buzz back
        </button>
        <button type="button" onClick={() => setNotice(null)} className="rounded-xl border border-white/15 px-3 py-1.5 text-sm font-bold text-slate-300">
          Dismiss
        </button>
      </div>
      {reply && <p className="mt-2 text-xs text-slate-400">{reply}</p>}
    </div>
  );
}

/** A buzz button with its own short feedback line. */
export function BuzzButton({ userId, label = "Buzz", everyone = false }: { userId?: string; label?: string; everyone?: boolean }) {
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          sendBuzz(everyone ? { everyone: true } : { userId: userId! })
            .then(() => setState("sent"))
            .catch((e) => setState(errorMessage(e)))
            .finally(() => window.setTimeout(() => setState("idle"), 3000))
        }
        className="rounded-xl border border-amber-300/40 px-3 py-1.5 text-xs font-black text-amber-200 transition hover:bg-amber-300/10"
        title="Vibrate their phone and play an alert"
      >
        📳 {label}
      </button>
      {state !== "idle" && <span className="text-xs text-slate-400">{state === "sent" ? "Sent" : state}</span>}
    </span>
  );
}

/* ---------------------------------- Confetti ---------------------------------- */

const COLORS = ["#67e8f9", "#fcd34d", "#f9a8d4", "#86efac", "#c4b5fd"];

/** A small burst from the given point; skipped when the user prefers reduced motion (CSS hides it). */
export function confettiAt(x: number, y: number) {
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:70`;
  for (let i = 0; i < 18; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    bit.style.cssText = `position:absolute;width:7px;height:11px;border-radius:2px;background:${COLORS[i % COLORS.length]};--dx:${Math.round(Math.random() * 180 - 90)}px;animation-delay:${Math.random() * 120}ms`;
    root.appendChild(bit);
  }
  document.body.appendChild(root);
  window.setTimeout(() => root.remove(), 1600);
}

/* ------------------------------------ Credit ------------------------------------ */

export function CreditNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-5 text-slate-400 ${className}`}>
      Designed and developed by <span className="font-bold text-cyan-200">Nahiduzzaman</span>. You are all invited to take a cup of coffee with me,
      upon availability ☕
    </p>
  );
}
