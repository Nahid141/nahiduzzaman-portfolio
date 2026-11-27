import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { meetingParticipants, meetings, users, type Meeting, type User } from "../db/schema.js";
import { ChatError } from "../chat/service.js";
import { getUsage, record } from "../lib/usage.js";
import { getSettings } from "../settings.js";
import type { LiveKitApi, LiveKitEvent, MediaSource } from "./livekit.js";

type Actor = Pick<User, "id" | "role" | "username">;

export type MeetingDeps = { db: Db; livekit: LiveKitApi | null; now: () => Date };

/** How long an issued join token holds a seat before LiveKit confirms the connection. */
export const RESERVATION_MS = 60_000;
export const TOKEN_TTL_SECONDS = 600;
/** A participant LiveKit never reported leaving is closed after this long (lost webhook). */
export const STALE_CONNECTION_MS = 4 * 3600_000;

export const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  audioOnly: z.boolean().default(false),
  inviteOnly: z.boolean().default(false),
  waitingRoom: z.boolean().default(false),
  screenShare: z.enum(["host", "all", "approved"]).default("all"),
  invitees: z.array(z.uuid()).max(20).default([]),
  scheduledFor: z.iso.datetime().optional(),
});

export const hostActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("admit"), userId: z.uuid() }),
  z.object({ action: z.literal("deny"), userId: z.uuid() }),
  z.object({ action: z.literal("remove"), userId: z.uuid() }),
  z.object({ action: z.literal("mute"), userId: z.uuid(), source: z.enum(["camera", "microphone"]) }),
  z.object({ action: z.literal("lock"), on: z.boolean() }),
  z.object({ action: z.literal("waiting_room"), on: z.boolean() }),
  z.object({ action: z.literal("screen_share_policy"), policy: z.enum(["host", "all", "approved"]) }),
  z.object({ action: z.literal("grant_screen_share"), userId: z.uuid(), on: z.boolean() }),
  z.object({ action: z.literal("transfer_host"), userId: z.uuid() }),
  z.object({ action: z.literal("invite"), userIds: z.array(z.uuid()).min(1).max(20) }),
  z.object({ action: z.literal("end") }),
]);

function lk(deps: MeetingDeps) {
  if (!deps.livekit) throw new ChatError("meetings_unavailable", 503);
  return deps.livekit;
}

async function meetingById(db: Db, id: string) {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  return m ?? null;
}

async function participant(db: Db, meetingId: string, userId: string) {
  const [p] = await db
    .select()
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId)))
    .limit(1);
  return p ?? null;
}

/** Who can see that a meeting exists: everyone for open meetings, invitees and the host otherwise. */
async function canSee(db: Db, user: Actor, m: Meeting) {
  if (!m.inviteOnly || m.hostId === user.id || m.createdBy === user.id) return true;
  return Boolean(await participant(db, m.id, user.id));
}

/** Seats taken: connected participants plus unexpired reservations, excluding `exceptUserId`. */
async function seatsTaken(db: Db, meetingId: string, now: Date, exceptUserId?: string) {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        eq(meetingParticipants.state, "admitted"),
        exceptUserId ? ne(meetingParticipants.userId, exceptUserId) : undefined,
        or(
          and(isNotNull(meetingParticipants.connectedAt), isNull(meetingParticipants.leftAt)),
          gt(meetingParticipants.reservedUntil, now)
        )
      )
    );
  return Number(row?.n ?? 0);
}

function sourcesFor(m: Meeting, isHost: boolean, canScreenShare: boolean): MediaSource[] {
  const base: MediaSource[] = m.audioOnly ? ["microphone"] : ["camera", "microphone"];
  const share = m.screenShare === "all" || isHost || (m.screenShare === "approved" && canScreenShare);
  return share ? [...base, "screen_share", "screen_share_audio"] : base;
}

