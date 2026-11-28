"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import ChatView from "../_components/ChatView";
import ConnectionDot from "../_components/ConnectionDot";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { getSocket } from "../_lib/realtime";

type Person = { id: string; username: string; fullName: string };
type Conversation = {
  id: string;
  isGroup: boolean;
  title: string | null;
  participants: Person[];
  archived: boolean;
  muted: boolean;
  lastMessage: { body: string; createdAt: string } | null;
  unread: number;
};

const nameOf = (c: Conversation, me: ConnectUser) =>
  c.title ?? c.participants.filter((p) => p.id !== me.id).map((p) => p.fullName).join(", ") ?? "Conversation";

function NewConversation({ me, onCreated }: { me: ConnectUser; onCreated: (id: string) => void }) {
  const [members, setMembers] = useState<Person[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Person[]>("/members").then((list) => setMembers(list.filter((m) => m.id !== me.id))).catch(() => undefined);
  }, [me.id]);

  async function start() {
    setError("");
    try {
      const body = picked.length === 1 ? { userId: picked[0] } : { title: title.trim() || "Group", userIds: picked };
      const r = await api<{ id: string }>("/conversations", { body });
      onCreated(r.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 p-3">
      <p className="text-xs font-bold text-slate-400">Pick one person, or several for a group</p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {members.map((m) => (
          <li key={m.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-200 hover:bg-white/5">
              <input
                type="checkbox"
                checked={picked.includes(m.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
              />
              {m.fullName} <span className="text-xs text-slate-500">@{m.username}</span>
            </label>
          </li>
        ))}
      </ul>
      {picked.length > 1 && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Group name"
          aria-label="Group name"
          maxLength={80}
          className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      )}
      {error && <p className="text-xs text-rose-200">{error}</p>}
      <button
        type="button"
        disabled={!picked.length}
        onClick={start}
        className="w-full rounded-xl bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 disabled:opacity-40"
      >
        {picked.length > 1 ? "Create group" : "Open conversation"}
      </button>
    </div>
  );
}

function Receipts({ conversation, me }: { conversation: Conversation; me: ConnectUser }) {
  const [rows, setRows] = useState<{ userId: string; lastReadAt: string }[]>([]);
  const load = useCallback(() => {
    api<{ userId: string; lastReadAt: string }[]>(`/conversations/${conversation.id}/receipts`).then(setRows).catch(() => undefined);
  }, [conversation.id]);
  useEffect(() => {
    load();
    const s = getSocket();
    s.on("chat:read", load);
    return () => {
      s.off("chat:read", load);
    };
  }, [load]);
  const others = conversation.participants.filter((p) => p.id !== me.id);
  return (
    <ul className="space-y-1 text-xs text-slate-400">
      {others.map((p) => {
        const r = rows.find((x) => x.userId === p.id);
        return (
          <li key={p.id}>
            {p.fullName}: {r ? `seen up to ${new Date(r.lastReadAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "not opened yet"}
          </li>
        );
      })}
    </ul>
  );
}

function Messages() {
  const initial = useSearchParams().get("c");
  const [list, setList] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(initial);
  const [composing, setComposing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(() => {
    api<Conversation[]>("/conversations")
      .then((l) =>
        setList(l.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? "")))
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const s = getSocket();
    s.on("conversation:new", load);
    s.on("chat:message", load);
    return () => {
      s.off("conversation:new", load);
      s.off("chat:message", load);
    };
  }, [load]);

  const current = list.find((c) => c.id === active);
  const flag = async (c: Conversation, f: "archive" | "unarchive" | "mute" | "unmute") => {
    await api(`/conversations/${c.id}/${f}`, { body: {} }).catch(() => undefined);
    load();
  };

  return (
    <Workspace
      aside={(me) => (
        <div className="space-y-4">
          <ConnectionDot />
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            className="w-full rounded-xl bg-cyan-300/15 px-3 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/25"
          >
            {composing ? "Cancel" : "New message"}
          </button>
          {composing && (
            <NewConversation
              me={me}
              onCreated={(id) => {
                setComposing(false);
                setActive(id);
                load();
              }}
            />
          )}
          <ul className="space-y-1">
            {list
              .filter((c) => c.archived === showArchived)
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={c.id === active}
                    onClick={() => setActive(c.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left ${c.id === active ? "bg-cyan-300/15" : "hover:bg-white/5"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-white">{nameOf(c, me)}</span>
                      {c.unread > 0 && c.id !== active && (
                        <span className="rounded-full bg-cyan-300 px-2 text-xs font-black text-slate-950">{c.unread}</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.muted ? "Muted · " : ""}
                      {c.lastMessage?.body || "No messages yet"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-white">
            {showArchived ? "Show inbox" : "Show archived"}
          </button>
          {current && (
            <div className="space-y-3 border-t border-white/10 pt-3">
              <Receipts conversation={current} me={me} />
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => flag(current, current.muted ? "unmute" : "mute")} className="rounded-lg bg-white/5 px-2 py-1 text-slate-300">
                  {current.muted ? "Unmute" : "Mute"}
                </button>
                <button type="button" onClick={() => flag(current, current.archived ? "unarchive" : "archive")} className="rounded-lg bg-white/5 px-2 py-1 text-slate-300">
                  {current.archived ? "Unarchive" : "Archive"}
                </button>
                {!current.isGroup && (
                  <button
                    type="button"
                    onClick={async () => {
                      const other = current.participants.find((p) => p.id !== me.id);
                      if (other && window.confirm(`Block ${other.fullName}? They will not be able to message you.`)) {
                        await api("/blocks", { body: { userId: other.id } }).catch(() => undefined);
                      }
                    }}
                    className="rounded-lg bg-rose-400/10 px-2 py-1 text-rose-200"
                  >
                    Block
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-4 text-slate-500">
                Private to the people in this conversation. Messages are protected by access control and TLS, not end-to-end encryption.
              </p>
            </div>
          )}
        </div>
      )}
    >
      {(me) =>
        current ? (
          <ChatView key={current.id} target={{ kind: "conversation", id: current.id }} me={me} title={nameOf(current, me)} />
        ) : (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <h1 className="text-2xl font-black text-white">Direct messages</h1>
            <p className="mt-2 text-slate-400">Pick a conversation, or start a new one with “New message”.</p>
          </div>
        )
      }
    </Workspace>
  );
}

export default function MessagesPage() {
  return (
    <Suspense>
      <Messages />
    </Suspense>
  );
}
