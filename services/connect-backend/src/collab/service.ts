import { and, asc, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import {
  activity,
  announcements,
  channels,
  djGrants,
  files,
  musicRequests,
  pollVotes,
  polls,
  users,
  type User,
} from "../db/schema.js";
import { canAccess, ChatError, targetSchema, type Target } from "../chat/service.js";
import { getSettings } from "../settings.js";
import { readState, writeState, type LoungeState, type PresentationState } from "./state.js";

type Actor = Pick<User, "id" | "role">;

/** Lead time so every listener can buffer before the server-authorised start instant. */
export const START_LEAD_MS = 1500;

/* --------------------------------- Permissions --------------------------------- */

export async function activeDj(db: Db, userId: string, now: Date) {
  const [g] = await db
    .select()
    .from(djGrants)
    .where(and(eq(djGrants.userId, userId), isNull(djGrants.revokedAt), gt(djGrants.expiresAt, now)))
    .limit(1);
  return g ?? null;
}

/** Administrators and members with an unexpired DJ grant control the lounge and presentations. */
export async function canControl(db: Db, user: Actor, now: Date) {
  return user.role === "admin" || Boolean(await activeDj(db, user.id, now));
}

async function assertControl(db: Db, user: Actor, now: Date) {
  if (!(await canControl(db, user, now))) throw new ChatError("forbidden", 403);
}

/** Shared playback uses files from public channels only, so every listener is allowed to fetch them. */
async function sharedFile(db: Db, user: Actor, fileId: string) {
  const [f] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!f || f.status !== "ready" || !f.channelId) throw new ChatError("file_not_shareable", 422);
  const [ch] = await db.select().from(channels).where(eq(channels.id, f.channelId)).limit(1);
  if (!ch || ch.kind !== "public" || ch.archivedAt) throw new ChatError("file_not_shareable", 422);
  if (!(await canAccess(db, user, { kind: "channel", id: f.channelId }))) throw new ChatError("not_found", 404);
  return f;
}

export async function grantDj(db: Db, admin: Actor, userId: string, minutes: number, now: Date) {
  if (admin.role !== "admin") throw new ChatError("forbidden", 403);
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1);
  if (!u) throw new ChatError("not_found", 404);
  await db.update(djGrants).set({ revokedAt: now }).where(and(eq(djGrants.userId, userId), isNull(djGrants.revokedAt)));
  const [g] = await db
    .insert(djGrants)
    .values({ userId, grantedBy: admin.id, expiresAt: new Date(now.getTime() + minutes * 60_000), createdAt: now })
    .returning();
  return g!;
}

export async function revokeDj(db: Db, admin: Actor, userId: string, now: Date) {
  if (admin.role !== "admin") throw new ChatError("forbidden", 403);
  await db.update(djGrants).set({ revokedAt: now }).where(and(eq(djGrants.userId, userId), isNull(djGrants.revokedAt)));
}

export async function listDjs(db: Db, now: Date) {
  return db
    .select({ userId: djGrants.userId, username: users.username, expiresAt: djGrants.expiresAt })
    .from(djGrants)
    .innerJoin(users, eq(users.id, djGrants.userId))
    .where(and(isNull(djGrants.revokedAt), gt(djGrants.expiresAt, now)));
}

/* --------------------------------- Music lounge --------------------------------- */

export async function requestTrack(db: Db, user: Actor, fileId: string, note: string, now: Date) {
  const s = await getSettings(db);
  if (!s.musicRequestsEnabled && user.role !== "admin") throw new ChatError("music_requests_disabled", 403);
  const f = await sharedFile(db, user, fileId);
  if (f.kind !== "audio") throw new ChatError("not_audio", 422);
  const pending = await db
    .select({ n: sql<string>`count(*)` })
    .from(musicRequests)
    .where(and(eq(musicRequests.requestedBy, user.id), eq(musicRequests.status, "pending")));
  if (Number(pending[0]!.n) >= 5) throw new ChatError("too_many_pending_requests", 429);
  const [r] = await db.insert(musicRequests).values({ fileId, requestedBy: user.id, note, createdAt: now }).returning();
  return r!;
}

export async function queueView(db: Db) {
  const rows = await db
    .select({
      id: musicRequests.id,
      status: musicRequests.status,
      position: musicRequests.position,
      note: musicRequests.note,
      createdAt: musicRequests.createdAt,
      fileId: files.id,
      title: files.name,
      sizeBytes: files.sizeBytes,
      requestedBy: users.username,
    })
    .from(musicRequests)
    .innerJoin(files, eq(files.id, musicRequests.fileId))
    .leftJoin(users, eq(users.id, musicRequests.requestedBy))
    .where(and(inArray(musicRequests.status, ["pending", "queued", "played"]), eq(files.status, "ready")))
    .orderBy(asc(musicRequests.position), asc(musicRequests.createdAt))
    .limit(200);
  return {
    pending: rows.filter((r) => r.status === "pending"),
    queued: rows.filter((r) => r.status === "queued"),
    recent: rows
      .filter((r) => r.status === "played")
      .sort((a, b) => +b.createdAt - +a.createdAt)
      .slice(0, 10),
  };
}

