import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { files, type FileRow, type User } from "../db/schema.js";
import { accessibleRooms, canAccess, ChatError, targetSchema, type Target } from "../chat/service.js";
import { consume } from "../lib/usage.js";
import { getSettings, HARD_MAX_FILE_BYTES, type Settings } from "../settings.js";
import type { FileStore } from "./storage.js";
import { FILE_RULES, extensionOf, ruleFor, safeName, type FileKind } from "./types.js";

type Actor = Pick<User, "id" | "role">;

export type HashScanner = { lookup(sha256: string): Promise<"clean" | "malware" | "unknown"> };

export type FileDeps = { db: Db; files: FileStore | null; scanner?: HashScanner; now: () => Date };

export const DOWNLOAD_URL_SECONDS = 300;
/** Uploads that are not completed within this window are deleted. */
export const PENDING_TTL_MS = 2 * 3600 * 1000;

export const uploadSchema = z.object({
  target: targetSchema,
  name: z.string().min(1).max(200),
  size: z.number().int().positive().max(HARD_MAX_FILE_BYTES),
  mime: z.string().max(120),
  folder: z.string().trim().max(60).regex(/^[\p{L}\p{N} _.-]*$/u).default(""),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type FileDto = {
  id: string;
  name: string;
  mime: string;
  kind: FileKind;
  folder: string;
  sizeBytes: number;
  status: FileRow["status"];
  scan: string;
  target: Target;
  ownerId: string | null;
  preview: boolean;
  createdAt: Date;
  expiresAt: Date | null;
};

export const toFileDto = (f: FileRow): FileDto => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  kind: f.kind,
  folder: f.folder,
  sizeBytes: f.sizeBytes,
  status: f.status,
  scan: f.scan,
  target: f.channelId ? { kind: "channel", id: f.channelId } : { kind: "conversation", id: f.conversationId! },
  ownerId: f.ownerId,
  preview: FILE_RULES[extensionOf(f.name)]?.preview ?? false,
  createdAt: f.createdAt,
  expiresAt: f.expiresAt,
});

const targetOf = (f: FileRow): Target =>
  f.channelId ? { kind: "channel", id: f.channelId } : { kind: "conversation", id: f.conversationId! };

function store(deps: FileDeps) {
  if (!deps.files) throw new ChatError("storage_unavailable", 503);
  return deps.files;
}

export function kindLimit(s: Settings, kind: FileKind) {
  const limit = { image: s.maxImageBytes, document: s.maxDocumentBytes, audio: s.maxAudioBytes, video: s.maxVideoBytes, archive: s.maxArchiveBytes }[kind];
  return Math.min(limit, HARD_MAX_FILE_BYTES);
}

/** Bytes held by live and in-flight uploads (pending uploads reserve their declared size). */
export async function storageUsed(db: Db, ownerId?: string) {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
    .from(files)
    .where(and(inArray(files.status, ["pending", "ready"]), ownerId ? eq(files.ownerId, ownerId) : undefined));
  return Number(row?.total ?? 0);
}

