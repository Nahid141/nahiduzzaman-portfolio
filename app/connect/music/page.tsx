"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Workspace from "../_components/Workspace";
import YouTubeSync from "../_components/YouTubeSync";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { fileUrl, type SharedFile } from "../_lib/files";
import { getSocket } from "../_lib/realtime";
import { serverNow, syncClock, targetPosition, useMediaSync, useSharedState } from "../_lib/sync";

type Lounge = {
  requestId: string | null;
  fileId: string | null;
  youtubeId: string | null;
  title: string;
  status: "stopped" | "playing" | "paused";
  anchorMs: number | null;
  positionMs: number;
  repeat: boolean;
  shuffle: boolean;
  controllerId: string | null;
  durationMs: number | null;
  history: string[];
};
type Req = { id: string; status: string; title: string; requestedBy: string | null; note: string; fileId: string | null; youtubeId: string | null };
type Info = {
  queue: { pending: Req[]; queued: Req[]; recent: Req[] };
  djs: { userId: string; username: string; expiresAt: string }[];
  canControl: boolean;
  requestsEnabled: boolean;
};
type Member = { id: string; username: string };

const btn = "rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-40";
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

function readVolume() {
  try {
    return Number(localStorage.getItem("connect.music.volume") ?? "0.8");
  } catch {
    return 0.8;
  }
}

