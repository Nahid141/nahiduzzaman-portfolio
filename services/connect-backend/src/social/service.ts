import { and, asc, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { meetingRequests, notifications, tasks, userAvatars, users, type User } from "../db/schema.js";
import { ChatError, isBlockedBetween } from "../chat/service.js";

type Actor = Pick<User, "id" | "role">;

/* ------------------------------------ Profile ------------------------------------ */

export const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(100),
  bio: z.string().trim().max(500).nullable().optional(),
  statusEmoji: z.string().trim().max(16).nullable().optional(),
  statusText: z.string().trim().max(80).nullable().optional(),
});

export async function updateProfile(db: Db, user: Actor, input: z.infer<typeof profileSchema>, now: Date) {
  const [u] = await db
    .update(users)
    .set({
      fullName: input.fullName,
      ...(input.bio !== undefined ? { bio: input.bio || null } : {}),
      ...(input.statusEmoji !== undefined ? { statusEmoji: input.statusEmoji || null } : {}),
      ...(input.statusText !== undefined ? { statusText: input.statusText || null } : {}),
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
    .returning();
  return u!;
}

export const AVATAR_MAX_BYTES = 200 * 1024;

/** The browser compresses photos before upload; the server still checks size and the real image type. */
export function sniffImage(data: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length > 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function setAvatar(db: Db, user: Actor, data: Buffer, now: Date) {
  if (data.length > AVATAR_MAX_BYTES) throw new ChatError("avatar_too_large", 413);
  const mime = sniffImage(data);
  if (!mime) throw new ChatError("avatar_not_image", 422);
  await db
    .insert(userAvatars)
    .values({ userId: user.id, mime, data, updatedAt: now })
    .onConflictDoUpdate({ target: userAvatars.userId, set: { mime, data, updatedAt: now } });
  const key = now.getTime().toString(36);
  await db.update(users).set({ avatarKey: key, updatedAt: now }).where(eq(users.id, user.id));
  return key;
}

export async function removeAvatar(db: Db, user: Actor, now: Date) {
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  await db.update(users).set({ avatarKey: null, updatedAt: now }).where(eq(users.id, user.id));
}

export async function getAvatar(db: Db, userId: string) {
  const [a] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
  return a ?? null;
}

/* -------------------------------------- Buzz -------------------------------------- */

/** Checks that a buzz may be sent; the caller relays it. Only administrators may buzz everyone. */
export async function checkBuzz(db: Db, from: Actor, target: { userId: string } | { everyone: true }) {
  if ("everyone" in target) {
    if (from.role !== "admin") throw new ChatError("forbidden", 403);
    return;
  }
  if (target.userId === from.id) throw new ChatError("invalid_target", 422);
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, target.userId), eq(users.status, "active"))).limit(1);
  if (!u) throw new ChatError("not_found", 404);
  if (await isBlockedBetween(db, from.id, target.userId)) throw new ChatError("blocked", 403);
}

/* ------------------------------------- To-do list ------------------------------------- */

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "Write the task").max(300),
  dueAt: z.coerce.date().nullable().optional(),
  visibility: z.enum(["public", "admin"]).default("public"),
});
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  done: z.boolean().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  highlight: z.boolean().optional(),
});

const MAX_OPEN_TASKS = 500;

export async function listTasks(db: Db, user: Actor, now: Date) {
  // Completed items stay visible for 14 days, then drop off the list.
  const recent = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      visibility: tasks.visibility,
      highlight: tasks.highlight,
      dueAt: tasks.dueAt,
      doneAt: tasks.doneAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      meetingRequestId: tasks.meetingRequestId,
      createdBy: users.username,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.createdBy))
    .where(and(user.role === "admin" ? undefined : eq(tasks.visibility, "public"), or(isNull(tasks.doneAt), gt(tasks.doneAt, recent))))
    .orderBy(sql`${tasks.doneAt} is not null`, desc(tasks.highlight), sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
    .limit(400);
  return rows;
}

async function visibleTask(db: Db, user: Actor, id: string) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!t || (t.visibility === "admin" && user.role !== "admin")) throw new ChatError("not_found", 404);
  return t;
}