export async function requestUpload(deps: FileDeps, user: Actor, input: z.infer<typeof uploadSchema>) {
  const fs = store(deps);
  const settings = await getSettings(deps.db);
  if (!settings.uploadsEnabled && user.role !== "admin") throw new ChatError("uploads_disabled", 403);
  if (!(await canAccess(deps.db, user, input.target))) throw new ChatError("not_found", 404);

  const name = safeName(input.name);
  const rule = ruleFor(name, input.mime);
  if (!rule) throw new ChatError("file_type_not_allowed", 415);
  if (input.size > kindLimit(settings, rule.kind)) throw new ChatError("file_too_large", 413);

  const id = randomUUID();
  const objectPath = `${input.target.kind === "channel" ? "ch" : "cv"}/${input.target.id}/${id}`;
  const now = deps.now();

  // Serialise quota checks so two simultaneous uploads cannot both squeeze under the cap.
  const row = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('connect.files.quota'))`);
    if ((await storageUsed(tx as unknown as Db)) + input.size > settings.storageTotalBytes) throw new ChatError("storage_full", 507);
    if ((await storageUsed(tx as unknown as Db, user.id)) + input.size > settings.storagePerUserBytes) {
      throw new ChatError("user_quota_exceeded", 413);
    }
    const [r] = await tx
      .insert(files)
      .values({
        id,
        ownerId: user.id,
        channelId: input.target.kind === "channel" ? input.target.id : null,
        conversationId: input.target.kind === "conversation" ? input.target.id : null,
        objectPath,
        name,
        mime: rule.mime,
        kind: rule.kind,
        folder: input.folder,
        sizeBytes: input.size,
        expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86_400_000) : null,
        createdAt: now,
      })
      .returning();
    return r!;
  });

  try {
    const uploadUrl = await fs.signedUploadUrl(objectPath);
    return { file: toFileDto(row), uploadUrl, uploadHeaders: { "content-type": rule.mime, "x-upsert": "false" } };
  } catch (err) {
    await deps.db.update(files).set({ status: "deleted", deletedAt: now }).where(eq(files.id, id));
    throw err;
  }
}

/** Verifies the stored bytes (size, signature, hash) before anyone else can see the file. */
export async function completeUpload(deps: FileDeps, user: Actor, id: string) {
  const fs = store(deps);
  const [f] = await deps.db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!f || f.ownerId !== user.id || f.status === "deleted") throw new ChatError("not_found", 404);
  if (f.status !== "pending") return toFileDto(f);

  const settings = await getSettings(deps.db);
  const stream = await fs.open(f.objectPath);
  if (!stream) throw new ChatError("upload_missing", 409);

  // Reading back counts against Supabase egress too.
  await consume(deps.db, "egress_bytes", deps.now(), f.sizeBytes, Number.MAX_SAFE_INTEGER);

  const limit = Math.min(f.sizeBytes, kindLimit(settings, f.kind));
  const hash = createHash("sha256");
  let size = 0;
  let head = Buffer.alloc(0);
  let tooBig = false;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) {
      tooBig = true;
      break;
    }
    if (head.length < 4096) head = Buffer.concat([head, Buffer.from(chunk)]).subarray(0, 4096);
    hash.update(chunk);
  }

  const rule = FILE_RULES[extensionOf(f.name)];
  let reason: string | null = null;
  if (tooBig || size !== f.sizeBytes) reason = "size_mismatch";
  else if (!rule || !rule.sniff(head)) reason = "signature_mismatch";

  const sha256 = reason ? null : hash.digest("hex");
  let scan = "not_scanned";
  if (sha256 && deps.scanner) {
    const verdict = await deps.scanner.lookup(sha256).catch(() => "unknown" as const);
    if (verdict === "malware") reason = "malware";
    scan = verdict === "clean" ? "hash_clean" : verdict === "malware" ? "malware" : "hash_unknown";
  }

  if (reason) {
    await fs.remove([f.objectPath]);
    const [r] = await deps.db
      .update(files)
      .set({ status: "rejected", rejectReason: reason, scan, deletedAt: deps.now() })
      .where(eq(files.id, id))
      .returning();
    throw Object.assign(new ChatError(`upload_rejected_${reason}`, 422), { file: toFileDto(r!) });
  }
  const [r] = await deps.db
    .update(files)
    .set({ status: "ready", sha256, scan, readyAt: deps.now() })
    .where(eq(files.id, id))
    .returning();
  return toFileDto(r!);
}

async function visibleFile(deps: FileDeps, user: Actor, id: string) {
  const [f] = await deps.db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!f || f.status !== "ready") throw new ChatError("not_found", 404);
  if (f.expiresAt && f.expiresAt <= deps.now()) throw new ChatError("not_found", 404);
  if (!(await canAccess(deps.db, user, targetOf(f)))) throw new ChatError("not_found", 404);
  return f;
}

export async function getFile(deps: FileDeps, user: Actor, id: string) {
  return toFileDto(await visibleFile(deps, user, id));
}

/** Authorises, charges the egress quota, then signs a short-lived URL. */
export async function downloadUrl(deps: FileDeps, user: Actor, id: string, opts: { inline?: boolean } = {}) {
  const fs = store(deps);
  const f = await visibleFile(deps, user, id);
  const settings = await getSettings(deps.db);
  if (!(await consume(deps.db, "egress_bytes", deps.now(), f.sizeBytes, settings.egressMonthlyBytes))) {
    throw new ChatError("egress_quota_exceeded", 429);
  }
  const previewable = FILE_RULES[extensionOf(f.name)]?.preview ?? false;
  // Anything that is not a known-safe media type is always sent as an attachment.
  const url = await fs.signedDownloadUrl(f.objectPath, DOWNLOAD_URL_SECONDS, opts.inline && previewable ? undefined : f.name);
  return { url, expiresIn: DOWNLOAD_URL_SECONDS, file: toFileDto(f) };
}

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(["image", "document", "audio", "video", "archive"]).optional(),
  folder: z.string().max(60).optional(),
  targetKind: z.enum(["channel", "conversation"]).optional(),
  targetId: z.uuid().optional(),
  mine: z.coerce.boolean().optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Ready files in rooms the caller can see. */
export async function listFiles(deps: FileDeps, user: Actor, q: z.infer<typeof listQuery>) {
  const rooms = await accessibleRooms(deps.db, user);
  let channelIds = rooms.filter((r) => r.startsWith("ch:")).map((r) => r.slice(3));
  let conversationIds = rooms.filter((r) => r.startsWith("cv:")).map((r) => r.slice(3));
  if (q.targetKind) {
    channelIds = q.targetKind === "channel" ? channelIds.filter((x) => !q.targetId || x === q.targetId) : [];
    conversationIds = q.targetKind === "conversation" ? conversationIds.filter((x) => !q.targetId || x === q.targetId) : [];
  }
  const roomFilter = [
    channelIds.length ? inArray(files.channelId, channelIds) : undefined,
    conversationIds.length ? inArray(files.conversationId, conversationIds) : undefined,
  ].filter(Boolean);
  if (!roomFilter.length) return [];
  const now = deps.now();
  const rows = await deps.db
    .select()
    .from(files)
    .where(
      and(
        eq(files.status, "ready"),
        or(...roomFilter),
        or(sql`${files.expiresAt} is null`, sql`${files.expiresAt} > ${now}`),
        q.q ? ilike(files.name, `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined,
        q.kind ? eq(files.kind, q.kind) : undefined,
        q.folder !== undefined ? eq(files.folder, q.folder) : undefined,
        q.mine ? eq(files.ownerId, user.id) : undefined,
        q.before ? lt(files.createdAt, new Date(q.before)) : undefined
      )
    )
    .orderBy(desc(files.createdAt))
    .limit(q.limit);
  return rows.map(toFileDto);
}