async function nextPosition(db: Db, front = false) {
  const [row] = await db
    .select({ hi: max(musicRequests.position), lo: sql<number>`min(${musicRequests.position})` })
    .from(musicRequests)
    .where(eq(musicRequests.status, "queued"));
  return front ? (row?.lo ?? 1) - 1 : (row?.hi ?? 0) + 1;
}

export async function decideRequest(db: Db, user: Actor, id: string, decision: "queue" | "reject" | "play_next", now: Date) {
  await assertControl(db, user, now);
  const [r] = await db.select().from(musicRequests).where(eq(musicRequests.id, id)).limit(1);
  if (!r || r.status !== "pending") throw new ChatError("not_pending", 409);
  if (decision === "reject") {
    await db.update(musicRequests).set({ status: "rejected", decidedBy: user.id, decidedAt: now }).where(eq(musicRequests.id, id));
  } else {
    const position = await nextPosition(db, decision === "play_next");
    await db.update(musicRequests).set({ status: "queued", position, decidedBy: user.id, decidedAt: now }).where(eq(musicRequests.id, id));
  }
  return r;
}

export const loungeControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("play"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("pause"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("stop"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("seek"), positionMs: z.number().min(0), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("next"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("previous"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("repeat"), on: z.boolean(), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("shuffle"), on: z.boolean(), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("remove"), requestId: z.uuid() }),
  /* Any listener may report these; they only take effect when consistent with the state. */
  z.object({ action: z.literal("duration"), requestId: z.uuid(), durationMs: z.number().min(1000).max(4 * 3600_000) }),
  z.object({ action: z.literal("ended"), requestId: z.uuid(), expectedVersion: z.number().int() }),
]);

const positionAt = (s: { status: string; anchorMs: number | null; positionMs: number }, nowMs: number) =>
  s.status === "playing" && s.anchorMs !== null ? Math.max(0, nowMs - s.anchorMs) : s.positionMs;

async function pickNext(db: Db, shuffle: boolean) {
  const queued = await db
    .select({ id: musicRequests.id, fileId: musicRequests.fileId, title: files.name })
    .from(musicRequests)
    .innerJoin(files, eq(files.id, musicRequests.fileId))
    .where(and(eq(musicRequests.status, "queued"), eq(files.status, "ready")))
    .orderBy(asc(musicRequests.position));
  if (!queued.length) return null;
  return shuffle ? queued[Math.floor(Math.random() * queued.length)]! : queued[0]!;
}

export async function loungeControl(db: Db, user: Actor, input: z.infer<typeof loungeControlSchema>, now: Date) {
  const nowMs = now.getTime();
  if (input.action === "duration") {
    return writeState(db, "lounge", (s) => (s.requestId === input.requestId && s.durationMs === null ? { ...s, durationMs: input.durationMs } : s), { by: user.id, now });
  }
  if (input.action === "ended") {
    const cur = await readState(db, "lounge");
    const s = cur.state;
    const ended = s.status === "playing" && s.requestId === input.requestId && s.durationMs !== null && positionAt(s, nowMs) >= s.durationMs - 3000;
    if (!ended && !(await canControl(db, user, now))) return cur;
    if (cur.version !== input.expectedVersion) return cur; // someone already advanced
    return advance(db, user, cur.version, s, now);
  }
  await assertControl(db, user, now);

  if (input.action === "remove") {
    await db.update(musicRequests).set({ status: "removed", decidedBy: user.id, decidedAt: now }).where(eq(musicRequests.id, input.requestId));
    return readState(db, "lounge");
  }
  if (input.action === "next") return advance(db, user, input.expectedVersion, (await readState(db, "lounge")).state, now);
  if (input.action === "previous") {
    const cur = await readState(db, "lounge");
    const prevId = cur.state.history.at(-1);
    if (!prevId) throw new ChatError("no_previous", 409);
    const position = await nextPosition(db, true);
    await db.update(musicRequests).set({ status: "queued", position }).where(eq(musicRequests.id, prevId));
    if (cur.state.requestId) {
      const back = await nextPosition(db, true);
      await db.update(musicRequests).set({ status: "queued", position: back + 1 }).where(eq(musicRequests.id, cur.state.requestId));
    }
    return advance(db, user, input.expectedVersion, { ...cur.state, requestId: null, history: cur.state.history.slice(0, -1) }, now);
  }
  if (input.action === "play") {
    const cur = await readState(db, "lounge");
    if (cur.state.status === "stopped" || !cur.state.requestId) return advance(db, user, input.expectedVersion, cur.state, now);
  }
  return writeState(
    db,
    "lounge",
    (s): LoungeState => {
      switch (input.action) {
        case "play":
          return s.status === "playing" ? s : { ...s, status: "playing", anchorMs: nowMs + START_LEAD_MS - s.positionMs, controllerId: user.id };
        case "pause":
          return s.status !== "playing" ? s : { ...s, status: "paused", positionMs: positionAt(s, nowMs), anchorMs: null, controllerId: user.id };
        case "stop":
          return { ...s, status: "stopped", anchorMs: null, positionMs: 0, controllerId: user.id };
        case "seek":
          return s.status === "playing"
            ? { ...s, anchorMs: nowMs + START_LEAD_MS - input.positionMs, controllerId: user.id }
            : { ...s, positionMs: input.positionMs, controllerId: user.id };
        case "repeat":
          return { ...s, repeat: input.on };
        case "shuffle":
          return { ...s, shuffle: input.on };
      }
    },
    { by: user.id, expected: input.expectedVersion, now }
  );
}

/** Finishes the current track and starts the next one at a server-chosen instant. */
async function advance(db: Db, user: Actor, expected: number, s: LoungeState, now: Date) {
  const nowMs = now.getTime();
  let history = s.history;
  if (s.requestId) {
    if (s.repeat) {
      return writeState(db, "lounge", (c) => ({ ...c, status: "playing", anchorMs: nowMs + START_LEAD_MS, positionMs: 0, controllerId: user.id }), { by: user.id, expected, now });
    }
    await db.update(musicRequests).set({ status: "played" }).where(eq(musicRequests.id, s.requestId));
    history = [...history, s.requestId].slice(-20);
  }
  const next = await pickNext(db, s.shuffle);
  // The chosen track leaves the queue now; it shows under "recently played" from here on.
  if (next) await db.update(musicRequests).set({ status: "played" }).where(eq(musicRequests.id, next.id));
  return writeState(
    db,
    "lounge",
    (c): LoungeState =>
      next
        ? { ...c, requestId: next.id, fileId: next.fileId, title: next.title, status: "playing", anchorMs: nowMs + START_LEAD_MS, positionMs: 0, durationMs: null, controllerId: user.id, history }
        : { ...c, requestId: null, fileId: null, title: "", status: "stopped", anchorMs: null, positionMs: 0, durationMs: null, controllerId: user.id, history },
    { by: user.id, expected, now }
  );
}

/* ---------------------------------- Presentation ---------------------------------- */

export const presentControlSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), fileId: z.uuid().nullable(), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("stop"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("page"), page: z.number().int().min(1).max(10_000), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("play"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("pause"), expectedVersion: z.number().int() }),
  z.object({ action: z.literal("seek"), positionMs: z.number().min(0), expectedVersion: z.number().int() }),
]);

