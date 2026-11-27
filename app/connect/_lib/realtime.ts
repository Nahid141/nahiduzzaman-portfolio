"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CONNECT_API } from "./api";

export type Target = { kind: "channel"; id: string } | { kind: "conversation"; id: string };

export type ChatMessage = {
  id: string;
  target: Target;
  author: { id: string; username: string; fullName: string } | null;
  body: string;
  replyToId: string | null;
  forwardedFromId: string | null;
  mentions: string[];
  pinned: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: { emoji: string; count: number; userIds: string[] }[];
  attachments?: { id: string; name: string; mime: string; kind: string; sizeBytes: number }[];
};

export type Ack<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export const REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👀", "✅", "🔥"];

export const sameTarget = (a: Target, b: Target) => a.kind === b.kind && a.id === b.id;

/* One socket per page load, shared by every component. Reconnects automatically. */
let shared: Socket | null = null;

export function getSocket(): Socket {
  shared ??= io(CONNECT_API, {
    path: "/api/v1/socket",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnectionDelayMax: 10_000,
  });
  return shared;
}

export async function emit<T>(event: string, payload: unknown): Promise<Ack<T>> {
  try {
    return (await getSocket().timeout(8000).emitWithAck(event, payload)) as Ack<T>;
  } catch {
    return { ok: false, error: "timeout" };
  }
}

/** Live connection state for the status dot and reconnect banner. */
export function useConnection() {
  const [state, setState] = useState<"connecting" | "online" | "offline">("connecting");
  useEffect(() => {
    const s = getSocket();
    const on = () => setState("online");
    const off = () => setState("offline");
    s.on("connect", on);
    s.on("disconnect", off);
    s.on("connect_error", off);
    if (s.connected) queueMicrotask(on);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
      s.off("connect_error", off);
    };
  }, []);
  return state;
}

export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
