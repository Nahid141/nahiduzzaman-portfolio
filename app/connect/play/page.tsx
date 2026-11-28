"use client";

import { useEffect, useState } from "react";
import { sessionKey, usePlayDock, type Watch } from "../_components/PlayDock";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { targetPosition, useSharedState } from "../_lib/sync";
import GamesLobby from "./_games/Lobby";

const REACTIONS = ["❤️", "😂", "😮", "👏", "🔥", "🎉", "😢", "🍿"];
const btn = "rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-40";

function PlayTogether({ me }: { me: ConnectUser }) {
  const { value, command } = useSharedState<Watch>("watch");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const { attachSlot, height: dockHeight, closedKey, close, reopen } = usePlayDock();
  const s = value?.state ?? null;
  const live = Boolean(s?.youtubeId && s.status !== "stopped");
  const isHost = live && s?.hostId === me.id;
  const control = isHost || canControl;

  useEffect(() => {
    api<{ canControl: boolean }>("/state").then((x) => setCanControl(x.canControl)).catch(() => undefined);
  }, []);
  const key = sessionKey(s);
  const closed = key !== null && closedKey === key;

  const run = async (body: Record<string, unknown>) => {
    setError("");
    setBusy(true);
    try {
      await command("/watch/control", body);
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  };

  const position = s ? Math.max(0, targetPosition(s)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Play together</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Music or videos from YouTube, playing at the same moment for everyone, and ten games to play with each other. The player keeps going in the
          corner while you chat or play; mute it or close it there.
        </p>
      </div>

      {live && s?.youtubeId ? (
        <section className="relative">
          <p className="mb-2 text-sm font-bold text-cyan-200">{s.status === "paused" ? "Paused" : "Now showing"}: {s.title}</p>
          {closed ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
              You closed the player on this device. Everyone else is still watching.
              <button type="button" onClick={reopen} className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950">
                Open the player
              </button>
            </div>
          ) : (
            // The player itself lives in the Connect layout and is laid over this spot, so it keeps playing on other pages.
            <div ref={attachSlot} className="aspect-video w-full" style={dockHeight ? { height: dockHeight, aspectRatio: "auto" } : undefined} />
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Reactions">
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => api("/watch/react", { body: { emoji: e } }).catch(() => undefined)} className="rounded-full bg-white/5 px-3 py-1.5 text-xl transition hover:scale-110 hover:bg-white/10" aria-label={`React ${e}`}>
                {e}
              </button>
            ))}
          </div>
          {!closed && key && (
            <button type="button" className={`${btn} mt-4`} onClick={() => close(key)}>
              Close the player for me
            </button>
          )}
          {control && (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Playback controls">
              {s.status === "playing" ? (
                <button type="button" className={btn} disabled={busy} onClick={() => run({ action: "pause" })}>Pause for everyone</button>
              ) : (
                <button type="button" className={btn} disabled={busy} onClick={() => run({ action: "play" })}>Play for everyone</button>
              )}
              <button type="button" className={btn} disabled={busy} onClick={() => run({ action: "seek", positionMs: Math.max(0, position - 10_000) })}>Back 10 s</button>
              <button type="button" className={btn} disabled={busy} onClick={() => run({ action: "seek", positionMs: position + 10_000 })}>Forward 10 s</button>
              <button type="button" className={btn} disabled={busy} onClick={() => run({ action: "stop" })}>End session</button>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-rose-400/10 to-transparent p-6">
          <h2 className="text-xl font-black text-white">Play something for everyone</h2>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ action: "start", url });
            }}
          >
            <input value={url} onChange={(e) => setUrl(e.target.value)} required maxLength={300} inputMode="url" placeholder="Paste a YouTube link: a song, a video, a trailer…" aria-label="YouTube link" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
            <button type="submit" disabled={busy || !url.trim()} className="rounded-xl bg-cyan-300 px-5 py-2 font-black text-slate-950 disabled:opacity-40">
              {busy ? "Starting…" : "Start for everyone"}
            </button>
          </form>
        </section>
      )}
      {error && <p className="text-sm text-rose-200">{error}</p>}

      <GamesLobby me={me} />

      <section className="rounded-3xl border border-white/10 p-5 text-sm leading-6 text-slate-400">
        <h2 className="font-black text-slate-200">Netflix, Prime Video and other subscriptions</h2>
        <p className="mt-1">
          These services block screen sharing and do not allow their videos to be relayed, so they cannot be streamed through Private Connect. To watch them
          together, each person needs their own subscription; a free browser extension such as Teleparty keeps everyone&apos;s player in sync. Open a meeting
          here at the same time to talk while you watch.
        </p>
      </section>
    </div>
  );
}

export default function Page() {
  return <Workspace>{(me) => <PlayTogether me={me} />}</Workspace>;
}