export async function presentControl(db: Db, user: Actor, input: z.infer<typeof presentControlSchema>, now: Date) {
  const cur = await readState(db, "presentation");
  const isPresenter = cur.state.active && cur.state.presenterId === user.id;
  if (!isPresenter) await assertControl(db, user, now);
  const nowMs = now.getTime();
  let started: Partial<PresentationState> = {};
  if (input.action === "start") {
    if (input.fileId) {
      const f = await sharedFile(db, user, input.fileId);
      const kind = f.mime === "application/pdf" ? "pdf" : f.kind === "video" ? "video" : f.kind === "image" ? "image" : f.kind === "audio" ? "audio" : null;
      if (!kind) throw new ChatError("not_presentable", 422);
      started = { fileId: f.id, kind, title: f.name };
    } else {
      started = { fileId: null, kind: "whiteboard", title: "Whiteboard" };
    }
  }
  return writeState(
    db,
    "presentation",
    (s): PresentationState => {
      switch (input.action) {
        case "start":
          return { ...s, ...started, active: true, page: 1, status: "paused", anchorMs: null, positionMs: 0, presenterId: user.id };
        case "stop":
          return { ...s, active: false, fileId: null, kind: null, title: "", presenterId: null, status: "paused", anchorMs: null, positionMs: 0 };
        case "page":
          return { ...s, page: input.page };
        case "play":
          return s.status === "playing" ? s : { ...s, status: "playing", anchorMs: nowMs + START_LEAD_MS - s.positionMs };
        case "pause":
          return s.status !== "playing" ? s : { ...s, status: "paused", positionMs: positionAt(s, nowMs), anchorMs: null };
        case "seek":
          return s.status === "playing" ? { ...s, anchorMs: nowMs + START_LEAD_MS - input.positionMs } : { ...s, positionMs: input.positionMs };
      }
    },
    { by: user.id, expected: input.expectedVersion, now }
  );
}

