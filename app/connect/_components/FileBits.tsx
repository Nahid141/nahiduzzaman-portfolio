"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "../_lib/api";
import { fileUrl, formatBytes, type SharedFile } from "../_lib/files";
import type { Target } from "../_lib/realtime";

export type Room = { target: Target; label: string };

type Channel = { id: string; name: string; kind: "public" | "restricted" };
type Conversation = { id: string; isGroup: boolean; title: string | null; participants: { id: string; username: string }[] };

/** Channels and conversations the signed-in user can see, for room pickers. */
export function useRooms(meId: string) {
  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    Promise.all([api<Channel[]>("/channels"), api<Conversation[]>("/conversations")])
      .then(([chs, cvs]) =>
        setRooms([
          ...chs.map((c) => ({ target: { kind: "channel" as const, id: c.id }, label: `#${c.name}${c.kind === "restricted" ? " (restricted)" : ""}` })),
          ...cvs.map((c) => ({
            target: { kind: "conversation" as const, id: c.id },
            label: c.title || c.participants.filter((p) => p.id !== meId).map((p) => `@${p.username}`).join(", ") || "Conversation",
          })),
        ])
      )
      .catch(() => setRooms([]));
  }, [meId]);
  return rooms;
}

export const roomKey = (t: Target) => `${t.kind}:${t.id}`;

/** Opens a file with a fresh short-lived URL: inline preview for safe media, download otherwise. */
export function FilePreview({ file, onClose }: { file: SharedFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fileUrl(file.id, file.preview).then(setUrl).catch((e) => setError(errorMessage(e)));
  }, [file.id, file.preview]);

  return (
    <div role="dialog" aria-modal="true" aria-label={file.name} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-bold text-white">{file.name}</p>
          <div className="flex gap-2">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/15 px-3 py-1.5 text-sm font-bold text-slate-200">
                Open in new tab
              </a>
            )}
            <button type="button" onClick={onClose} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white" autoFocus>
              Close
            </button>
          </div>
        </div>
        {error && <p className="text-rose-200">{error}</p>}
        {!url && !error && <p className="text-slate-400">Getting a secure link…</p>}
        {url && file.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={file.name} className="max-h-[75vh] rounded-2xl object-contain" />
        )}
        {url && file.mime === "application/pdf" && (
          <iframe src={url} title={file.name} className="h-[75vh] w-full rounded-2xl bg-white" />
        )}
        {url && file.kind === "audio" && <audio src={url} controls autoPlay className="w-full" />}
        {url && file.kind === "video" && <video src={url} controls autoPlay playsInline className="max-h-[75vh] w-full rounded-2xl bg-black" />}
        {url && !file.preview && (
          <p className="rounded-2xl bg-white/5 p-6 text-slate-300">
            This type is not previewed in the browser for safety. Use “Open in new tab” to download it ({formatBytes(file.sizeBytes)}).
          </p>
        )}
        <p className="text-xs text-slate-500">
          Links expire after 5 minutes. {file.scan === "not_scanned" ? "Type and signature verified; not malware-scanned." : file.scan === "hash_clean" ? "Hash checked: not known malware." : ""}
        </p>
      </div>
    </div>
  );
}

const ICON: Record<string, string> = { image: "🖼", document: "📄", audio: "🎵", video: "🎬", archive: "🗜" };

/** Compact chip for an attachment in a chat message. */
export function AttachmentChip({ file, onOpen }: { file: Pick<SharedFile, "id" | "name" | "kind" | "sizeBytes">; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-300/50"
    >
      <span aria-hidden>{ICON[file.kind] ?? "📎"}</span>
      <span className="truncate">{file.name}</span>
      <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.sizeBytes)}</span>
    </button>
  );
}

export function UsageBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>
          {formatBytes(used)} of {formatBytes(cap)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${pct > 90 ? "bg-rose-400" : pct > 70 ? "bg-amber-300" : "bg-cyan-300"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