export async function createMeeting(deps: MeetingDeps, user: Actor, input: z.infer<typeof createSchema>) {
  const live = lk(deps);
  const s = await getSettings(deps.db);
  if (!s.meetingsEnabled) throw new ChatError("meetings_disabled", 403);
  if (!s.membersCanCreateMeetings && user.role !== "admin") throw new ChatError("forbidden", 403);
  const now = deps.now();
  const scheduled = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const isLive = !scheduled || scheduled <= now;

  const invitees = [...new Set(input.invitees.filter((id) => id !== user.id))];
  if (invitees.length) {
    const ok = await deps.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, invitees), eq(users.status, "active")));
    if (ok.length !== invitees.length) throw new ChatError("invalid_invitee");
  }

  const [m] = await deps.db
    .insert(meetings)
    .values({
      title: input.title,
      createdBy: user.id,
      hostId: user.id,
      room: `m_${randomBytes(12).toString("hex")}`,
      audioOnly: input.audioOnly,
      inviteOnly: input.inviteOnly,
      waitingRoom: input.waitingRoom,
      screenShare: input.screenShare,
      maxParticipants: s.maxMeetingParticipants,
      status: isLive ? "live" : "scheduled",
      scheduledFor: scheduled,
      startedAt: isLive ? now : null,
      createdAt: now,
    })
    .returning();
  await deps.db.insert(meetingParticipants).values([
    { meetingId: m!.id, userId: user.id, state: "admitted", canScreenShare: true },
    ...invitees.map((userId) => ({ meetingId: m!.id, userId, state: "invited" as const })),
  ]);
  if (isLive) await live.createRoom(m!.room, m!.maxParticipants);
  return { meeting: m!, invitees };
}

export async function listMeetings(deps: MeetingDeps, user: Actor) {
  const rows = await deps.db
    .select()
    .from(meetings)
    .where(inArray(meetings.status, ["live", "scheduled"]))
    .orderBy(desc(meetings.createdAt))
    .limit(50);
  const out = [];
  for (const m of rows) {
    if (!(await canSee(deps.db, user, m)) && user.role !== "admin") continue;
    out.push({ ...(await meetingDto(deps, user, m)), private: m.inviteOnly && !(await canSee(deps.db, user, m)) });
  }
  return out;
}

/** Public shape. Invite-only meetings an admin can merely monitor show counts, not names. */
export async function meetingDto(deps: MeetingDeps, user: Actor, m: Meeting) {
  const parts = await deps.db
    .select({
      userId: meetingParticipants.userId,
      state: meetingParticipants.state,
      handRaisedAt: meetingParticipants.handRaisedAt,
      shareRequestedAt: meetingParticipants.shareRequestedAt,
      canScreenShare: meetingParticipants.canScreenShare,
      connectedAt: meetingParticipants.connectedAt,
      leftAt: meetingParticipants.leftAt,
      username: users.username,
      fullName: users.fullName,
    })
    .from(meetingParticipants)
    .innerJoin(users, eq(users.id, meetingParticipants.userId))
    .where(eq(meetingParticipants.meetingId, m.id));
  const visible = await canSee(deps.db, user, m);
  const connected = parts.filter((p) => p.state === "admitted" && p.connectedAt && !p.leftAt).length;
  const isHost = m.hostId === user.id;
  return {
    id: m.id,
    title: visible ? m.title : "Private meeting",
    hostId: m.hostId,
    audioOnly: m.audioOnly,
    inviteOnly: m.inviteOnly,
    waitingRoom: m.waitingRoom,
    locked: m.locked,
    screenShare: m.screenShare,
    maxParticipants: m.maxParticipants,
    status: m.status,
    scheduledFor: m.scheduledFor,
    startedAt: m.startedAt,
    connected,
    me: parts.find((p) => p.userId === user.id)?.state ?? null,
    participants: visible
      ? parts
          .filter((p) => isHost || p.state === "admitted" || p.userId === user.id)
          .map((p) => ({
            userId: p.userId,
            username: p.username,
            fullName: p.fullName,
            state: p.state,
            online: Boolean(p.connectedAt && !p.leftAt),
            handRaised: Boolean(p.handRaisedAt),
            shareRequested: Boolean(p.shareRequestedAt),
            canScreenShare: p.canScreenShare,
          }))
      : [],
  };
}

