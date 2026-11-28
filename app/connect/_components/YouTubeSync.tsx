"use client";

import { useEffect, useRef, useState } from "react";
import { targetPosition } from "../_lib/sync";

/* Minimal typing of the YouTube IFrame Player API (https://developers.google.com/youtube/iframe_api_reference). */
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(v: number): void;
  loadVideoById(id: string): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiPromise;
}

export type SyncedState = { status: string; anchorMs: number | null; positionMs: number };

/**
 * A visible YouTube player (as YouTube's terms require) kept on the shared server timeline. It starts muted so the
 * browser lets it autoplay; "Join with sound" unmutes it with a click. Seeking is done by the controller through the
 * server, so viewers' own controls are hidden.
 */
export default function YouTubeSync({
  videoId,
  state,
  onDuration,
  onEnded,
  title,
}: {
  videoId: string;
  state: SyncedState;
  onDuration?: (ms: number) => void;
  onEnded?: () => void;
  title: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [driftMs, setDriftMs] = useState<number | null>(null);
  const stateRef = useRef(state);
  const cb = useRef({ onDuration, onEnded });
  const reportedFor = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
    cb.current = { onDuration, onEnded };
  });

  // Create the player once; later videos are loaded into the same player.
  useEffect(() => {
    let cancelled = false;
    let created: YTPlayer | null = null;
    void loadYouTubeApi().then((YT) => {
      if (cancelled || !host.current) return;
      const mount = document.createElement("div");
      host.current.appendChild(mount);
      created = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 },
        events: {
          onReady: () => {
            created!.mute();
            player.current = created;
            setReady(true);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.ENDED) cb.current.onEnded?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      created?.destroy();
      player.current = null;
    };
    // The player is created once per mount; video changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    p.loadVideoById(videoId);
    reportedFor.current = null;
  }, [videoId, ready]);

  // Keep the player on the server timeline.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const p = player.current;
      if (!p) return;
      const s = stateRef.current;
      const duration = p.getDuration();
      if (duration > 0 && reportedFor.current !== videoId) {
        reportedFor.current = videoId;
        cb.current.onDuration?.(Math.round(duration * 1000));
      }
      const target = targetPosition(s);
      if (s.status !== "playing") {
        if (p.getPlayerState() === 1) p.pauseVideo();
        if (Math.abs(p.getCurrentTime() * 1000 - s.positionMs) > 1500) p.seekTo(s.positionMs / 1000, true);
        setDriftMs(null);
        return;
      }
      if (target < 0) return; // scheduled start a moment from now
      const drift = p.getCurrentTime() * 1000 - target;
      setDriftMs(Math.round(drift));
      if (Math.abs(drift) > 1500) p.seekTo(target / 1000, true);
      if (p.getPlayerState() !== 1 && p.getPlayerState() !== 3) p.playVideo();
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ready, videoId]);

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
        <div ref={host} className="absolute inset-0 [&>div]:h-full [&>div]:w-full [&_iframe]:h-full [&_iframe]:w-full" aria-label={`YouTube video: ${title}`} />
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-slate-400">Loading the YouTube player…</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {ready && muted && (
          <button
            type="button"
            onClick={() => {
              player.current?.unMute();
              player.current?.setVolume(80);
              player.current?.playVideo();
              setMuted(false);
            }}
            className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
          >
            Join with sound
          </button>
        )}
        {ready && !muted && (
          <button
            type="button"
            onClick={() => {
              player.current?.mute();
              setMuted(true);
            }}
            className="rounded-xl border border-white/15 px-3 py-2 text-sm font-bold text-slate-200 hover:border-cyan-300"
          >
            Mute for me
          </button>
        )}
        <span>{driftMs === null ? "In sync with everyone" : `In sync (±${Math.abs(driftMs)} ms)`}. Playback is controlled by the host for everyone.</span>
      </div>
    </div>
  );
}
