import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { channelMembers, users } from "../db/schema.js";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireUser } from "../auth/session.js";
import { audit } from "../lib/services.js";
import type { Realtime } from "../realtime/gateway.js";
import {
  channelBody,
  createChannel,
  createGroup,
  history,
  listChannelsWithUnread,
  listConversations,
  listMembers,
  listNotifications,
  markNotificationsRead,
  openDirect,
  receipts,
  search,
  setBlock,
  setConversationFlag,
} from "./service.js";

const pageQuery = z.object({
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  pinned: z.coerce.boolean().optional(),
});
const idParam = z.object({ id: z.uuid() });

export async function chatRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const { db } = deps;
  const guard = { preHandler: requireUser(deps) };
  const me = (r: { auth?: { user: { id: string; role: "admin" | "member" } } }) => r.auth!.user;

  app.get("/api/v1/channels", guard, async (request) => listChannelsWithUnread(db, me(request)));

  app.post("/api/v1/channels", guard, async (request, reply) => {
    const ch = await createChannel(db, me(request), channelBody.parse(request.body));
    await audit(db, { actorId: me(request).id, action: "channel.created", targetType: "channel", targetId: ch.id, metadata: { name: ch.name, kind: ch.kind } });
    if (ch.kind === "public") rt.io.in("workspace").socketsJoin(`ch:${ch.id}`);
    else {
      const members = await db.select({ id: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, ch.id));
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      rt.join([...members, ...admins].map((u) => u.id), `ch:${ch.id}`);
    }
    rt.emit("workspace", "channel:new", { id: ch.id });
    return reply.code(201).send(ch);
  });

  app.get("/api/v1/channels/:id/messages", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    return history(db, me(request), { kind: "channel", id }, pageQuery.parse(request.query));
  });

  app.get("/api/v1/conversations", guard, async (request) => listConversations(db, me(request)));

  app.post("/api/v1/conversations", guard, async (request, reply) => {
    const body = z
      .union([z.object({ userId: z.uuid() }), z.object({ title: z.string().trim().min(1).max(80), userIds: z.array(z.uuid()).min(2).max(49) })])
      .parse(request.body);
    const result = "userId" in body ? await openDirect(db, me(request), body.userId) : await createGroup(db, me(request), body.title, body.userIds);
    if (result.created) {
      rt.join(result.participantIds, `cv:${result.conversation.id}`);
      for (const uid of result.participantIds) rt.emit(`user:${uid}`, "conversation:new", { id: result.conversation.id });
    }
    return reply.code(result.created ? 201 : 200).send({ id: result.conversation.id });
  });

  app.get("/api/v1/conversations/:id/messages", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    return history(db, me(request), { kind: "conversation", id }, pageQuery.parse(request.query));
  });

  app.get("/api/v1/conversations/:id/receipts", guard, async (request) => receipts(db, me(request), idParam.parse(request.params).id));

  app.post("/api/v1/conversations/:id/:flag", guard, async (request) => {
    const { id, flag } = z.object({ id: z.uuid(), flag: z.enum(["archive", "unarchive", "mute", "unmute"]) }).parse(request.params);
    await setConversationFlag(db, me(request), id, flag.endsWith("archive") ? "archived" : "muted", !flag.startsWith("un"));
    return { status: "ok" };
  });

  app.get("/api/v1/search", guard, async (request) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(request.query);
    return search(db, me(request), q);
  });

  app.get("/api/v1/members", guard, async () => {
    const online = new Set(await deps.presence.online());
    return (await listMembers(db)).map((m) => ({ ...m, online: online.has(m.id) }));
  });

  app.post("/api/v1/blocks", guard, async (request) => {
    const { userId } = z.object({ userId: z.uuid() }).parse(request.body);
    await setBlock(db, me(request), userId, true);
    return { status: "blocked" };
  });

  app.delete("/api/v1/blocks/:id", guard, async (request) => {
    await setBlock(db, me(request), idParam.parse(request.params).id, false);
    return { status: "unblocked" };
  });

  app.get("/api/v1/notifications", guard, async (request) => listNotifications(db, me(request)));

  app.post("/api/v1/notifications/read", guard, async (request) => {
    await markNotificationsRead(db, me(request));
    return { status: "ok" };
  });
}