export async function getMeeting(deps: MeetingDeps, user: Actor, id: string) {
  const m = await meetingById(deps.db, id);
  if (!m || !(await canSee(deps.db, user, m))) throw new ChatError("not_found", 404);
  return meetingDto(deps, user, m);
}

export type JoinResult =
  | { state: "admitted"; token: string; url: string; room: string; meetingId: string }
  | { state: "waiting"; meetingId: string };

/**
 * Admission is decided inside one transaction holding the meeting row lock, so ten simultaneous join
 * attempts for the last seat produce exactly one admission.
 */
export async function joinMeeting(deps: MeetingDeps, user: Actor & { fullName?: string }, id: string): Promise<JoinResult> {
  const live = lk(deps);
  const s = await getSettings(deps.db);
  const now = deps.now();
  if (!s.meetingsEnabled && user.role !== "admin") throw new ChatError("meetings_disabled", 403);
  if ((await getUsage(deps.db, "meeting_minutes", now)) >= s.meetingMinutesMonthly) {
    throw new ChatError("meeting_quota_exceeded", 429);
  }

  const decision = await deps.db.transaction(async (tx) => {
    const db = tx as unknown as Db;
    const [m] = await tx.select().from(meetings).where(eq(meetings.id, id)).for("update");
    if (!m || !(await canSee(db, user, m))) throw new ChatError("not_found", 404);
    if (m.status === "ended") throw new ChatError("meeting_ended", 410);
    const isHost = m.hostId === user.id;
    if (m.status === "scheduled" && !isHost) throw new ChatError("meeting_not_started", 409);

    const p = await participant(db, m.id, user.id);
    if (p && (p.state === "denied" || p.state === "removed")) throw new ChatError("not_admitted", 403);
    const alreadyAdmitted = p?.state === "admitted";
    if (!isHost && !alreadyAdmitted) {
      if (m.locked) throw new ChatError("meeting_locked", 423);
      if (m.waitingRoom) {
        await upsertParticipant(db, m.id, user.id, { state: "waiting" }, now);
        return { kind: "waiting" as const, m };
      }
    }
    if ((await seatsTaken(db, m.id, now, user.id)) >= m.maxParticipants) throw new ChatError("meeting_full", 409);

    if (m.status === "scheduled") {
      await tx.update(meetings).set({ status: "live", startedAt: now }).where(eq(meetings.id, m.id));
      await live.createRoom(m.room, m.maxParticipants);
    }
    const row = await upsertParticipant(db, m.id, user.id, { state: "admitted", reservedUntil: new Date(now.getTime() + RESERVATION_MS) }, now);
    return { kind: "admitted" as const, m, canScreenShare: row.canScreenShare, isHost };
  });

  if (decision.kind === "waiting") return { state: "waiting", meetingId: id };
  const token = await live.token({
    room: decision.m.room,
    identity: user.id,
    name: user.username,
    ttlSeconds: TOKEN_TTL_SECONDS,
    sources: sourcesFor(decision.m, decision.isHost, decision.canScreenShare),
  });
  return { state: "admitted", token, url: live.url, room: decision.m.room, meetingId: id };
}

async function upsertParticipant(
  db: Db,
  meetingId: string,
  userId: string,
  set: Partial<typeof meetingParticipants.$inferInsert> & { state: (typeof meetingParticipants.$inferInsert)["state"] },
  now: Date
) {
  const [row] = await db
    .insert(meetingParticipants)
    .values({ meetingId, userId, ...set, updatedAt: now })
    .onConflictDoUpdate({ target: [meetingParticipants.meetingId, meetingParticipants.userId], set: { ...set, updatedAt: now } })
    .returning();
  return row!;
}

async function requireHost(deps: MeetingDeps, user: Actor, id: string, action: string) {
  const m = await meetingById(deps.db, id);
  // Administrators may end any meeting (conference management) without seeing who is in it.
  const adminEnd = user.role === "admin" && action === "end";
  if (!m || (!adminEnd && !(await canSee(deps.db, user, m)))) throw new ChatError("not_found", 404);
  // An administrator may end or moderate any meeting; otherwise only the current host.
  if (m.hostId !== user.id && user.role !== "admin") throw new ChatError("forbidden", 403);
  if (m.status === "ended") throw new ChatError("meeting_ended", 410);
  return m;
}

