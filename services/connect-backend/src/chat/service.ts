import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import {
  blocks,
  channelMembers,
  channels,
  conversationParticipants,
  conversations,
  messages,
  notifications,
  reactions,
  readStates,
  users,
  type Message,
  type User,
} from "../db/schema.js";

/* One authority for "who may see what". REST routes and the socket gateway both call this. */

export type Target = { kind: "channel"; id: string } | { kind: "conversation"; id: string };

export const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("channel"), id: z.uuid() }),
  z.object({ kind: z.literal("conversation"), id: z.uuid() }),
]);

export const roomOf = (t: Target) => (t.kind === "channel" ? `ch:${t.id}` : `cv:${t.id}`);

export class ChatError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

export const MAX_BODY = 4000;
export const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👀", "✅", "🔥"];

type Actor = Pick<User, "id" | "role">;

/* ------------------------------- Access checks ------------------------------- */

export async function canAccess(db: Db, user: Actor, target: Target): Promise<boolean> {
  if (target.kind === "channel") {
    const [ch] = await db.select().from(channels).where(eq(channels.id, target.id)).limit(1);
    if (!ch || ch.archivedAt) return false;
    if (ch.kind === "public" || user.role === "admin") return true;
    const [m] = await db
      .select()
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, ch.id), eq(channelMembers.userId, user.id)))
      .limit(1);
    return Boolean(m);
  }
  // Private conversations: participants only. Administrators get no implicit access.
  const [p] = await db
    .select()
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, target.id), eq(conversationParticipants.userId, user.id)))
    .limit(1);
  return Boolean(p);
}

async function assertAccess(db: Db, user: Actor, target: Target) {
  if (!(await canAccess(db, user, target))) throw new ChatError("not_found", 404);
}

/** Rooms a freshly connected socket should join. */
export async function accessibleRooms(db: Db, user: Actor): Promise<string[]> {
  const chs = await listChannels(db, user);
  const cvs = await db
    .select({ id: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, user.id));
  return [...chs.map((c) => `ch:${c.id}`), ...cvs.map((c) => `cv:${c.id}`)];
}

const isBlockedBetween = async (db: Db, a: string, b: string) =>
  (
    await db
      .select()
      .from(blocks)
      .where(or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))))
      .limit(1)
  ).length > 0;

/* ---------------------------------- Channels ---------------------------------- */

const targetKey = (t: Target) => roomOf(t);

async function unreadCount(db: Db, userId: string, t: Target) {
  const [rs] = await db
    .select()
    .from(readStates)
    .where(and(eq(readStates.userId, userId), eq(readStates.target, targetKey(t))))
    .limit(1);
  const col = t.kind === "channel" ? messages.channelId : messages.conversationId;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(col, t.id),
        isNull(messages.deletedAt),
        or(isNull(messages.authorId), ne(messages.authorId, userId)),
        rs ? gt(messages.createdAt, rs.lastReadAt) : undefined
      )
    );
  return row?.n ?? 0;
}

export async function listChannels(db: Db, user: Actor) {
  const all = await db.select().from(channels).where(isNull(channels.archivedAt)).orderBy(channels.createdAt);
  const memberOf = new Set(
    (await db.select().from(channelMembers).where(eq(channelMembers.userId, user.id))).map((m) => m.channelId)
  );
  return all.filter((c) => c.kind === "public" || user.role === "admin" || memberOf.has(c.id));
}

export async function listChannelsWithUnread(db: Db, user: Actor) {
  const chs = await listChannels(db, user);
  return Promise.all(
    chs.map(async (c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      kind: c.kind,
      unread: await unreadCount(db, user.id, { kind: "channel", id: c.id }),
    }))
  );
}

export const channelBody = z.object({
  name: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "2–40 lowercase letters, numbers or dashes"),
  description: z.string().trim().max(200).optional(),
  kind: z.enum(["public", "restricted"]).default("public"),
  memberIds: z.array(z.uuid()).max(500).default([]),
});

export async function createChannel(db: Db, admin: Actor, input: z.infer<typeof channelBody>) {
  if (admin.role !== "admin") throw new ChatError("forbidden", 403);
  const taken = await db.select().from(channels).where(sql`lower(${channels.name}) = ${input.name.toLowerCase()}`).limit(1);
  if (taken.length) throw new ChatError("channel_exists", 409);
  const [ch] = await db
    .insert(channels)
    .values({ name: input.name, description: input.description, kind: input.kind, createdBy: admin.id })
    .returning();
  if (input.kind === "restricted") {
    const ids = [...new Set([admin.id, ...input.memberIds])];
    const active = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, "active")));
    for (const u of active) await db.insert(channelMembers).values({ channelId: ch!.id, userId: u.id }).onConflictDoNothing();
  }
  return ch!;
}

