"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Social";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { emit, getSocket, newClientId, REACTIONS, sameTarget, type ChatMessage, type Target } from "../_lib/realtime";
import { ACCEPT, uploadFile, type SharedFile } from "../_lib/files";
import { AttachmentChip, FilePreview } from "./FileBits";
import Polls from "./Polls";
import { notifyRead, setViewing } from "../_lib/unread";

const ERRORS: Record<string, string> = {
  rate_limited: "You are sending messages too fast. Wait a few seconds.",
  blocked: "You cannot message this person.",
  forbidden: "You cannot do that.",
  not_found: "This message or conversation is no longer available.",
  timeout: "No answer from the server. Check your connection.",
  invalid_input: "That message could not be sent.",
};

const historyPath = (t: Target) => (t.kind === "channel" ? `/channels/${t.id}/messages` : `/conversations/${t.id}/messages`);

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Highlights @mentions in a message body without using HTML injection. */
function Body({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_.-]{3,32})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-slate-200">
      {parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded bg-cyan-300/15 px-1 font-semibold text-cyan-200">{p}</span> : p))}
    </p>
  );
}

export default function ChatView({ target, me, title, subtitle }: { target: Target; me: ConnectUser; title: string; subtitle?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<SharedFile | null>(null);
  const [showPolls, setShowPolls] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [showPinned, setShowPinned] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  const markRead = useCallback(
    (list: ChatMessage[]) => {
      const last = [...list].reverse().find((m) => !m.id.startsWith("pending:"));
      if (last) void emit("chat:read", { target, messageId: last.id }).then(notifyRead);
    },
    [target]
  );

  // This chat is open: its messages are not counted as unread or announced while it stays on screen.
  useEffect(() => {
    setViewing(target);
    return () => setViewing(null);
  }, [target]);

  // Messages that arrived while the tab was in the background count as read once it is visible again.
  const latestList = useRef<ChatMessage[]>([]);
  useEffect(() => {
    latestList.current = messages;
  }, [messages]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && markRead(latestList.current);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  // Initial page of history.
  useEffect(() => {
    let alive = true;
    api<ChatMessage[]>(`${historyPath(target)}?limit=50`)
      .then((list) => {
        if (!alive) return;
        setMessages(list);
        setHasMore(list.length === 50);
        setLoading(false);
        scrollToEnd();
        markRead(list);
      })
      .catch((err) => alive && (setError(errorMessage(err)), setLoading(false)));
    return () => {
      alive = false;
    };
  }, [target, markRead]);

  // Live events for this room.
  useEffect(() => {
    const s = getSocket();
    void emit("subscribe", { target });
    const onMessage = (m: ChatMessage) => {
      if (!sameTarget(m.target, target)) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      const el = listRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) scrollToEnd();
      if (document.visibilityState === "visible") void emit("chat:read", { target, messageId: m.id }).then(notifyRead);
    };
    const onUpdated = (m: ChatMessage) => {
      if (sameTarget(m.target, target)) setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
    };
    const onTyping = (e: { target: Target; userId: string; username: string; typing: boolean }) => {
      if (!sameTarget(e.target, target)) return;
      setTyping((prev) => {
        const next = { ...prev };
        if (e.typing) next[e.userId] = e.username;
        else delete next[e.userId];
        return next;
      });
    };
    s.on("chat:message", onMessage);
    s.on("chat:updated", onUpdated);
    s.on("chat:typing", onTyping);
    return () => {
      s.off("chat:message", onMessage);
      s.off("chat:updated", onUpdated);
      s.off("chat:typing", onTyping);
    };
  }, [target]);

  // Load older messages when the top sentinel scrolls into view.
  const loadOlder = useCallback(async () => {
    const first = messages.find((m) => !m.id.startsWith("pending:"));
    if (!first || !hasMore) return;
    const el = listRef.current;
    const before = el?.scrollHeight ?? 0;
    const older = await api<ChatMessage[]>(`${historyPath(target)}?limit=50&before=${encodeURIComponent(first.createdAt)}`).catch(() => []);
    setHasMore(older.length === 50);
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    requestAnimationFrame(() => el && el.scrollTo({ top: el.scrollHeight - before }));
  }, [messages, hasMore, target]);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && !loading && void loadOlder(), { root: listRef.current });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadOlder, loading]);

  async function submit() {
    const body = draft.trim();
    if (!body && !attached.length) return;
    setError("");
    if (editing) {
      const r = await emit<ChatMessage>("chat:edit", { id: editing.id, body });
      if (!r.ok) return setError(ERRORS[r.error] ?? "The edit was not saved.");
      setEditing(null);
      setDraft("");
      return;
    }
    const clientId = newClientId();
    const pending: ChatMessage = {
      id: `pending:${clientId}`,
      target,
      author: { id: me.id, username: me.username, fullName: me.fullName, avatarKey: me.avatarKey },
      body,
      replyToId: replyTo?.id ?? null,
      forwardedFromId: null,
      mentions: [],
      pinned: false,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      reactions: [],
      attachments: attached.map(({ id, name, mime, kind, sizeBytes }) => ({ id, name, mime, kind, sizeBytes })),
    };
    const attachmentIds = attached.map((f) => f.id);
    setMessages((prev) => [...prev, pending]);
    setDraft("");
    setAttached([]);
    setReplyTo(null);
    scrollToEnd();
    void emit("chat:typing", { target, typing: false });
    const r = await emit<ChatMessage>("chat:send", { target, body, clientId, replyToId: pending.replyToId ?? undefined, attachments: attachmentIds });
    setMessages((prev) => {
      const without = prev.filter((m) => m.id !== pending.id);
      return r.ok ? (without.some((m) => m.id === r.data.id) ? without : [...without, r.data]) : without;
    });
    if (!r.ok) {
      setError(ERRORS[r.error] ?? "The message was not sent.");
      setDraft(body);
      setAttached(pending.attachments as SharedFile[]);
    }
  }

  async function attach(list: FileList) {
    setError("");
    for (const f of [...list].slice(0, 10 - attached.length)) {
      setUploading(f.name);
      try {
        const file = await uploadFile(target, f);
        setAttached((a) => [...a, file]);
      } catch (e) {
        setError(errorMessage(e));
      }
    }
    setUploading(null);
  }

  function onDraftChange(v: string) {
    setDraft(v);
    const now = Date.now();
    if (now - lastTyping.current > 2500) {
      lastTyping.current = now;
      void emit("chat:typing", { target, typing: v.length > 0 });
    }
  }

  const act = async (event: string, payload: unknown) => {
    const r = await emit(event, payload);
    if (!r.ok) setError(ERRORS[r.error] ?? "That did not work.");
  };

  const byId = new Map(messages.map((m) => [m.id, m]));
  const shown = showPinned ? messages.filter((m) => m.pinned) : messages;
  const typingNames = Object.values(typing);

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[480px] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <h1 className="text-xl font-black text-white">{title}</h1>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={showPolls}
          onClick={() => setShowPolls((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold ${showPolls ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}
        >
          Polls
        </button>
        <button
          type="button"
          aria-pressed={showPinned}
          onClick={() => setShowPinned((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold ${showPinned ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}
        >
          Pinned
        </button>
        </div>
      </header>
      {showPolls && <Polls target={target} me={me} />}

      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto py-4 pr-1" aria-live="polite">
        <div ref={topRef} />
        {loading && <p className="text-center text-sm text-slate-500">Loading messages…</p>}
        {!loading && !hasMore && messages.length > 0 && <p className="pb-2 text-center text-xs text-slate-600">Start of the conversation</p>}
        {!loading && shown.length === 0 && (
          <p className="py-16 text-center text-slate-400">{showPinned ? "No pinned messages." : "No messages yet. Say hello."}</p>
        )}
        {shown.map((m) => {
          const mine = m.author?.id === me.id;
          const pending = m.id.startsWith("pending:");
          const parent = m.replyToId ? byId.get(m.replyToId) : null;
          return (
            <article key={m.id} className={`group rounded-2xl px-3 py-2 transition hover:bg-white/[0.04] ${pending ? "opacity-60" : ""}`}>
              {parent && (
                <p className="mb-1 truncate border-l-2 border-cyan-300/40 pl-2 text-xs text-slate-500">
                  ↳ {parent.author?.fullName ?? "Deleted user"}: {parent.deletedAt ? "deleted message" : parent.body}
                </p>
              )}
              <div className="flex items-center gap-2">
                {m.author && <Avatar user={m.author} size="sm" />}
                <span className="font-bold text-white">{m.author?.fullName ?? "Deleted user"}</span>
                <time className="text-xs text-slate-500" dateTime={m.createdAt}>
                  {time(m.createdAt)}
                </time>
                {m.editedAt && !m.deletedAt && <span className="text-xs text-slate-600">edited</span>}
                {m.pinned && <span className="text-xs font-bold text-amber-300">pinned</span>}
                {pending && <span className="text-xs text-slate-500">sending…</span>}
              </div>
              {m.deletedAt ? <p className="italic text-slate-600">Message deleted</p> : m.body ? <Body text={m.body} /> : null}
              {!m.deletedAt &&
                m.attachments?.map((a) => (
                  <AttachmentChip key={a.id} file={a as SharedFile} onOpen={() => !pending && setPreview({ ...(a as SharedFile), preview: ["image", "audio", "video"].includes(a.kind) || a.mime === "application/pdf", scan: "" })} />
                ))}
              {m.reactions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {m.reactions.map((r) => {
                    const minePick = r.userIds.includes(me.id);
                    return (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => act("chat:react", { id: m.id, emoji: r.emoji, on: !minePick })}
                        className={`rounded-full border px-2 py-0.5 text-xs ${minePick ? "border-cyan-300/60 bg-cyan-300/15" : "border-white/10 bg-white/5"}`}
                      >
                        {r.emoji} {r.count}
                      </button>
                    );
                  })}
                </div>
              )}
              {!pending && !m.deletedAt && (
                <div className="mt-1 hidden flex-wrap gap-1 text-xs group-focus-within:flex group-hover:flex">
                  {REACTIONS.slice(0, 6).map((e) => (
                    <button key={e} type="button" aria-label={`React ${e}`} onClick={() => act("chat:react", { id: m.id, emoji: e, on: true })} className="rounded px-1 hover:bg-white/10">
                      {e}
                    </button>
                  ))}
                  <button type="button" onClick={() => setReplyTo(m)} className="rounded px-2 font-bold text-slate-400 hover:bg-white/10 hover:text-white">
                    Reply
                  </button>
                  <button type="button" onClick={() => act("chat:pin", { id: m.id, on: !m.pinned })} className="rounded px-2 font-bold text-slate-400 hover:bg-white/10 hover:text-white">
                    {m.pinned ? "Unpin" : "Pin"}
                  </button>
                  {mine && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(m);
                        setDraft(m.body);
                      }}
                      className="rounded px-2 font-bold text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      Edit
                    </button>
                  )}
                  {(mine || (me.role === "admin" && m.target.kind === "channel")) && (
                    <button type="button" onClick={() => act("chat:delete", { id: m.id })} className="rounded px-2 font-bold text-rose-300/80 hover:bg-rose-400/10">
                      Delete
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="h-5 text-xs text-slate-500" aria-live="polite">
        {typingNames.length ? `${typingNames.slice(0, 3).join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…` : ""}
      </p>
      {error && <p role="alert" className="mb-2 rounded-xl bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300">
          <span className="truncate">{editing ? "Editing your message" : `Replying to ${replyTo!.author?.fullName}: ${replyTo!.body}`}</span>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null);
              if (editing) setDraft("");
              setEditing(null);
            }}
            className="ml-3 font-bold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}
      {(attached.length > 0 || uploading) && (
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {attached.map((f) => (
            <span key={f.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 text-slate-200">
              📎 {f.name}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setAttached((a) => a.filter((x) => x.id !== f.id))} className="font-bold text-slate-400 hover:text-white">
                ×
              </button>
            </span>
          ))}
          {uploading && <span className="rounded-xl bg-white/5 px-3 py-1.5 text-slate-400">Uploading {uploading}…</span>}
        </div>
      )}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-end gap-2"
      >
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={Boolean(editing) || Boolean(uploading) || attached.length >= 10}
          aria-label="Attach files"
          className="rounded-2xl border border-white/10 px-4 py-3 font-black text-slate-300 transition hover:border-cyan-300/50 hover:text-white disabled:opacity-40"
        >
          +
        </button>
        <input ref={fileInput} type="file" multiple hidden accept={ACCEPT} onChange={(e) => e.target.files && void attach(e.target.files).then(() => (e.target.value = ""))} />
        <label className="sr-only" htmlFor="composer">
          Message
        </label>
        <textarea
          id="composer"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Write a message. Use @username to mention someone."
          className="max-h-40 min-h-12 flex-1 resize-y rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-white outline-none focus:border-cyan-300"
        />
        <button type="submit" disabled={(!draft.trim() && !attached.length) || Boolean(uploading)} className="rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:opacity-40">
          {editing ? "Save" : "Send"}
        </button>
      </form>
      {target.kind === "channel" && (
        <p className="mt-2 text-center text-[11px] text-slate-500">Messages in channels are deleted automatically after 10 days. Direct messages are kept.</p>
      )}
    </div>
  );
}