/** The owner may delete; an administrator may moderate files in shared channels, not private conversations. */
export async function deleteFile(deps: FileDeps, user: Actor, id: string) {
  const fs = store(deps);
  const [f] = await deps.db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!f || f.status === "deleted") throw new ChatError("not_found", 404);
  const owner = f.ownerId === user.id;
  const moderator = user.role === "admin" && f.channelId !== null;
  if (!owner && !moderator) {
    if (await canAccess(deps.db, user, targetOf(f))) throw new ChatError("forbidden", 403);
    throw new ChatError("not_found", 404);
  }
  await fs.remove([f.objectPath]);
  const [r] = await deps.db.update(files).set({ status: "deleted", deletedAt: deps.now() }).where(eq(files.id, id)).returning();
  return { file: toFileDto(r!), moderated: !owner };
}

/** Removes abandoned uploads and expired files. Safe to run repeatedly. */
export async function cleanupFiles(deps: FileDeps) {
  if (!deps.files) return { removed: 0 };
  const now = deps.now();
  const stale = await deps.db
    .select()
    .from(files)
    .where(
      or(
        and(eq(files.status, "pending"), lt(files.createdAt, new Date(now.getTime() - PENDING_TTL_MS))),
        and(ne(files.status, "deleted"), lt(files.expiresAt, now))
      )
    )
    .limit(200);
  if (!stale.length) return { removed: 0 };
  await deps.files.remove(stale.map((f) => f.objectPath));
  await deps.db
    .update(files)
    .set({ status: "deleted", deletedAt: now })
    .where(inArray(files.id, stale.map((f) => f.id)));
  return { removed: stale.length };
}

export async function storageSummary(db: Db) {
  const [row] = await db
    .select({
      readyBytes: sql<string>`coalesce(sum(${files.sizeBytes}) filter (where ${files.status} = 'ready'), 0)`,
      pendingBytes: sql<string>`coalesce(sum(${files.sizeBytes}) filter (where ${files.status} = 'pending'), 0)`,
      readyCount: sql<string>`count(*) filter (where ${files.status} = 'ready')`,
    })
    .from(files);
  return { readyBytes: Number(row!.readyBytes), pendingBytes: Number(row!.pendingBytes), readyCount: Number(row!.readyCount) };
}

/** Hash-only lookup: the file contents never leave our storage. */
export class VirusTotalHashScanner implements HashScanner {
  constructor(private apiKey: string, private fetchImpl: typeof fetch = fetch) {}
  async lookup(sha256: string) {
    const res = await this.fetchImpl(`https://www.virustotal.com/api/v3/files/${sha256}`, {
      headers: { "x-apikey": this.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return "unknown" as const;
    if (!res.ok) return "unknown" as const;
    const body = (await res.json()) as { data?: { attributes?: { last_analysis_stats?: { malicious?: number } } } };
    return (body.data?.attributes?.last_analysis_stats?.malicious ?? 0) > 0 ? ("malware" as const) : ("clean" as const);
  }
}