/* -------------------------------- Conversations -------------------------------- */

export async function openDirect(db: Db, user: Actor, otherId: string) {
  if (otherId === user.id) throw new ChatError("invalid_participant");
  const [other] = await db.select().from(users).where(and(eq(users.id, otherId), eq(users.status, "active"))).limit(1);
  if (!other) throw new ChatError("not_found", 404);
  if (await isBlockedBetween(db, user.id, otherId)) throw new ChatError("blocked", 403);
  const key = [user.id, otherId].sort().join(":");
  const [existing] = await db.select().from(conversations).where(eq(conversations.directKey, key)).limit(1);
  if (existing) return { conversation: existing, participantIds: [user.id, otherId], created: false };
  const [cv] = await db.insert(conversations).values({ directKey: key, createdBy: user.id }).onConflictDoNothing().returning();
  const conversation = cv ?? (await db.select().from(conversations).where(eq(conversations.directKey, key)))[0]!;
  for (const id of [user.id, otherId]) {
    await db.insert(conversationParticipants).values({ conversationId: conversation.id, userId: id }).onConflictDoNothing();
  }
  return { conversation, participantIds: [user.id, otherId], created: Boolean(cv) };
}

export async function createGroup(db: Db, user: Actor, title: string, userIds: string[]) {
  const ids = [...new Set(userIds.filter((id) => id !== user.id))];
  if (ids.length < 2 || ids.length > 49) throw new ChatError("group_size", 400);
  const active = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.status, "active")));
  if (active.length !== ids.length) throw new ChatError("invalid_participant");
  for (const id of ids) if (await isBlockedBetween(db, user.id, id)) throw new ChatError("blocked", 403);
  const [conversation] = await db.insert(conversations).values({ isGroup: true, title, createdBy: user.id }).returning();
  const participantIds = [user.id, ...ids];
  for (const id of participantIds) {
    await db.insert(conversationParticipants).values({ conversationId: conversation!.id, userId: id });
  }
  return { conversation: conversation!, participantIds, created: true };
}

export async function listConversations(db: Db, user: Actor) {
  const mine = await db
    .select({ c: conversations, p: conversationParticipants })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(eq(conversationParticipants.userId, user.id));
  return Promise.all(
    mine.map(async ({ c, p }) => {
      const people = await db
        .select({ id: users.id, username: users.username, fullName: users.fullName })
        .from(conversationParticipants)
        .innerJoin(users, eq(users.id, conversationParticipants.userId))
        .where(eq(conversationParticipants.conversationId, c.id));
      const [last] = await db
        .select({ body: messages.body, createdAt: messages.createdAt, deletedAt: messages.deletedAt })
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return {
        id: c.id,
        isGroup: c.isGroup,
        title: c.title,
        participants: people,
        archived: Boolean(p.archivedAt),
        muted: Boolean(p.mutedAt),
        lastMessage: last ? { body: last.deletedAt ? "" : last.body.slice(0, 120), createdAt: last.createdAt } : null,
        unread: await unreadCount(db, user.id, { kind: "conversation", id: c.id }),
      };
    })
  );
}

export async function setConversationFlag(db: Db, user: Actor, id: string, flag: "archived" | "muted", on: boolean) {
  await assertAccess(db, user, { kind: "conversation", id });
  const col = flag === "archived" ? { archivedAt: on ? new Date() : null } : { mutedAt: on ? new Date() : null };
  await db
    .update(conversationParticipants)
    .set(col)
    .where(and(eq(conversationParticipants.conversationId, id), eq(conversationParticipants.userId, user.id)));
}

/* ---------------------------------- Messages ---------------------------------- */

export type MessageDto = {
  id: string;
  target: Target;
  author: { id: string; username: string; fullName: string } | null;
  body: string;
  replyToId: string | null;
  forwardedFromId: string | null;
  mentions: string[];
  pinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  reactions: { emoji: string; count: number; userIds: string[] }[];
};

async function toDtos(db: Db, rows: Message[]): Promise<MessageDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await db.select({ id: users.id, username: users.username, fullName: users.fullName }).from(users).where(inArray(users.id, authorIds))
    : [];
  const rx = await db.select().from(reactions).where(inArray(reactions.messageId, ids));
  return rows.map((m) => {
    const grouped = new Map<string, string[]>();
    for (const r of rx.filter((r) => r.messageId === m.id)) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId]);
    return {
      id: m.id,
      target: m.channelId ? { kind: "channel", id: m.channelId } : { kind: "conversation", id: m.conversationId! },
      author: authors.find((a) => a.id === m.authorId) ?? null,
      body: m.deletedAt ? "" : m.body,
      replyToId: m.replyToId,
      forwardedFromId: m.forwardedFromId,
      mentions: m.mentions,
      pinned: Boolean(m.pinnedAt),
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
      reactions: [...grouped].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds })),
    };
  });
}