/** Returns the user ids whose clients should refresh this meeting. */
export async function hostAction(deps: MeetingDeps, user: Actor, id: string, a: z.infer<typeof hostActionSchema>) {
  const live = lk(deps);
  const m = await requireHost(deps, user, id, a.action);
  const now = deps.now();
  const db = deps.db;
  const target = "userId" in a ? await participant(db, m.id, a.userId) : null;
  if ("userId" in a && a.action !== "transfer_host" && !target) throw new ChatError("not_found", 404);

  switch (a.action) {
    case "admit": {
      if (target!.state !== "waiting") throw new ChatError("not_waiting", 409);
      await db.update(meetingParticipants).set({ state: "admitted", updatedAt: now }).where(pk(m.id, a.userId));
      break;
    }
    case "deny":
      await db.update(meetingParticipants).set({ state: "denied", updatedAt: now }).where(pk(m.id, a.userId));
      break;
    case "remove":
      if (a.userId === m.hostId) throw new ChatError("cannot_remove_host", 409);
      await db.update(meetingParticipants).set({ state: "removed", leftAt: now, reservedUntil: null, updatedAt: now }).where(pk(m.id, a.userId));
      await live.removeParticipant(m.room, a.userId);
      break;
    case "mute":
      await live.mute(m.room, a.userId, a.source);
      break;
    case "lock":
      await db.update(meetings).set({ locked: a.on }).where(eq(meetings.id, m.id));
      break;
    case "waiting_room":
      await db.update(meetings).set({ waitingRoom: a.on }).where(eq(meetings.id, m.id));
      break;
    case "screen_share_policy": {
      await db.update(meetings).set({ screenShare: a.policy }).where(eq(meetings.id, m.id));
      const updated = { ...m, screenShare: a.policy };
      for (const p of await admitted(db, m.id)) {
        await live.setSources(m.room, p.userId, sourcesFor(updated, p.userId === m.hostId, p.canScreenShare));
      }
      break;
    }
    case "grant_screen_share": {
      // One primary presenter: granting to someone withdraws it from the other non-hosts.
      if (a.on) {
        for (const p of await admitted(db, m.id)) {
          if (p.userId !== a.userId && p.userId !== m.hostId && p.canScreenShare) {
            await db.update(meetingParticipants).set({ canScreenShare: false, updatedAt: now }).where(pk(m.id, p.userId));
            await live.setSources(m.room, p.userId, sourcesFor(m, false, false));
          }
        }
      }
      await db
        .update(meetingParticipants)
        .set({ canScreenShare: a.on, shareRequestedAt: null, updatedAt: now })
        .where(pk(m.id, a.userId));
      await live.setSources(m.room, a.userId, sourcesFor(m, a.userId === m.hostId, a.on));
      break;
    }
    case "transfer_host": {
      if (!target || target.state !== "admitted") throw new ChatError("not_admitted", 409);
      await db.update(meetings).set({ hostId: a.userId }).where(eq(meetings.id, m.id));
      await db.update(meetingParticipants).set({ canScreenShare: true, updatedAt: now }).where(pk(m.id, a.userId));
      break;
    }
    case "invite": {
      const ok = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, a.userIds), eq(users.status, "active")));
      if (ok.length !== new Set(a.userIds).size) throw new ChatError("invalid_invitee");
      for (const uid of a.userIds) {
        await db.insert(meetingParticipants).values({ meetingId: m.id, userId: uid, state: "invited", updatedAt: now }).onConflictDoNothing();
      }
      break;
    }
    case "end":
      await endMeeting(deps, m, now);
      break;
  }
  return audience(db, m.id);
}

const pk = (meetingId: string, userId: string) =>
  and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId));

async function admitted(db: Db, meetingId: string) {
  return db
    .select()
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.state, "admitted")));
}

