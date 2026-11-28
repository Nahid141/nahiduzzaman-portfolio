import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { publicUser, requireAdmin, requireUser } from "../auth/session.js";
import { ChatError } from "../chat/service.js";
import { activity } from "../db/schema.js";
import { audit } from "../lib/services.js";
import type { Realtime } from "../realtime/gateway.js";
import {
  adminIds,
  AVATAR_MAX_BYTES,
  calendar,
  cancelMeetingRequest,
  checkBuzz,
  createMeetingRequest,
  createTask,
  decideMeetingRequest,
  deleteTask,
  getAvatar,
  listMeetingRequests,
  listTasks,
  meetingRequestSchema,
  profileSchema,
  removeAvatar,
  setAvatar,
  taskCreateSchema,
  taskUpdateSchema,
  updateProfile,
  updateTask,
} from "./service.js";

const idParam = z.object({ id: z.uuid() });

export async function socialRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const { db } = deps;
  const guard = { preHandler: requireUser(deps) };
  const admin = { preHandler: requireAdmin(deps) };
  const me = (r: { auth?: { user: { id: string; role: "admin" | "member"; username: string; fullName: string } } }) => r.auth!.user;
  const now = () => deps.now();
  const limited = async (key: string, windowMs: number, max: number) => (await deps.rateLimit.hit(key, windowMs, now().getTime())) > max;

  /* ------------------------------------ Profile ------------------------------------ */

  app.put("/api/v1/me/profile", guard, async (request) => {
    const u = await updateProfile(db, me(request), profileSchema.parse(request.body), now());
    rt.emit("workspace", "members:changed", { userId: u.id });
    return publicUser(u);
  });

  // The browser sends the already-compressed photo as base64 inside JSON (keeps the CSRF and JSON-only rules).
  app.put("/api/v1/me/avatar", { ...guard, bodyLimit: 400 * 1024 }, async (request, reply) => {
    if (await limited(`avatar:${me(request).id}`, 3600_000, 20)) return reply.code(429).send({ error: "rate_limited" });
    const { data } = z.object({ data: z.string().max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 8) }).parse(request.body);
    const key = await setAvatar(db, me(request), Buffer.from(data, "base64"), now());
    rt.emit("workspace", "members:changed", { userId: me(request).id });
    return { avatarKey: key };
  });

  app.delete("/api/v1/me/avatar", guard, async (request) => {
    await removeAvatar(db, me(request), now());
    rt.emit("workspace", "members:changed", { userId: me(request).id });
    return { avatarKey: null };
  });

  /** Members' photos, for signed-in members only. URLs carry ?v=<avatarKey>, so a day of private caching is safe. */
  app.get("/api/v1/users/:id/avatar", guard, async (request, reply) => {
    const a = await getAvatar(db, idParam.parse(request.params).id);
    if (!a) return reply.code(404).send({ error: "not_found" });
    return reply
      .header("content-type", a.mime)
      .header("cache-control", "private, max-age=86400")
      .header("cross-origin-resource-policy", "same-site")
      .send(a.data);
  });

  /* -------------------------------------- Buzz -------------------------------------- */

  app.post("/api/v1/buzz", guard, async (request, reply) => {
    const body = z.union([z.object({ userId: z.uuid() }), z.object({ everyone: z.literal(true) })]).parse(request.body);
    const from = me(request);
    await checkBuzz(db, from, body);
    if (await limited(`buzz:${from.id}`, 60_000, 6)) return reply.code(429).send({ error: "rate_limited" });
    const to = "userId" in body ? body.userId : "everyone";
    if (await limited(`buzz:${from.id}:${to}`, 20_000, 1)) return reply.code(429).send({ error: "buzz_cooldown" });
    const payload = { from: { id: from.id, username: from.username, fullName: from.fullName }, everyone: to === "everyone", at: now().toISOString() };
    rt.emit("userId" in body ? `user:${body.userId}` : "workspace", "buzz", payload);
    return { ok: true };
  });

  /* ------------------------------------ To-do list ------------------------------------ */

  // Clients refetch on this signal, so administrator-only items never travel to members.
  const tasksChanged = () => rt.emit("workspace", "tasks:changed", {});

  app.get("/api/v1/tasks", guard, async (request) => listTasks(db, me(request), now()));

  app.post("/api/v1/tasks", guard, async (request, reply) => {
    if (await limited(`tasks:${me(request).id}`, 60_000, 30)) return reply.code(429).send({ error: "rate_limited" });
    const t = await createTask(db, me(request), taskCreateSchema.parse(request.body), now());
    tasksChanged();
    return reply.code(201).send(t);
  });

  app.put("/api/v1/tasks/:id", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const { before, after } = await updateTask(db, me(request), id, taskUpdateSchema.parse(request.body), now());
    if (!before.doneAt && after.doneAt && after.visibility === "public") {
      await db.insert(activity).values({ actorId: me(request).id, kind: "task.done", payload: { title: after.title }, createdAt: now() });
      rt.emit("admins", "activity:new", { kind: "task.done" });
    }
    tasksChanged();
    return after;
  });

  app.delete("/api/v1/tasks/:id", guard, async (request) => {
    const t = await deleteTask(db, me(request), idParam.parse(request.params).id);
    await audit(db, { actorId: me(request).id, action: "task.deleted", targetType: "task", targetId: t.id, metadata: { visibility: t.visibility } });
    tasksChanged();
    return { ok: true };
  });

  /* --------------------------------- Meeting requests --------------------------------- */

  const requestsChanged = async (requesterId: string) => {
    for (const id of new Set([...(await adminIds(db)), requesterId])) rt.emit(`user:${id}`, "meeting-requests:changed", {});
  };

  app.get("/api/v1/meeting-requests", guard, async (request) => listMeetingRequests(db, me(request)));

  app.post("/api/v1/meeting-requests", guard, async (request, reply) => {
    if (await limited(`mreq:${me(request).id}`, 3600_000, 10)) return reply.code(429).send({ error: "rate_limited" });
    const r = await createMeetingRequest(db, me(request), meetingRequestSchema.parse(request.body), now());
    for (const id of await adminIds(db)) rt.emit(`user:${id}`, "notification:new", { kind: "meeting_request", requestId: r.id });
    await requestsChanged(r.requestedBy);
    return reply.code(201).send(r);
  });

  app.post("/api/v1/meeting-requests/:id/decide", admin, async (request) => {
    const { id } = idParam.parse(request.params);
    const { decision, note } = z.object({ decision: z.enum(["approve", "decline"]), note: z.string().trim().max(500).default("") }).parse(request.body);
    const { request: r, taskId } = await decideMeetingRequest(db, me(request), id, decision, note, now());
    await audit(db, { actorId: me(request).id, action: `meeting_request.${decision}d`, targetType: "meeting_request", targetId: id });
    rt.emit(`user:${r.requestedBy}`, "notification:new", { kind: "meeting_request_decided", requestId: id, decision });
    await requestsChanged(r.requestedBy);
    if (taskId) tasksChanged();
    return r;
  });

  app.post("/api/v1/meeting-requests/:id/cancel", guard, async (request) => {
    const r = await cancelMeetingRequest(db, me(request), idParam.parse(request.params).id);
    await requestsChanged(r.requestedBy);
    tasksChanged();
    return { ok: true };
  });

  app.get("/api/v1/calendar", guard, async (request) => {
    const q = z.object({ from: z.coerce.date(), to: z.coerce.date() }).parse(request.query);
    if (q.to.getTime() - q.from.getTime() > 62 * 86_400_000 || q.to <= q.from) throw new ChatError("invalid_range", 422);
    return calendar(db, me(request), q.from, q.to);
  });
}
