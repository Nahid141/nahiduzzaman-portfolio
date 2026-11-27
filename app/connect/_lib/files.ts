"use client";

import { api, ApiError } from "./api";
import type { Target } from "./realtime";

export type FileKind = "image" | "document" | "audio" | "video" | "archive";

export type SharedFile = {
  id: string;
  name: string;
  mime: string;
  kind: FileKind;
  folder: string;
  sizeBytes: number;
  status: "pending" | "ready" | "rejected" | "deleted";
  scan: string;
  target: Target;
  ownerId: string | null;
  preview: boolean;
  createdAt: string;
  expiresAt: string | null;
};

export type Usage = {
  storageConfigured: boolean;
  uploadsEnabled: boolean;
  limits: Record<FileKind, number>;
  storage: { usedBytes: number; capBytes: number };
  mine: { usedBytes: number; capBytes: number };
  egress: { usedBytes: number; capBytes: number };
};

export const ACCEPT =
  ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.txt,.csv,.md,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm,.zip";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Bytes go straight from the browser to the private bucket; the backend then verifies them. */
export async function uploadFile(
  target: Target,
  file: File,
  opts: { folder?: string; expiresInDays?: number; onProgress?: (fraction: number) => void } = {}
): Promise<SharedFile> {
  const { file: meta, uploadUrl, uploadHeaders } = await api<{ file: SharedFile; uploadUrl: string; uploadHeaders: Record<string, string> }>(
    "/files/uploads",
    { body: { target, name: file.name, size: file.size, mime: file.type, folder: opts.folder ?? "", expiresInDays: opts.expiresInDays } }
  );
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    for (const [k, v] of Object.entries(uploadHeaders)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "upload_missing")));
    xhr.onerror = () => reject(new ApiError(0, "network"));
    xhr.send(file);
  });
  return api<SharedFile>(`/files/${meta.id}/complete`, { body: {} });
}

/** A short-lived signed URL (5 minutes). Fetch a fresh one each time a file is opened. */
export async function fileUrl(id: string, inline = false) {
  return (await api<{ url: string }>(`/files/${id}/url`, { body: { inline } })).url;
}

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Image",
  document: "Document",
  audio: "Audio",
  video: "Video",
  archive: "Archive",
};