export const sendSchema = z.object({
  target: targetSchema,
  body: z.string().trim().min(1).max(MAX_BODY),
  clientId: z.string().min(8).max(64),
  replyToId: z.uuid().optional(),
  forwardFromId: z.uuid().optional(),
});

async function messageIn(db: Db, id: string) {
  const [m] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return m ?? null;
}

const targetOfRow = (m: Message): Target =>
  m.channelId ? { kind: "channel", id: m.channelId } : { kind: "conversation", id: m.conversationId! };

/** Mentioned usernames that can actually see the target. */
async function resolveMentions(db: Db, body: string, target: Target) {
  const names = [...new Set([...body.matchAll(/(?:^|\s)@([A-Za-z0-9_.-]{3,32})/g)].map((m) => m[1]!.toLowerCase()))];
  if (!names.length) return [];
  const found = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.status, "active"), inArray(sql`lower(${users.username})`, names)));
  const visible: string[] = [];
  for (const u of found) if (await canAccess(db, u, target)) visible.push(u.id);
  return visible;
}

export async function sendMessage(db: Db, user: Actor, input: z.infer<typeof sendSchema>) {
  const { target } = input;
  await assertAccess(db, user, target);

  const [dupe] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.authorId, user.id), eq(messages.clientId, input.clientId)))
    .limit(1);
  if (dupe) return { message: (await toDtos(db, [dupe]))[0]!, duplicate: true, notify: [] as string[] };

  if (target.kind === "conversation") {
    const others = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, target.id), ne(conversationParticipants.userId, user.id)));
    const [cv] = await db.select().from(conversations).where(eq(conversations.id, target.id));
    if (!cv!.isGroup && others[0] && (await isBlockedBetween(db, user.id, others[0].userId))) throw new ChatError("blocked", 403);
  }

  for (const refId of [input.replyToId, input.forwardFromId]) {
    if (!refId) continue;
    const ref = await messageIn(db, refId);
    if (!ref || ref.deletedAt || !(await canAccess(db, user, targetOfRow(ref)))) throw new ChatError("invalid_reference");
    if (refId === input.replyToId && roomOf(targetOfRow(ref)) !== roomOf(target)) throw new ChatError("invalid_reference");
  }

  const mentions = await resolveMentions(db, input.body, target);
  const [row] = await db
    .insert(messages)
    .values({
      channelId: target.kind === "channel" ? target.id : null,
      conversationId: target.kind === "conversation" ? target.id : null,
      authorId: user.id,
      clientId: input.clientId,
      body: input.body,
      replyToId: input.replyToId,
      forwardedFromId: input.forwardFromId,
      mentions,
    })
    .returning();
  await markRead(db, user, target, row!.createdAt);

  // Notify mentioned users, and the other people in a private conversation unless they muted it.
  let notify = mentions.filter((id) => id !== user.id);
  if (target.kind === "conversation") {
    const parts = await db.select().from(conversationParticipants).where(eq(conversationParticipants.conversationId, target.id));
    notify = [...new Set([...notify, ...parts.filter((p) => p.userId !== user.id && !p.mutedAt).map((p) => p.userId)])];
  }
  for (const uid of notify) {
    await db.insert(notifications).values({
      userId: uid,
      kind: mentions.includes(uid) ? "mention" : "direct_message",
      payload: { messageId: row!.id, target, from: user.id },
    });
  }
  return { message: (await toDtos(db, [row!]))[0]!, duplicate: false, notify };
}

export async function editMessage(db: Db, user: Actor, id: string, body: string) {
  const m = await messageIn(db, id);
  if (!m || m.deletedAt || !(await canAccess(db, user, targetOfRow(m)))) throw new ChatError("not_found", 404);
  if (m.authorId !== user.id) throw new ChatError("forbidden", 403);
  const clean = z.string().trim().min(1).max(MAX_BODY).parse(body);
  const [row] = await db.update(messages).set({ body: clean, editedAt: new Date() }).where(eq(messages.id, id)).returning();
  return (await toDtos(db, [row!]))[0]!;
}