export async function createTask(db: Db, user: Actor, input: z.infer<typeof taskCreateSchema>, now: Date) {
  const visibility = user.role === "admin" ? input.visibility : "public";
  const [open] = await db.select({ n: sql<string>`count(*)` }).from(tasks).where(isNull(tasks.doneAt));
  if (Number(open!.n) >= MAX_OPEN_TASKS) throw new ChatError("too_many_tasks", 429);
  const [t] = await db
    .insert(tasks)
    .values({ title: input.title, dueAt: input.dueAt ?? null, visibility, createdBy: user.id, updatedBy: user.id, createdAt: now, updatedAt: now })
    .returning();
  return t!;
}

export async function updateTask(db: Db, user: Actor, id: string, input: z.infer<typeof taskUpdateSchema>, now: Date) {
  const t = await visibleTask(db, user, id);
  if (input.highlight !== undefined && user.role !== "admin") throw new ChatError("forbidden", 403);
  const [u] = await db
    .update(tasks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      ...(input.highlight !== undefined ? { highlight: input.highlight } : {}),
      ...(input.done === true && !t.doneAt ? { doneAt: now, doneBy: user.id } : {}),
      ...(input.done === false ? { doneAt: null, doneBy: null } : {}),
      updatedBy: user.id,
      updatedAt: now,
    })
    .where(eq(tasks.id, id))
    .returning();
  return { before: t, after: u! };
}

export async function deleteTask(db: Db, user: Actor, id: string) {
  const t = await visibleTask(db, user, id);
  await db.delete(tasks).where(eq(tasks.id, id));
  return t;
}

/* ---------------------------------- Meeting requests ---------------------------------- */

export const meetingRequestSchema = z.object({
  kind: z.enum(["meeting", "coffee"]).default("meeting"),
  topic: z.string().trim().min(1, "Add a topic").max(200),
  message: z.string().trim().max(1000).default(""),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().min(15).max(240),
});

const MAX_PENDING_REQUESTS = 3;

export async function createMeetingRequest(db: Db, user: Actor, input: z.infer<typeof meetingRequestSchema>, now: Date) {
  const lead = input.startsAt.getTime() - now.getTime();
  if (lead < 30 * 60_000) throw new ChatError("request_too_soon", 422);
  if (lead > 120 * 86_400_000) throw new ChatError("request_too_far", 422);
  const [p] = await db
    .select({ n: sql<string>`count(*)` })
    .from(meetingRequests)
    .where(and(eq(meetingRequests.requestedBy, user.id), eq(meetingRequests.status, "pending")));
  if (Number(p!.n) >= MAX_PENDING_REQUESTS) throw new ChatError("too_many_pending_requests", 429);
  const [r] = await db.insert(meetingRequests).values({ ...input, requestedBy: user.id, createdAt: now }).returning();
  return r!;
}

const requestColumns = {
  id: meetingRequests.id,
  kind: meetingRequests.kind,
  topic: meetingRequests.topic,
  message: meetingRequests.message,
  startsAt: meetingRequests.startsAt,
  durationMin: meetingRequests.durationMin,
  status: meetingRequests.status,
  decisionNote: meetingRequests.decisionNote,
  decidedAt: meetingRequests.decidedAt,
  createdAt: meetingRequests.createdAt,
  requestedById: meetingRequests.requestedBy,
  requestedBy: users.username,
  requesterName: users.fullName,
};

export async function listMeetingRequests(db: Db, user: Actor) {
  return db
    .select(requestColumns)
    .from(meetingRequests)
    .innerJoin(users, eq(users.id, meetingRequests.requestedBy))
    .where(user.role === "admin" ? undefined : eq(meetingRequests.requestedBy, user.id))
    .orderBy(sql`${meetingRequests.status} <> 'pending'`, asc(meetingRequests.startsAt))
    .limit(200);
}

/**
 * Calendar entries between two instants. Members see approved slots as "Busy" (no names or topics) plus their own
 * requests; administrators see everything.
 */
