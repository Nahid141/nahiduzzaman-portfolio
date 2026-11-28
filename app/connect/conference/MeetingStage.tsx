"use client";

import { LiveKitRoom, RoomAudioRenderer, useChat, useDataChannel, useLocalParticipant, useRoomContext, VideoConference } from "@livekit/components-react";
import { ScreenSharePresets } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type FullMode = "off" | "native" | "window";

const EMOJI = ["👍", "👏", "😂", "🎉", "❤️", "🙌"];
const pill = "rounded-xl bg-slate-950/75 px-3 py-1.5 text-sm font-bold text-white backdrop-blur transition hover:bg-slate-800";

/**
 * The call area: LiveKit's grid and controls, plus our own full-screen button and chat popup. Both live inside the
 * element that goes full screen, so they keep working there. LiveKit's built-in chat panel is hidden (CSS), because it
 * overflowed the frame; ours uses the same LiveKit chat channel. In `mini` mode (the small window shown on other Connect
 * pages) the same room stays connected; only the frame shrinks and compact controls replace LiveKit's bar.
 */
export default function MeetingStage({
  url,
  token,
  audioOnly,
  mini = false,
  onLeft,
  onError,
}: {
  url: string;
  token: string;
  audioOnly: boolean;
  mini?: boolean;
  onLeft: () => void;
  onError: (message: string) => void;
}) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const attachStage = useCallback((el: HTMLDivElement | null) => {
    stage.current = el;
    setStageEl(el);
  }, []);
  const [full, setFull] = useState<FullMode>("off");

  useEffect(() => {
    const onChange = () => setFull((f) => (document.fullscreenElement ? "native" : f === "native" ? "off" : f));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull((f) => (f === "window" ? "off" : f));
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Moving to another page while in full screen: leave full screen, the call carries on in the small window.
  const [wasMini, setWasMini] = useState(mini);
  if (mini !== wasMini) {
    setWasMini(mini);
    if (mini && full === "window") setFull("off");
  }
  useEffect(() => {
    if (mini && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [mini]);

  // While the in-window fallback covers the page, stop the page behind it from scrolling.
  useEffect(() => {
    if (full !== "window") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => void (document.body.style.overflow = prev);
  }, [full]);

  const toggleFull = useCallback(async () => {
    if (full === "native") return void (await document.exitFullscreen().catch(() => undefined));
    if (full === "window") return setFull("off");
    const el = stage.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" });
        return;
      }
      if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        return;
      }
    } catch {
      /* not allowed here: fall back below */
    }
    // iPhone Safari only lets <video> elements go full screen: cover the whole browser window instead.
    setFull("window");
  }, [full]);

  const frame = mini
    ? "connect-stage-mini relative h-[190px] overflow-hidden rounded-xl sm:h-[225px]"
    : full === "off"
      ? "relative h-[70vh] min-h-[420px] overflow-hidden rounded-3xl border border-white/10"
      : full === "native"
        ? "relative h-screen w-screen overflow-hidden bg-black"
        : "fixed inset-0 z-[200] h-[100dvh] w-screen overflow-hidden bg-black";

  return (
    <div ref={attachStage} className={`connect-stage ${frame}`} data-lk-theme="default">
      <LiveKitRoom
        serverUrl={url}
        token={token}
        connect
        audio
        video={!audioOnly}
        options={{
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          publishDefaults: {
            // Screen shares: full 1080p at 15 fps with a higher bitrate for sharp text; viewers on weak connections or
            // small tiles get the 720p layer automatically.
            screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 15, priority: "high" },
            screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
          },
        }}
        onDisconnected={onLeft}
        onError={(e) => onError(e.message)}
        style={{ height: "100%" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <div className={`absolute left-3 top-3 z-20 rounded-xl bg-slate-950/70 px-2 py-1 ${mini ? "hidden" : ""}`}>
          <Reactions />
        </div>
        {mini && <MiniControls />}
        <div className={`absolute right-3 top-3 z-20 flex gap-2 ${mini ? "hidden" : ""}`}>
          <MeetingChat stage={mini ? null : stageEl} />
          <button type="button" onClick={() => void toggleFull()} className={pill} aria-pressed={full !== "off"} aria-label={full === "off" ? "Full screen" : "Exit full screen"}>
            {full === "off" ? "⛶" : "✕"}
            <span className="hidden sm:inline">{full === "off" ? " Full screen" : " Exit full screen"}</span>
          </button>
        </div>
      </LiveKitRoom>
    </div>
  );
}

/** Microphone, camera, screen share and leave for the small call window. */
function MiniControls() {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const b = "rounded-lg px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur transition";
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Call controls">
      <button
        type="button"
        aria-pressed={!isMicrophoneEnabled}
        onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        className={`${b} ${isMicrophoneEnabled ? "bg-slate-950/75 hover:bg-slate-800" : "bg-rose-500/90"}`}
      >
        {isMicrophoneEnabled ? "Mute mic" : "Unmute mic"}
      </button>
      <button
        type="button"
        aria-pressed={!isCameraEnabled}
        onClick={() => void localParticipant.setCameraEnabled(!isCameraEnabled)}
        className={`${b} ${isCameraEnabled ? "bg-slate-950/75 hover:bg-slate-800" : "bg-slate-700/90"}`}
      >
        {isCameraEnabled ? "Stop camera" : "Start camera"}
      </button>
      {isScreenShareEnabled && (
        <button type="button" onClick={() => void localParticipant.setScreenShareEnabled(false)} className={`${b} bg-amber-400/90 text-slate-950`}>
          Stop sharing
        </button>
      )}
      <button type="button" onClick={() => void room.disconnect()} className={`${b} bg-rose-600 hover:bg-rose-500`}>
        Leave
      </button>
    </div>
  );
}

