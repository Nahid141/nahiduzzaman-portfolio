"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ENCODED_EMAILS } from "../_data/profile";

/* Once a visitor passes the hold-to-reveal check, every ProtectedEmail on the
   page unlocks. The flag lives only in memory, so each visit asks again. */
let verified = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const markVerified = () => {
  verified = true;
  listeners.forEach((fn) => fn());
};
const useVerified = () => useSyncExternalStore(subscribe, () => verified, () => false);

const decode = (value: string) => atob(value.split("").reverse().join(""));

const HOLD_MS = 900;

/** Press-and-hold check. Requires a real pointer or keyboard interaction that
 *  lasts HOLD_MS, which simple scrapers and form bots do not perform. */
export function RevealButton({ className = "" }: { className?: string }) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    setProgress(0);
  };

  const begin = (e: React.PointerEvent | React.KeyboardEvent) => {
    if (!e.nativeEvent.isTrusted) return;
    start.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start.current) / HOLD_MS, 1);
      setProgress(p);
      if (p >= 1) markVerified();
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      type="button"
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          begin(e);
        }
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative overflow-hidden rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:border-cyan-300 ${className}`}
    >
      <span className="absolute inset-y-0 left-0 bg-cyan-300/35" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{progress > 0 ? "Keep holding…" : "Hold to show email"}</span>
    </button>
  );
}

/** One email address: blurred placeholder until verified, then a mailto link with copy. */
export default function ProtectedEmail({
  index = 0,
  className = "",
  withButton = true,
}: {
  index?: number;
  className?: string;
  withButton?: boolean;
}) {
  const ok = useVerified();
  const [copied, setCopied] = useState(false);

  if (!ok) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-3 ${className}`}>
        <span aria-hidden="true" className="select-none blur-[5px]">
          {index === 0 ? "nxxxx000@xxx.edu" : "nxxxxxxxxxx.0000000@xxx.edu.bd"}
        </span>
        <span className="sr-only">Email hidden from bots.</span>
        {withButton && <RevealButton />}
      </span>
    );
  }

  const email = decode(ENCODED_EMAILS[index].value);
  return (
    <span className={`inline-flex flex-wrap items-center gap-3 motion-safe:animate-[rise_0.4s_ease_both] ${className}`}>
      <a href={`mailto:${email}`} className="break-all transition hover:text-cyan-300">
        {email}
      </a>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(email).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
        }
        className="rounded-lg border border-white/10 px-2 py-0.5 text-xs font-bold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-300"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/** A mailto button that becomes active only after verification. */
export function EmailButton({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const ok = useVerified();
  if (!ok) return <RevealButton className={className} />;
  return (
    <a href={`mailto:${decode(ENCODED_EMAILS[0].value)}`} className={className}>
      {children}
    </a>
  );
}

export const EMAIL_COUNT = ENCODED_EMAILS.length;
