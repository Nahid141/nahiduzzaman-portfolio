"use client";

import "@livekit/components-styles";
import { LiveKitRoom, RoomAudioRenderer, useDataChannel, VideoConference } from "@livekit/components-react";
import { useCallback, useEffect, useState } from "react";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Participant = {
  userId: string;
  username: string;
  fullName: string;
  state: "invited" | "waiting" | "admitted" | "denied" | "removed";
  online: boolean;
  handRaised: boolean;
  shareRequested: boolean;
  canScreenShare: boolean;
};
type Meeting = {
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
type Member = { id: string; username: string; fullName: string };
type Joined = { meetingId: string; token: string; url: string };

const btn = "rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-40";

function CreateMeeting({ me, onCreated }: { me: ConnectUser; onCreated: (m: Meeting) => void }) {
  const [title, setTitle] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [screenShare, setScreenShare] = useState<Meeting["screenShare"]>("all");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (inviteOnly && !members.length) api<Member[]>("/members").then((m) => setMembers(m.filter((x) => x.id !== me.id))).catch(() => undefined);
  }, [inviteOnly, members.length, me.id]);
  return (
    <form
      className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          onCreated(await api<Meeting>("/meetings", { body: { title, audioOnly, inviteOnly, waitingRoom, screenShare, invitees: inviteOnly ? invitees : [] } }));
          setTitle("");
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <h2 className="font-black text-white">Start a meeting</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Meeting title" aria-label="Meeting title" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white" />
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={audioOnly} onChange={(e) => setAudioOnly(e.target.checked)} /> Audio only</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={waitingRoom} onChange={(e) => setWaitingRoom(e.target.checked)} /> Waiting room</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={inviteOnly} onChange={(e) => setInviteOnly(e.target.checked)} /> Invited people only</label>
        <label className="flex items-center gap-2">
          Screen sharing
          <select value={screenShare} onChange={(e) => setScreenShare(e.target.value as Meeting["screenShare"])} className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1">
            <option value="all">Everyone</option>
            <option value="approved">Host approves</option>
            <option value="host">Host only</option>
          </select>
        </label>
      </div>
      {inviteOnly && (
        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
          {members.map((m) => (
            <button key={m.id} type="button" aria-pressed={invitees.includes(m.id)} onClick={() => setInvitees((v) => (v.includes(m.id) ? v.filter((x) => x !== m.id) : [...v, m.id]))} className={`rounded-full px-3 py-1 text-xs font-bold ${invitees.includes(m.id) ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}>
              @{m.username}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-rose-200">{error}</p>}
      <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 font-black text-slate-950 hover:bg-cyan-200">Start meeting</button>
      <p className="text-xs text-slate-500">Up to 10 people. Audio and video go through LiveKit Cloud and are encrypted in transit; recording is off.</p>
    </form>
  );
}

const EMOJI = ["👍", "👏", "😂", "🎉", "❤️", "🙌"];

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
          <button key={e} type="button" className="rounded-lg px-2 py-1 text-lg hover:bg-white/10" aria-label={`React ${e}`} onClick={() => { void send(new TextEncoder().encode(e), { reliable: true }); show(e, "You"); }}>
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

function HostPanel({ m, meId }: { m: Meeting; meId: string }) {
  const [error, setError] = useState("");
  const act = (body: Record<string, unknown>) => api(`/meetings/${m.id}/host`, { body }).catch((e) => setError(errorMessage(e)));
  const waiting = m.participants.filter((p) => p.state === "waiting");
  const inRoom = m.participants.filter((p) => p.state === "admitted" && p.userId !== meId);
  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-black text-cyan-300">Host controls</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => act({ action: "lock", on: !m.locked })}>{m.locked ? "Unlock meeting" : "Lock meeting"}</button>
        <button type="button" className={btn} onClick={() => act({ action: "waiting_room", on: !m.waitingRoom })}>{m.waitingRoom ? "Waiting room on" : "Waiting room off"}</button>
        <select aria-label="Screen sharing policy" value={m.screenShare} onChange={(e) => act({ action: "screen_share_policy", policy: e.target.value })} className="rounded-xl border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white">
          <option value="all">Anyone can share</option>
          <option value="approved">Host approves sharing</option>
          <option value="host">Only host shares</option>
        </select>
        <button type="button" className={`${btn} border-rose-300/30 text-rose-200`} onClick={() => act({ action: "end" })}>End for everyone</button>
      </div>
      {waiting.length > 0 && (
        <div>
          <p className="font-bold text-white">Waiting to join</p>
          {waiting.map((p) => (
            <div key={p.userId} className="mt-1 flex items-center justify-between gap-2">
              <span className="text-slate-300">@{p.username}</span>
              <span className="flex gap-1">
                <button type="button" className={btn} onClick={() => act({ action: "admit", userId: p.userId })}>Admit</button>
                <button type="button" className={btn} onClick={() => act({ action: "deny", userId: p.userId })}>Deny</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {inRoom.map((p) => (
        <div key={p.userId} className="rounded-xl bg-white/5 p-2">
          <p className="text-slate-200">
            @{p.username} {p.handRaised && "✋"} {p.shareRequested && <span className="text-xs text-amber-200">wants to share</span>}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <button type="button" className={btn} onClick={() => act({ action: "mute", userId: p.userId, source: "microphone" })}>Mute mic</button>
            <button type="button" className={btn} onClick={() => act({ action: "mute", userId: p.userId, source: "camera" })}>Stop camera</button>
            {m.screenShare === "approved" && (
              <button type="button" className={btn} onClick={() => act({ action: "grant_screen_share", userId: p.userId, on: !p.canScreenShare })}>{p.canScreenShare ? "Revoke sharing" : "Allow sharing"}</button>
            )}
            <button type="button" className={btn} onClick={() => act({ action: "transfer_host", userId: p.userId })}>Make host</button>
            <button type="button" className={`${btn} text-rose-200`} onClick={() => act({ action: "remove", userId: p.userId })}>Remove</button>
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500">Muting is one-way: you can turn someone&apos;s microphone or camera off, never on.</p>
      {error && <p className="text-rose-200">{error}</p>}
    </div>
  );
}

function Conference({ me }: { me: ConnectUser }) {
  const [list, setList] = useState<{ meetings: Meeting[]; configured: boolean; usage: { usedMinutes: number; capMinutes: number } } | null>(null);
  const [active, setActive] = useState<Meeting | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    api<typeof list>("/meetings").then(setList).catch((e) => setNotice(errorMessage(e)));
  }, []);
  const loadActive = useCallback((id: string) => api<Meeting>(`/meetings/${id}`).then(setActive).catch(() => setActive(null)), []);

  const join = useCallback(async (id: string) => {
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
      setNotice(errorMessage(e));
    }
  }, [loadActive]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    const onList = () => load();
    const onChanged = (p: { id: string }) => {
      if (joined?.meetingId === p.id) void loadActive(p.id);
      if (waiting === p.id) void join(p.id); // admitted (or denied) by the host
    };
    const onGone = (p: { id: string }) => {
      if (joined?.meetingId === p.id) {
        setJoined(null);
        setActive(null);
        setNotice("The meeting ended or the host removed you.");
      }
    };
    s.on("meetings:changed", onList);
    s.on("meeting:changed", onChanged);
    s.on("meeting:ended", onGone);
    s.on("meeting:removed", onGone);
    return () => {
      window.clearTimeout(t);
      s.off("meetings:changed", onList);
      s.off("meeting:changed", onChanged);
      s.off("meeting:ended", onGone);
      s.off("meeting:removed", onGone);
    };
  }, [load, loadActive, join, joined, waiting]);

  if (joined && active) {
    const mine = active.participants.find((p) => p.userId === me.id);
    const isHost = active.hostId === me.id;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">{active.title}</h1>
            <p className="text-xs text-slate-400">
              {active.connected} of {active.maxParticipants} connected{active.locked ? ", locked" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => api(`/meetings/${active.id}/hand`, { body: { kind: "hand", on: !mine?.handRaised } })}>{mine?.handRaised ? "Lower hand" : "Raise hand ✋"}</button>
            {active.screenShare === "approved" && !isHost && !mine?.canScreenShare && (
              <button type="button" className={btn} onClick={() => api(`/meetings/${active.id}/hand`, { body: { kind: "share", on: !mine?.shareRequested } })}>{mine?.shareRequested ? "Cancel share request" : "Ask to share screen"}</button>
            )}
          </div>
        </div>
        <div className="relative h-[70vh] overflow-hidden rounded-3xl border border-white/10" data-lk-theme="default">
          <LiveKitRoom
            serverUrl={joined.url}
            token={joined.token}
            connect
            audio
            video={!active.audioOnly}
            options={{
              adaptiveStream: true,
              dynacast: true,
              audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }}
            onDisconnected={() => {
              setJoined(null);
              setActive(null);
              load();
            }}
            onError={(e) => setNotice(e.message)}
            style={{ height: "100%" }}
          >
            <VideoConference />
            <RoomAudioRenderer />
            <div className="absolute left-3 top-3 z-10 rounded-xl bg-slate-950/70 px-2 py-1">
              <Reactions />
            </div>
          </LiveKitRoom>
        </div>
        {isHost && <HostPanel m={active} meId={me.id} />}
        {notice && <p className="text-sm text-rose-200">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Meetings</h1>
        <p className="mt-2 text-sm text-slate-400">Video and audio calls for up to 10 people, with screen sharing, a waiting room and host controls.</p>
      </div>
      {list && !list.configured && <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">Meetings are not configured on the server yet (LiveKit keys missing).</p>}
      {notice && <p role="alert" className="rounded-xl bg-rose-400/10 px-4 py-2 text-sm text-rose-200">{notice}</p>}
      {waiting && <p className="rounded-xl bg-cyan-300/10 px-4 py-3 text-cyan-100">You are in the waiting room. The host has been told; this page will join automatically when they let you in.</p>}
      {list?.configured && <CreateMeeting me={me} onCreated={(m) => void join(m.id)} />}
      <ul className="space-y-3">
        {list?.meetings.length === 0 && <li className="text-sm text-slate-500">No meetings right now.</li>}
        {list?.meetings.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="font-bold text-white">{m.title}</p>
              <p className="text-xs text-slate-400">
                {m.connected}/{m.maxParticipants} connected{m.audioOnly ? ", audio only" : ""}
                {m.locked ? ", locked" : ""}
                {m.waitingRoom ? ", waiting room" : ""}
                {m.inviteOnly ? ", invited people only" : ""}
              </p>
            </div>
            {m.private ? (
              me.role === "admin" && <button type="button" className={btn} onClick={() => api(`/meetings/${m.id}/host`, { body: { action: "end" } }).then(load)}>End meeting</button>
            ) : (
              <button type="button" onClick={() => join(m.id)} disabled={m.connected >= m.maxParticipants} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">
                {m.connected >= m.maxParticipants ? "Full" : "Join"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {list && (
        <p className="text-xs text-slate-500">
          Free plan: {list.usage.usedMinutes} of {list.usage.capMinutes} participant-minutes used this month.
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Conference me={me} />}</Workspace>;
}