/** Everyone attached to the meeting (for refresh notifications). */
export async function audience(db: Db, meetingId: string) {
  const rows = await db.select({ userId: meetingParticipants.userId }).from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId));
  return rows.map((r) => r.userId);
}

async function endMeeting(deps: MeetingDeps, m: Meeting, now: Date) {
  await deps.db.update(meetings).set({ status: "ended", endedAt: now }).where(eq(meetings.id, m.id));
  const open = await deps.db
    .select()
    .from(meetingParticipants)
    .where(and(eq(meetingParticipants.meetingId, m.id), isNotNull(meetingParticipants.connectedAt), isNull(meetingParticipants.leftAt)));
  for (const p of open) await closeConnection(deps.db, m.id, p.userId, p.connectedAt!, now);
  await deps.livekit?.deleteRoom(m.room);
}

async function closeConnection(db: Db, meetingId: string, userId: string, connectedAt: Date, now: Date) {
  await db.update(meetingParticipants).set({ leftAt: now, updatedAt: now }).where(pk(meetingId, userId));
  const minutes = Math.max(1, Math.ceil((now.getTime() - connectedAt.getTime()) / 60_000));
  await record(db, "meeting_minutes", now, minutes);
}

export async function raiseHand(deps: MeetingDeps, user: Actor, id: string, kind: "hand" | "share", on: boolean) {
  const p = await participant(deps.db, id, user.id);
  if (!p || p.state !== "admitted") throw new ChatError("not_found", 404);
  const now = deps.now();
  await deps.db
    .update(meetingParticipants)
    .set(kind === "hand" ? { handRaisedAt: on ? now : null, updatedAt: now } : { shareRequestedAt: on ? now : null, updatedAt: now })
    .where(pk(id, user.id));
  return audience(deps.db, id);
}

/** Applies a verified LiveKit webhook. Identities are user ids; rooms are opaque meeting room names. */
export async function applyLiveKitEvent(deps: MeetingDeps, e: LiveKitEvent) {
  if (!e.room) return null;
  const [m] = await deps.db.select().from(meetings).where(eq(meetings.room, e.room)).limit(1);
  if (!m) return null;
  const now = new Date(e.createdAt || deps.now().getTime());
  if (e.event === "participant_joined" && e.identity) {
    const p = await participant(deps.db, m.id, e.identity);
    // Someone the database never admitted (should be impossible without a token) is removed.
    if (!p || p.state !== "admitted") {
      await deps.livekit?.removeParticipant(m.room, e.identity);
      return m.id;
    }
    await deps.db
      .update(meetingParticipants)
      .set({ connectedAt: now, leftAt: null, reservedUntil: null, updatedAt: now })
      .where(pk(m.id, e.identity));
  } else if ((e.event === "participant_left" || e.event === "participant_connection_aborted") && e.identity) {
    const p = await participant(deps.db, m.id, e.identity);
    if (p?.connectedAt && !p.leftAt) await closeConnection(deps.db, m.id, e.identity, p.connectedAt, now);
    else if (p) await deps.db.update(meetingParticipants).set({ reservedUntil: null, updatedAt: now }).where(pk(m.id, e.identity));
  } else if (e.event === "room_finished" && m.status === "live") {
    await endMeeting(deps, m, now);
  }
  return m.id;
}

/** Closes connections whose "left" webhook never arrived, so they stop holding seats and minutes. */
export async function sweepMeetings(deps: MeetingDeps) {
  const now = deps.now();
  const stale = await deps.db
    .select()
    .from(meetingParticipants)
    .where(
      and(
        isNotNull(meetingParticipants.connectedAt),
        isNull(meetingParticipants.leftAt),
        sql`${meetingParticipants.connectedAt} < ${new Date(now.getTime() - STALE_CONNECTION_MS)}`
      )
    );
  for (const p of stale) await closeConnection(deps.db, p.meetingId, p.userId, p.connectedAt!, now);
  return stale.length;
}

export async function meetingUsage(db: Db, now: Date) {
  const s = await getSettings(db);
  return { usedMinutes: await getUsage(db, "meeting_minutes", now), capMinutes: s.meetingMinutesMonthly };
}