function Lounge({ me }: { me: ConnectUser }) {
  const { value, command } = useSharedState<Lounge>("lounge");
  const [info, setInfo] = useState<Info | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<{ fileId: string; url: string } | null>(null);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState<{ offsetMs: number; rttMs: number } | null>(null);
  const [, setTick] = useState(0);
  const s = value?.state ?? null;

  const loadInfo = useCallback(() => {
    api<Info>("/lounge").then(setInfo).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(loadInfo, 0);
    const sock = getSocket();
    sock.on("lounge:queue", loadInfo);
    void syncClock().then(setOffset).catch(() => undefined);
    const resync = window.setInterval(() => void syncClock().then(setOffset).catch(() => undefined), 60_000);
    const redraw = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => {
      window.clearTimeout(t);
      sock.off("lounge:queue", loadInfo);
      window.clearInterval(resync);
      window.clearInterval(redraw);
    };
  }, [loadInfo]);

  // A fresh short-lived URL whenever the track changes (only after the listener enabled audio).
  useEffect(() => {
    if (!enabled || !s?.fileId || src?.fileId === s.fileId) return;
    const fileId = s.fileId;
    fileUrl(fileId, true)
      .then((url) => setSrc({ fileId, url }))
      .catch((e) => setError(errorMessage(e)));
  }, [enabled, s?.fileId, src?.fileId]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attachAudio = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
    setAudio(el);
  }, []);
  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
    try {
      localStorage.setItem("connect.music.volume", String(volume));
    } catch {
      /* private mode */
    }
  }, [audio, volume, muted]);

  const drift = useMediaSync(audio, s && src?.fileId === s.fileId ? s : null, enabled);

  const run = async (body: Record<string, unknown>) => {
    setError("");
    try {
      await command("/lounge/control", body);
      loadInfo();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const position = s ? Math.max(0, targetPosition(s)) : 0;
  const control = info?.canControl ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Music lounge</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Everyone hears the same track at the same moment. Paste a YouTube link or pick uploaded audio; the administrator or a DJ approves requests.
        </p>
      </div>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-300/10 to-transparent p-6">
        <p className="text-xs font-bold text-cyan-300">{s?.status === "playing" ? "Now playing" : s?.status === "paused" ? "Paused" : "Nothing playing"}</p>
        <p className="mt-1 text-2xl font-black text-white">{s?.title || "The queue is empty"}</p>
        {(s?.fileId || s?.youtubeId) && (
          <div className="mt-4">
            {/* The length is learned when the first listener's browser loads the track; until then show time only. */}
            {s.durationMs ? (
              <input
                type="range"
                min={0}
                max={s.durationMs}
                value={Math.min(position, s.durationMs)}
                disabled={!control}
                aria-label="Playback position"
                onChange={(e) => void run({ action: "seek", positionMs: Number(e.target.value) })}
                className="w-full accent-cyan-300"
              />
            ) : null}
            <div className="flex justify-between text-xs text-slate-400">
              <span>{mmss(position)}</span>
              <span>{s.durationMs ? mmss(s.durationMs) : ""}</span>
            </div>
          </div>
        )}

        {s?.youtubeId && (
          <div className="mt-4 max-w-2xl">
            <YouTubeSync
              videoId={s.youtubeId}
              title={s.title}
              state={s}
              onDuration={(ms) => s.requestId && s.durationMs === null && void run({ action: "duration", requestId: s.requestId, durationMs: ms })}
              onEnded={() => s.requestId && void run({ action: "ended", requestId: s.requestId })}
            />
          </div>
        )}

        {s?.youtubeId ? null : !enabled ? (
          <button type="button" onClick={() => setEnabled(true)} className="mt-5 rounded-2xl bg-cyan-300 px-6 py-3 font-black text-slate-950 hover:bg-cyan-200">
            Enable audio
          </button>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              Volume
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="accent-cyan-300" />
            </label>
            <button type="button" className={btn} aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <span className="text-xs text-slate-500">
              {drift === null ? "" : `In sync within ${Math.abs(drift)} ms`}
              {offset ? `; clock offset ${Math.round(offset.offsetMs)} ms, round trip ${Math.round(offset.rttMs)} ms` : ""}
            </span>
          </div>
        )}
        {enabled && src && (
          <audio
            ref={attachAudio}
            src={src.url}
            preload="auto"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (s?.requestId && s.durationMs === null && Number.isFinite(d)) void run({ action: "duration", requestId: s.requestId, durationMs: Math.round(d * 1000) });
            }}
            onEnded={() => s?.requestId && value && void run({ action: "ended", requestId: s.requestId })}
          />
        )}

        {control && (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Playback controls">
            <button type="button" className={btn} onClick={() => run({ action: "previous" })} disabled={!s?.history.length}>Previous</button>
            {s?.status === "playing" ? (
              <button type="button" className={btn} onClick={() => run({ action: "pause" })}>Pause</button>
            ) : (
              <button type="button" className={btn} onClick={() => run({ action: "play" })}>Play</button>
            )}
            <button type="button" className={btn} onClick={() => run({ action: "next" })}>Next</button>
            <button type="button" className={btn} onClick={() => run({ action: "stop" })}>Stop</button>
            <button type="button" className={btn} aria-pressed={s?.repeat} onClick={() => run({ action: "repeat", on: !s?.repeat })}>Repeat {s?.repeat ? "on" : "off"}</button>
            <button type="button" className={btn} aria-pressed={s?.shuffle} onClick={() => run({ action: "shuffle", on: !s?.shuffle })}>Shuffle {s?.shuffle ? "on" : "off"}</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}
        <p className="mt-3 text-xs text-slate-500">Server time {new Date(serverNow()).toLocaleTimeString()}. Music volume is separate from meeting audio.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Queue info={info} control={control} onChange={loadInfo} setError={setError} />
        <RequestTrack enabled={info?.requestsEnabled ?? false} onDone={loadInfo} />
      </div>
      {me.role === "admin" && <DjManager info={info} onChange={loadInfo} />}
    </div>
  );
}

