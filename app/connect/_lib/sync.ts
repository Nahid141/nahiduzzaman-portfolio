"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { getSocket } from "./realtime";

/* ------------------------------ Server clock ------------------------------ */

let offsetMs = 0;
let sampled = false;

/**
 * Estimates (server clock - local clock) NTP-style: several round trips, keep the one with the
 * smallest round-trip time and assume the server read its clock halfway through it.
 */
export async function syncClock(samples = 5) {
  let best = { rtt: Infinity, offset: 0 };
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    const wall0 = Date.now();
    const { now } = await api<{ now: number }>("/time");
    const rtt = performance.now() - t0;
    if (rtt < best.rtt) best = { rtt, offset: now - (wall0 + rtt / 2) };
  }
  offsetMs = best.offset;
  sampled = true;
  return { offsetMs, rttMs: best.rtt };
}

export const serverNow = () => Date.now() + offsetMs;
export const clockSynced = () => sampled;

/* ------------------------------ Shared state ------------------------------ */

export type Versioned<T> = { key: string; version: number; state: T; updatedAt: string | null };

/**
 * Server-authoritative state for one key. The snapshot is refetched on every (re)connect, so a client
 * that missed events while offline recovers; older versions arriving late are ignored.
 */
export function useSharedState<T>(key: "lounge" | "presentation" | "follow", fetchPath = "/state") {
  const [value, setValue] = useState<Versioned<T> | null>(null);
  const latest = useRef(0);

  const accept = useCallback((v: Versioned<T>) => {
    if (v.version < latest.current) return;
    latest.current = v.version;
    setValue(v);
  }, []);

  const refresh = useCallback(async () => {
    const snap = await api<Record<string, unknown>>(fetchPath);
    const v = (fetchPath === "/state" ? snap[key] : snap.state) as Versioned<T>;
    latest.current = 0;
    accept(v);
  }, [accept, fetchPath, key]);

  useEffect(() => {
    const s = getSocket();
    const onUpdate = (v: Versioned<T>) => v.key === key && accept(v);
    const onConnect = () => void refresh().catch(() => undefined);
    s.on("state:update", onUpdate);
    s.on("connect", onConnect);
    void refresh().catch(() => undefined);
    return () => {
      s.off("state:update", onUpdate);
      s.off("connect", onConnect);
    };
  }, [accept, key, refresh]);

  /** Sends a versioned command; on a conflict, adopts the server's state and rethrows. */
  const command = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      try {
        const res = await api<{ state: Versioned<T> }>(path, { body: { ...body, expectedVersion: latest.current } });
        accept(res.state);
        return res.state;
      } catch (err) {
        if (err instanceof ApiError && err.code === "version_conflict" && err.data?.current) accept(err.data.current as Versioned<T>);
        throw err;
      }
    },
    [accept]
  );

  return { value, refresh, command, accept };
}

/** Position (ms) a synchronised player should be at right now. */
export function targetPosition(s: { status: string; anchorMs: number | null; positionMs: number }) {
  return s.status === "playing" && s.anchorMs !== null ? serverNow() - s.anchorMs : s.positionMs;
}

/**
 * Keeps a media element on the shared timeline: hard seek when far off, gentle rate nudges when
 * close, so listeners converge without audible jumps. Returns the last measured drift.
 */
export function useMediaSync(
  el: HTMLMediaElement | null,
  s: { status: string; anchorMs: number | null; positionMs: number } | null,
  enabled: boolean
) {
  const [driftMs, setDriftMs] = useState<number | null>(null);
  useEffect(() => {
    if (!el || !s || !enabled) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const target = targetPosition(s);
      if (s.status !== "playing") {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime * 1000 - s.positionMs) > 250) el.currentTime = s.positionMs / 1000;
        el.playbackRate = 1;
        setDriftMs(null);
        return;
      }
      if (target < 0) {
        // Scheduled start in the future: wait at 0, buffered.
        if (!el.paused) el.pause();
        el.currentTime = 0;
        return;
      }
      const drift = el.currentTime * 1000 - target;
      setDriftMs(Math.round(drift));
      if (Math.abs(drift) > 1000) {
        el.currentTime = target / 1000;
        el.playbackRate = 1;
      } else if (Math.abs(drift) > 40) {
        el.playbackRate = drift > 0 ? 0.97 : 1.03;
      } else {
        el.playbackRate = 1;
      }
      if (el.paused) void el.play().catch(() => undefined);
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [el, s, enabled]);
  return driftMs;
}
