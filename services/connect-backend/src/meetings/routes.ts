import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireUser } from "../auth/session.js";
import { activity } from "../db/schema.js";
import { audit, securityEvent } from "../lib/services.js";
import type { Realtime } from "../realtime/gateway.js";
import {
  applyLiveKitEvent,
  audience,
  createMeeting,
  createSchema,
  getMeeting,
  hostAction,
  hostActionSchema,
  joinMeeting,
  listMeetings,
  meetingUsage,
  raiseHand,
  type MeetingDeps,
} from "./service.js";

const idParam = z.object({ id: z.uuid() });

export const LIVEKIT_WEBHOOK_PATH = "/api/v1/livekit/webhook";

export async function meetingRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const md: MeetingDeps = { db: deps.db, livekit: deps.livekit ?? null, now: deps.now };
  const guard = { preHandler: requireUser(deps) };
  const me = (r: { auth?: { user: { id: string; role: "admin" | "member"; username: string; fullName: string } } }) => r.auth!.user;

  /** Tell everyone attached to a meeting to refetch it, and the workspace that the list changed. */
  const changed = (meetingId: string, userIds: string[]) => {
    for (const uid of new Set(userIds)) rt.emit(`user:${uid}`, "meeting:changed", { id: meetingId });
    rt.emit("workspace", "meetings:changed", {});
  };

  app.get("/api/v1/meetings", guard, async (request) => ({
    meetings: await listMeetings(md, me(request)),
    configured: Boolean(deps.livekit),
    usage: await meetingUsage(deps.db, deps.now()),
  }));

  app.post("/api/v1/meetings", guard, async (request, reply) => {
    const { meeting, invitees } = await createMeeting(md, me(request), createSchema.parse(request.body));
    await audit(deps.db, { actorId: me(request).id, action: "meeting.created", targetType: "meeting", targetId: meeting.id, metadata: { inviteOnly: meeting.inviteOnly } });
    if (!meeting.inviteOnly) {
      await deps.db.insert(activity).values({ actorId: me(request).id, kind: "meeting.started", payload: { meetingId: meeting.id, title: meeting.title } });
      rt.emit("workspace", "activity:new", { kind: "meeting.started" });
    }
    for (const uid of invitees) rt.emit(`user:${uid}`, "notification:new", { kind: "meeting_invite", meetingId: meeting.id });
    changed(meeting.id, [me(request).id, ...invitees]);
    return reply.code(201).send(await getMeeting(md, me(request), meeting.id));
  });

  app.get("/api/v1/meetings/:id", guard, async (request) => getMeeting(md, me(request), idParam.parse(request.params).id));

  app.post("/api/v1/meetings/:id/join", guard, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const n = await deps.rateLimit.hit(`meeting-join:${me(request).id}`, 60_000, deps.now().getTime());
    if (n > 20) return reply.code(429).send({ error: "rate_limited" });
    const res = await joinMeeting(md, me(request), id);
    changed(id, await audience(deps.db, id));
    return res;
  });

  app.post("/api/v1/meetings/:id/host", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const action = hostActionSchema.parse(request.body);
    const users = await hostAction(md, me(request), id, action);
    if (["remove", "end", "transfer_host", "lock"].includes(action.action)) {
      await audit(deps.db, { actorId: me(request).id, action: `meeting.${action.action}`, targetType: "meeting", targetId: id, metadata: "userId" in action ? { userId: action.userId } : {} });
    }
    if (action.action === "remove") rt.emit(`user:${action.userId}`, "meeting:removed", { id });
    if (action.action === "end") for (const uid of users) rt.emit(`user:${uid}`, "meeting:ended", { id });
    if (action.action === "invite") for (const uid of action.userIds) rt.emit(`user:${uid}`, "notification:new", { kind: "meeting_invite", meetingId: id });
    changed(id, users);
    return { ok: true };
  });

  app.post("/api/v1/meetings/:id/hand", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const { kind, on } = z.object({ kind: z.enum(["hand", "share"]), on: z.boolean() }).parse(request.body);
    changed(id, await raiseHand(md, me(request), id, kind, on));
    return { ok: true };
  });

  // LiveKit webhooks: signed JWT in Authorization over the raw body; no cookie, no CSRF header.
  await app.register(async (scope) => {
    scope.addContentTypeParser(["application/webhook+json", "application/json"], { parseAs: "string" }, (_req, body, done) => done(null, body));
    scope.post(LIVEKIT_WEBHOOK_PATH, async (request, reply) => {
      if (!deps.livekit) return reply.code(503).send({ error: "meetings_unavailable" });
      let event;
      try {
        event = await deps.livekit.receiveWebhook(request.body as string, request.headers.authorization);
      } catch {
        await securityEvent(deps.db, { kind: "livekit_webhook_rejected", ip: request.ip });
        return reply.code(401).send({ error: "invalid_signature" });
      }
      const meetingId = await applyLiveKitEvent(md, event);
      if (meetingId) changed(meetingId, await audience(deps.db, meetingId));
      return { ok: true };
    });
  });
}