function Queue({ info, control, onChange, setError }: { info: Info | null; control: boolean; onChange: () => void; setError: (s: string) => void }) {
  const decide = (id: string, decision: string) => api(`/lounge/requests/${id}/decide`, { body: { decision } }).then(onChange).catch((e) => setError(errorMessage(e)));
  const remove = (id: string) => api("/lounge/control", { body: { action: "remove", requestId: id } }).then(onChange).catch((e) => setError(errorMessage(e)));
  return (
    <section className="space-y-4">
      {control && (info?.queue.pending.length ?? 0) > 0 && (
        <div>
          <h2 className="font-black text-amber-200">Requests waiting for approval</h2>
          <ul className="mt-2 space-y-2">
            {info!.queue.pending.map((r) => (
              <li key={r.id} className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm">
                <p className="font-bold text-white">{r.title}</p>
                <p className="text-xs text-slate-400">
                  @{r.requestedBy}
                  {r.note ? `: ${r.note}` : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btn} onClick={() => decide(r.id, "queue")}>Add to queue</button>
                  <button type="button" className={btn} onClick={() => decide(r.id, "play_next")}>Play next</button>
                  <button type="button" className={btn} onClick={() => decide(r.id, "reject")}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h2 className="font-black text-white">Up next</h2>
        <ol className="mt-2 space-y-1 text-sm">
          {info?.queue.queued.length === 0 && <li className="text-slate-500">Nothing queued.</li>}
          {info?.queue.queued.map((r, i) => (
            <li key={r.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <span className="text-slate-200">
                {i + 1}. {r.youtubeId && <span className="mr-1 rounded bg-rose-500/20 px-1.5 text-[10px] font-black text-rose-200">YouTube</span>}
                {r.title} <span className="text-xs text-slate-500">from @{r.requestedBy}</span>
              </span>
              {control && (
                <button type="button" onClick={() => remove(r.id)} className="text-xs font-bold text-slate-400 hover:text-rose-300">Remove</button>
              )}
            </li>
          ))}
        </ol>
      </div>
      {(info?.queue.recent.length ?? 0) > 0 && (
        <div>
          <h2 className="font-black text-white">Recently played</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            {info!.queue.recent.map((r) => (
              <li key={r.id}>{r.title}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RequestTrack({ enabled, onDone }: { enabled: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"youtube" | "file">("youtube");
  const [tracks, setTracks] = useState<SharedFile[]>([]);
  const [fileId, setFileId] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<SharedFile[]>("/files?kind=audio&targetKind=channel&limit=100")
      .then((f) => setTracks(f))
      .catch(() => undefined);
  }, []);
  const tab = (m: "youtube" | "file", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-full px-3 py-1 text-xs font-black ${mode === m ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}
    >
      {label}
    </button>
  );
  return (
    <form
      className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/lounge/requests", { body: mode === "youtube" ? { youtubeUrl, note } : { fileId, note } });
          setMsg("Requested. The administrator has been notified.");
          setNote("");
          setYoutubeUrl("");
          onDone();
        } catch (err) {
          setMsg(errorMessage(err));
        }
        setBusy(false);
      }}
    >
      <h2 className="font-black text-white">Request a track</h2>
      {!enabled && <p className="text-sm text-amber-100">Requests are turned off right now.</p>}
      <div className="flex gap-2">
        {tab("youtube", "YouTube link")}
        {tab("file", "Uploaded audio")}
      </div>
      {mode === "youtube" ? (
        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          required
          maxLength={300}
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="YouTube link"
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white"
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">Audio uploaded to a public channel (files are kept for 5 days).</p>
          <select value={fileId} onChange={(e) => setFileId(e.target.value)} required aria-label="Track" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white">
            <option value="">Choose an audio file</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional)" aria-label="Note" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
      <button type="submit" disabled={!enabled || busy || (mode === "youtube" ? !youtubeUrl.trim() : !fileId)} className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950 disabled:opacity-40">
        {busy ? "Checking the link…" : "Send request"}
      </button>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </form>
  );
}

function DjManager({ info, onChange }: { info: Info | null; onChange: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [userId, setUserId] = useState("");
  const [minutes, setMinutes] = useState(60);
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    api<Member[]>("/members").then(setMembers).catch(() => undefined);
  }, []);
  return (
    <section className="rounded-3xl border border-white/10 p-5">
      <h2 className="font-black text-white">DJ permissions</h2>
      <p className="text-xs text-slate-500">A DJ can approve requests and control playback until the grant expires.</p>
      <ul className="mt-3 space-y-1 text-sm">
        {info?.djs.map((d) => (
          <li key={d.userId} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-slate-200">
            @{d.username}, until {new Date(d.expiresAt).toLocaleTimeString()}
            <button type="button" onClick={() => api(`/lounge/dj/${d.userId}`, { method: "DELETE" }).then(onChange)} className="text-xs font-bold text-rose-300">Revoke</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Member" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          <option value="">Choose a member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>@{m.username}</option>
          ))}
        </select>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Duration" className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
          {[30, 60, 120, 240, 1440].map((m) => (
            <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>
          ))}
        </select>
        <button type="button" disabled={!userId} className={btn} onClick={() => api("/lounge/dj", { body: { userId, minutes } }).then(onChange)}>Grant DJ</button>
      </div>
    </section>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Lounge me={me} />}</Workspace>;
}