/** Authors delete their own messages; admins may moderate shared channels (never private conversations). */
export async function deleteMessage(db: Db, user: Actor, id: string) {
  const m = await messageIn(db, id);
  if (!m || m.deletedAt || !(await canAccess(db, user, targetOfRow(m)))) throw new ChatError("not_found", 404);
  const moderator = user.role === "admin" && Boolean(m.channelId);
  if (m.authorId !== user.id && !moderator) throw new ChatError("forbidden", 403);
  const [row] = await db.update(messages).set({ deletedAt: new Date(), body: "" }).where(eq(messages.id, id)).returning();
  await db.delete(reactions).where(eq(reactions.messageId, id));
  return (await toDtos(db, [row!]))[0]!;
}

export async function react(db: Db, user: Actor, id: string, emoji: string, on: boolean) {
  if (!ALLOWED_REACTIONS.includes(emoji)) throw new ChatError("invalid_reaction");
  const m = await messageIn(db, id);
  if (!m || m.deletedAt || !(await canAccess(db, user, targetOfRow(m)))) throw new ChatError("not_found", 404);
  if (on) await db.insert(reactions).values({ messageId: id, userId: user.id, emoji }).onConflictDoNothing();
  else await db.delete(reactions).where(and(eq(reactions.messageId, id), eq(reactions.userId, user.id), eq(reactions.emoji, emoji)));
  return (await toDtos(db, [m]))[0]!;
}

/** In channels only the author or an admin may pin; in conversations any participant may. */
export async function pin(db: Db, user: Actor, id: string, on: boolean) {
  const m = await messageIn(db, id);
  if (!m || m.deletedAt || !(await canAccess(db, user, targetOfRow(m)))) throw new ChatError("not_found", 404);
  if (m.channelId && m.authorId !== user.id && user.role !== "admin") throw new ChatError("forbidden", 403);
  const [row] = await db
    .update(messages)
    .set(on ? { pinnedAt: new Date(), pinnedBy: user.id } : { pinnedAt: null, pinnedBy: null })
    .where(eq(messages.id, id))
    .returning();
  return (await toDtos(db, [row!]))[0]!;
}

export async function history(db: Db, user: Actor, target: Target, opts: { before?: string; limit?: number; pinned?: boolean }) {
  await assertAccess(db, user, target);
  const col = target.kind === "channel" ? messages.channelId : messages.conversationId;
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(col, target.id),
        opts.before ? lt(messages.createdAt, new Date(opts.before)) : undefined,
        opts.pinned ? sql`${messages.pinnedAt} is not null` : undefined
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(opts.limit ?? 50, 100));
  return (await toDtos(db, rows)).reverse();
}

export async function markRead(db: Db, user: Actor, target: Target, at: Date) {
  await db
    .insert(readStates)
    .values({ userId: user.id, target: targetKey(target), lastReadAt: at })
    .onConflictDoUpdate({
      target: [readStates.userId, readStates.target],
      set: { lastReadAt: sql`greatest(${readStates.lastReadAt}, ${at.toISOString()}::timestamptz)` },
    });
}

/** Read receipts: each participant's last-read time in a conversation. */
export async function receipts(db: Db, user: Actor, conversationId: string) {
  await assertAccess(db, user, { kind: "conversation", id: conversationId });
  return db
    .select({ userId: readStates.userId, lastReadAt: readStates.lastReadAt })
    .from(readStates)
    .where(eq(readStates.target, `cv:${conversationId}`));
}

export async function search(db: Db, user: Actor, q: string) {
  const rooms = await accessibleRooms(db, user);
  const chIds = rooms.filter((r) => r.startsWith("ch:")).map((r) => r.slice(3));
  const cvIds = rooms.filter((r) => r.startsWith("cv:")).map((r) => r.slice(3));
  if (!chIds.length && !cvIds.length) return [];
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        isNull(messages.deletedAt),
        or(chIds.length ? inArray(messages.channelId, chIds) : undefined, cvIds.length ? inArray(messages.conversationId, cvIds) : undefined),
        sql`to_tsvector('simple', ${messages.body}) @@ plainto_tsquery('simple', ${q})`
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(50);
  return toDtos(db, rows);
}

/* ------------------------------- Blocks, members ------------------------------- */

export async function setBlock(db: Db, user: Actor, otherId: string, on: boolean) {
  if (otherId === user.id) throw new ChatError("invalid_participant");
  if (on) await db.insert(blocks).values({ blockerId: user.id, blockedId: otherId }).onConflictDoNothing();
  else await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, otherId)));
}

export async function listMembers(db: Db) {
  return db
    .select({ id: users.id, username: users.username, fullName: users.fullName, bio: users.bio, role: users.role })
    .from(users)
    .where(eq(users.status, "active"))
    .orderBy(users.fullName);
}

export async function listNotifications(db: Db, user: Actor) {
  return db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function markNotificationsRead(db: Db, user: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
}