export async function calendar(db: Db, user: Actor, from: Date, to: Date) {
  const rows = await db
    .select(requestColumns)
    .from(meetingRequests)
    .innerJoin(users, eq(users.id, meetingRequests.requestedBy))
    .where(
      and(
        lt(meetingRequests.startsAt, to),
        gt(sql`${meetingRequests.startsAt} + make_interval(mins => ${meetingRequests.durationMin})`, from),
        or(eq(meetingRequests.status, "approved"), and(eq(meetingRequests.status, "pending"), user.role === "admin" ? undefined : eq(meetingRequests.requestedBy, user.id)))
      )
    )
    .orderBy(asc(meetingRequests.startsAt));
  return rows.map((r) =>
    user.role === "admin" || r.requestedById === user.id
      ? { ...r, mine: r.requestedById === user.id }
      : { id: r.id, startsAt: r.startsAt, durationMin: r.durationMin, status: r.status, kind: null, topic: "Busy", mine: false }
  );
}

const overlaps = (startsAt: Date, durationMin: number) =>
  and(
    lt(meetingRequests.startsAt, new Date(startsAt.getTime() + durationMin * 60_000)),
    gt(sql`${meetingRequests.startsAt} + make_interval(mins => ${meetingRequests.durationMin})`, startsAt)
  );

export async function decideMeetingRequest(db: Db, admin: Actor, id: string, decision: "approve" | "decline", note: string, now: Date) {
  if (admin.role !== "admin") throw new ChatError("forbidden", 403);
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(meetingRequests).where(eq(meetingRequests.id, id)).for("update").limit(1);
    if (!r) throw new ChatError("not_found", 404);
    if (r.status !== "pending") throw new ChatError("not_pending", 409);
    let taskId: string | null = null;
    if (decision === "approve") {
      const clash = await tx
        .select({ id: meetingRequests.id })
        .from(meetingRequests)
        .where(and(eq(meetingRequests.status, "approved"), ne(meetingRequests.id, id), overlaps(r.startsAt, r.durationMin)))
        .limit(1);
      if (clash.length) throw new ChatError("slot_taken", 409);
      const [u] = await tx.select({ username: users.username }).from(users).where(eq(users.id, r.requestedBy)).limit(1);
      // The approved request becomes a highlighted, administrator-only item on the to-do list.
      const [t] = await tx
        .insert(tasks)
        .values({
          title: `${r.kind === "coffee" ? "☕ Coffee" : "📅 Meeting"} with @${u?.username ?? "member"}: ${r.topic}`.slice(0, 300),
          visibility: "admin",
          highlight: true,
          dueAt: r.startsAt,
          meetingRequestId: r.id,
          createdBy: admin.id,
          updatedBy: admin.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      taskId = t!.id;
    }
    const [updated] = await tx
      .update(meetingRequests)
      .set({ status: decision === "approve" ? "approved" : "declined", decisionNote: note, decidedBy: admin.id, decidedAt: now })
      .where(eq(meetingRequests.id, id))
      .returning();
    await tx.insert(notifications).values({
      userId: r.requestedBy,
      kind: "meeting_request_decided",
      payload: { requestId: r.id, decision, kind: r.kind, topic: r.topic, startsAt: r.startsAt.toISOString(), note },
      createdAt: now,
    });
    return { request: updated!, taskId };
  });
}

/** The requester (or an admin) cancels; an approved slot's admin to-do item is removed with it. */
export async function cancelMeetingRequest(db: Db, user: Actor, id: string) {
  const [r] = await db.select().from(meetingRequests).where(eq(meetingRequests.id, id)).limit(1);
  if (!r || (r.requestedBy !== user.id && user.role !== "admin")) throw new ChatError("not_found", 404);
  if (!["pending", "approved"].includes(r.status)) throw new ChatError("not_cancellable", 409);
  await db.update(meetingRequests).set({ status: "cancelled" }).where(eq(meetingRequests.id, id));
  await db.delete(tasks).where(eq(tasks.meetingRequestId, id));
  return r;
}

export async function adminIds(db: Db) {
  return (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")))).map((a) => a.id);
}