/* ------------------------------ Announcements, activity ------------------------------ */

export async function listAnnouncements(db: Db) {
  return db
    .select({ id: announcements.id, body: announcements.body, createdAt: announcements.createdAt, author: users.username })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.authorId))
    .where(isNull(announcements.deletedAt))
    .orderBy(desc(announcements.createdAt))
    .limit(20);
}

export async function listActivity(db: Db) {
  return db
    .select({ id: activity.id, kind: activity.kind, payload: activity.payload, createdAt: activity.createdAt, actor: users.username })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .orderBy(desc(activity.createdAt))
    .limit(30);
}

/* -------------------------------------- Polls -------------------------------------- */

export const pollSchema = z.object({
  target: targetSchema,
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(10),
  multiple: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  closesInMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

const pollTarget = (p: typeof polls.$inferSelect): Target =>
  p.channelId ? { kind: "channel", id: p.channelId } : { kind: "conversation", id: p.conversationId! };

export async function createPoll(db: Db, user: Actor, input: z.infer<typeof pollSchema>, now: Date) {
  if (!(await canAccess(db, user, input.target))) throw new ChatError("not_found", 404);
  const [p] = await db
    .insert(polls)
    .values({
      channelId: input.target.kind === "channel" ? input.target.id : null,
      conversationId: input.target.kind === "conversation" ? input.target.id : null,
      createdBy: user.id,
      question: input.question,
      options: input.options,
      multiple: input.multiple,
      anonymous: input.anonymous,
      closesAt: input.closesInMinutes ? new Date(now.getTime() + input.closesInMinutes * 60_000) : null,
      createdAt: now,
    })
    .returning();
  return pollDto(db, user, p!, now);
}

export async function pollDto(db: Db, user: Actor, p: typeof polls.$inferSelect, now: Date) {
  const votes = await db
    .select({ userId: pollVotes.userId, option: pollVotes.option, username: users.username })
    .from(pollVotes)
    .innerJoin(users, eq(users.id, pollVotes.userId))
    .where(eq(pollVotes.pollId, p.id));
  const closed = Boolean(p.closedAt) || (p.closesAt !== null && p.closesAt <= now);
  return {
    id: p.id,
    target: pollTarget(p),
    question: p.question,
    multiple: p.multiple,
    anonymous: p.anonymous,
    closed,
    closesAt: p.closesAt,
    createdBy: p.createdBy,
    createdAt: p.createdAt,
    voters: new Set(votes.map((v) => v.userId)).size,
    mine: votes.filter((v) => v.userId === user.id).map((v) => v.option),
    options: p.options.map((label, i) => {
      const vs = votes.filter((v) => v.option === i);
      return { label, count: vs.length, voters: p.anonymous ? [] : vs.map((v) => v.username) };
    }),
  };
}

async function visiblePoll(db: Db, user: Actor, id: string) {
  const [p] = await db.select().from(polls).where(eq(polls.id, id)).limit(1);
  if (!p || !(await canAccess(db, user, pollTarget(p)))) throw new ChatError("not_found", 404);
  return p;
}

export async function vote(db: Db, user: Actor, id: string, options: number[], now: Date) {
  const p = await visiblePoll(db, user, id);
  if (p.closedAt || (p.closesAt && p.closesAt <= now)) throw new ChatError("poll_closed", 409);
  const unique = [...new Set(options)];
  if (!p.multiple && unique.length > 1) throw new ChatError("single_choice", 400);
  if (unique.some((o) => o < 0 || o >= p.options.length)) throw new ChatError("invalid_option", 400);
  await db.delete(pollVotes).where(and(eq(pollVotes.pollId, id), eq(pollVotes.userId, user.id)));
  if (unique.length) await db.insert(pollVotes).values(unique.map((option) => ({ pollId: id, userId: user.id, option, createdAt: now })));
  return pollDto(db, user, p, now);
}

export async function closePoll(db: Db, user: Actor, id: string, now: Date) {
  const p = await visiblePoll(db, user, id);
  const moderator = user.role === "admin" && p.channelId !== null;
  if (p.createdBy !== user.id && !moderator) throw new ChatError("forbidden", 403);
  const [r] = await db.update(polls).set({ closedAt: now }).where(eq(polls.id, id)).returning();
  return pollDto(db, user, r!, now);
}

export async function listPolls(db: Db, user: Actor, target: Target, now: Date) {
  if (!(await canAccess(db, user, target))) throw new ChatError("not_found", 404);
  const rows = await db
    .select()
    .from(polls)
    .where(target.kind === "channel" ? eq(polls.channelId, target.id) : eq(polls.conversationId, target.id))
    .orderBy(desc(polls.createdAt))
    .limit(30);
  return Promise.all(rows.map((p) => pollDto(db, user, p, now)));
}