/** Meeting reactions over LiveKit's data channel; they float for a few seconds and are not stored. */
function Reactions() {
  const [floating, setFloating] = useState<{ id: number; emoji: string; from: string }[]>([]);
  const show = useCallback((emoji: string, from: string) => {
    const id = Math.random();
    setFloating((f) => [...f, { id, emoji, from }]);
    window.setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 3500);
  }, []);
  const { send } = useDataChannel("reactions", (msg) => {
    const emoji = new TextDecoder().decode(msg.payload);
    if (EMOJI.includes(emoji)) show(emoji, msg.from?.name ?? "");
  });
  return (
    <>
      <div className="pointer-events-none absolute bottom-24 right-6 flex flex-col items-end gap-1">
        {floating.map((f) => (
          <span key={f.id} className="animate-bounce rounded-full bg-slate-900/80 px-3 py-1 text-2xl">
            {f.emoji} <span className="text-xs text-slate-300">{f.from}</span>
          </span>
        ))}
      </div>
      <div className="flex gap-1" role="group" aria-label="Send a reaction">
        {EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            className="rounded-lg px-1 py-1 text-base hover:bg-white/10 sm:px-2 sm:text-lg"
            aria-label={`React ${e}`}
            onClick={() => {
              void send(new TextEncoder().encode(e), { reliable: true });
              show(e, "You");
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

/** Chat in a popup over the call, with an unread count and a short preview of new messages while it is closed. */
function MeetingChat({ stage }: { stage: HTMLElement | null }) {
  const { chatMessages, send, isSending } = useChat();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [draft, setDraft] = useState("");
  const [expired, setExpired] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const unread = open ? 0 : Math.max(0, chatMessages.length - seen);

  // A preview of the newest message from someone else, shown for 5 seconds while the chat is closed.
  const last = chatMessages.at(-1);
  const lastKey = last ? `${last.timestamp}-${last.id ?? ""}` : "";
  const preview =
    !open && last && !last.from?.isLocal && unread > 0 && expired !== lastKey
      ? { from: last.from?.name || last.from?.identity || "Someone", text: last.message }
      : null;
  const showing = preview !== null;
  useEffect(() => {
    if (!showing) return;
    const t = window.setTimeout(() => setExpired(lastKey), 5000);
    return () => window.clearTimeout(t);
  }, [showing, lastKey]);

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, chatMessages.length]);
  useEffect(() => {
    if (!open) return;
    // On a phone the call area can sit partly below the fold: bring it into view with the popup.
    stage?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    input.current?.focus({ preventScroll: true });
  }, [open, stage]);

  const toggle = (next: boolean) => {
    setOpen(next);
    setSeen(chatMessages.length);
  };

  return (
    <>
      <button type="button" onClick={() => toggle(!open)} aria-expanded={open} aria-label="Chat" className={`${pill} relative`}>
        💬<span className="hidden sm:inline"> Chat</span>
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 px-1.5 text-[11px] font-black">{unread}</span>}
      </button>

      {/* Popups render into the call area itself: sized against it, and visible in full screen. */}
      {stage &&
        preview &&
        !open &&
        createPortal(
          <button
            type="button"
            onClick={() => toggle(true)}
            className="absolute right-3 top-14 z-40 w-72 max-w-[calc(100%-1.5rem)] rounded-2xl border border-cyan-300/30 bg-slate-950/95 p-3 text-left shadow-2xl"
          >
            <p className="text-xs font-black text-cyan-200">{preview.from}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-100">{preview.text}</p>
          </button>,
          stage
        )}

      {stage &&
        open &&
        createPortal(
          <div
            role="dialog"
            aria-label="Meeting chat"
            className="absolute inset-x-2 bottom-20 top-14 z-40 flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl sm:inset-x-auto sm:right-3 sm:w-[22rem]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <p className="font-black text-white">Chat</p>
              <button type="button" onClick={() => toggle(false)} aria-label="Close chat" className="rounded-lg px-2 text-lg text-slate-300 hover:bg-white/10">
                ✕
              </button>
            </div>
            <ol ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
              {chatMessages.length === 0 && <li className="text-slate-500">No messages yet. Messages here are not saved after the meeting.</li>}
              {chatMessages.map((m) => (
                <li key={`${m.timestamp}-${m.id ?? ""}`} className={m.from?.isLocal ? "text-right" : ""}>
                  <span className="block text-[11px] text-slate-500">{m.from?.isLocal ? "You" : m.from?.name || m.from?.identity}</span>
                  <span className={`inline-block max-w-[85%] break-words rounded-2xl px-3 py-1.5 ${m.from?.isLocal ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-100"}`}>
                    {m.message}
                  </span>
                </li>
              ))}
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim();
                if (!text) return;
                setDraft("");
                void send(text);
              }}
              className="flex gap-2 border-t border-white/10 p-2"
            >
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                placeholder="Message everyone"
                aria-label="Chat message"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
              />
              <button type="submit" disabled={isSending || !draft.trim()} className="shrink-0 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">
                Send
              </button>
            </form>
          </div>,
          stage
        )}
    </>
  );
}
