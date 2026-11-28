"use client";

import { useCallback, useEffect, useState } from "react";
import { useMeetingDock, type Meeting } from "../_components/MeetingDock";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Member = { id: string; username: string; fullName: string };

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
      <p className="text-xs text-slate-500">Up to 15 people, with screen sharing. Audio and video go through LiveKit Cloud and are encrypted in transit; recording is off.</p>
    </form>
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
  // The call itself lives in the Connect layout, so it keeps running on other pages; this page gives it room.
  const { joined, active, waiting, notice, setNotice, join, attachSlot, height } = useMeetingDock();

  const load = useCallback(() => {
    api<typeof list>("/meetings").then(setList).catch((e) => setNotice(errorMessage(e)));
  }, [setNotice]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    const s = getSocket();
    s.on("meetings:changed", load);
    return () => {
      window.clearTimeout(t);
      s.off("meetings:changed", load);
    };
  }, [load, joined]);

  if (joined && active) {
    const mine = active.participants.find((p) => p.userId === me.id);
    const isHost = active.hostId === me.id;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">{active.title}</h1>
            <p className="text-xs text-slate-400">
              {active.connected} of {active.maxParticipants} connected{active.locked ? ", locked" : ""}. The call keeps running if you open another page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => api(`/meetings/${active.id}/hand`, { body: { kind: "hand", on: !mine?.handRaised } })}>{mine?.handRaised ? "Lower hand" : "Raise hand ✋"}</button>
            {active.screenShare === "approved" && !isHost && !mine?.canScreenShare && (
              <button type="button" className={btn} onClick={() => api(`/meetings/${active.id}/hand`, { body: { kind: "share", on: !mine?.shareRequested } })}>{mine?.shareRequested ? "Cancel share request" : "Ask to share screen"}</button>
            )}
          </div>
        </div>
        <div ref={attachSlot} style={{ height: height || 420 }} />
        {isHost && <HostPanel m={active} meId={me.id} />}
        {notice && <p className="text-sm text-rose-200">{notice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white">Meetings</h1>
        <p className="mt-2 text-sm text-slate-400">Video and audio calls for up to 15 people, with screen sharing (use the Share screen button in the call), a waiting room and host controls.</p>
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
