"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { getSocket, sameTarget, type ChatMessage, type Target } from "./realtime";

/* Which chat this browser tab has open and visible, so it is neither counted as unread nor announced. */
let viewing: Target | null = null;
const READ = "connect:read";

export function setViewing(t: Target | null) {
  viewing = t;
}
export const isViewing = (t: Target) => Boolean(viewing && sameTarget(viewing, t) && document.visibilityState === "visible");

/** Called after this tab told the server how far it has read, so the badges refresh at once. */
export function notifyRead() {
  window.dispatchEvent(new Event(READ));
}

type ChannelRow = { id: string; name: string; unread: number };
type ConversationRow = { id: string; isGroup: boolean; title: string | null; muted: boolean; unread: number; participants: { id: string; fullName: string }[] };

export type Unread = {
  /** Unread messages across all channels this person can see (General chat). */
  channels: number;
  /** Unread direct and group messages, leaving out conversations they muted. */
  messages: number;
  channelName: (id: string) => string | undefined;
  conversation: (id: string) => ConversationRow | undefined;
};

/**
 * Unread counts for the navigation badges. The server keeps a read position per person and chat; this asks for the
 * counts again whenever a message arrives or this tab reads something (a short delay batches bursts of messages).
 */
export function useUnread(enabled: boolean): Unread {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const timer = useRef<number | null>(null);

  const load = useCallback(() => {
    void api<ChannelRow[]>("/channels").then(setChannels).catch(() => undefined);
    void api<ConversationRow[]>("/conversations").then(setConversations).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const soon = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 600);
    };
    const first = window.setTimeout(load, 0);
    const s = getSocket();
    const onVisible = () => document.visibilityState === "visible" && soon();
    s.on("chat:message", soon);
    s.on("channel:new", soon);
    s.on("conversation:new", soon);
    s.on("connect", soon);
    window.addEventListener(READ, soon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      if (timer.current) window.clearTimeout(timer.current);
      s.off("chat:message", soon);
      s.off("channel:new", soon);
      s.off("conversation:new", soon);
      s.off("connect", soon);
      window.removeEventListener(READ, soon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  const open = (t: Target) => viewing && sameTarget(viewing, t);
  return {
    channels: channels.reduce((n, c) => n + (open({ kind: "channel", id: c.id }) ? 0 : c.unread), 0),
    messages: conversations.reduce((n, c) => n + (c.muted || open({ kind: "conversation", id: c.id }) ? 0 : c.unread), 0),
    channelName: (id) => channels.find((c) => c.id === id)?.name,
    conversation: (id) => conversations.find((c) => c.id === id),
  };
}

/** New messages from other people, for the short pop-up notice; muted conversations and the open chat stay quiet. */
export function useIncoming(meId: string | null, unread: Unread, onMessage: (m: ChatMessage) => void) {
  const latest = useRef({ unread, onMessage });
  useEffect(() => {
    latest.current = { unread, onMessage };
  });
  useEffect(() => {
    if (!meId) return;
    const s = getSocket();
    const on = (m: ChatMessage) => {
      if (!m.author || m.author.id === meId || m.deletedAt || isViewing(m.target)) return;
      if (m.target.kind === "conversation" && latest.current.unread.conversation(m.target.id)?.muted) return;
      latest.current.onMessage(m);
    };
    s.on("chat:message", on);
    return () => void s.off("chat:message", on);
  }, [meId]);
}
