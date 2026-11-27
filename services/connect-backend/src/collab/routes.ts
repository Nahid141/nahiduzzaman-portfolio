import os from "node:os";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireAdmin, requireUser } from "../auth/session.js";
import { roomOf, targetSchema } from "../chat/service.js";
import { activity, announcements, meetings, securityEvents, users } from "../db/schema.js";
import { storageSummary } from "../files/service.js";
import { getUsage } from "../lib/usage.js";
import { audit } from "../lib/services.js";
import type { Realtime } from "../realtime/gateway.js";
import { getSettings } from "../settings.js";
import {
  canControl,
  closePoll,
  createPoll,
  decideRequest,
  grantDj,
  listActivity,
  listAnnouncements,
  listDjs,
  listPolls,
  loungeControl,
  loungeControlSchema,
  pollSchema,
  presentControl,
  presentControlSchema,
  queueView,
  requestTrack,
  revokeDj,
  vote,
} from "./service.js";
import { followStateSchema, readState, strokeSchema, writeState, type StateKey, type Versioned } from "./state.js";

const idParam = z.object({ id: z.uuid() });

export async function collabRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const { db } = deps;
  const guard = { preHandler: requireUser(deps) };
  const admin = { preHandler: requireAdmin(deps) };
  const me = (r: { auth?: { user: { id: string; role: "admin" | "member" } } }) => r.auth!.user;
  const now = () => deps.now();

  const broadcast = (v: Versioned<StateKey>) => rt.emit("workspace", "state:update", v);
  const log = async (actorId: string, kind: string, payload: Record<string, unknown>) => {
    await db.insert(activity).values({ actorId, kind, payload, createdAt: now() });
    rt.emit("workspace", "activity:new", { kind });
  };

  /** Clock sync: clients sample this to estimate their offset from server time. */
  app.get("/api/v1/time", async () => ({ now: Date.now() }));

  /** Full snapshot for (re)connecting clients: state recovery after any disconnect. */
  app.get("/api/v1/state", guard, async (request) => ({
    serverNow: Date.now(),
    lounge: await readState(db, "lounge"),
    presentation: await readState(db, "presentation"),
    follow: await readState(db, "follow"),
    canControl: await canControl(db, me(request), now()),
  }));

  /* ------------------------------- Lounge ------------------------------- */

  app.get("/api/v1/lounge", guard, async (request) => ({
    serverNow: Date.now(),
    state: await readState(db, "lounge"),
    queue: await queueView(db),
    djs: await listDjs(db, now()),
    canControl: await canControl(db, me(request), now()),
    requestsEnabled: (await getSettings(db)).musicRequestsEnabled,
  }));

  app.post("/api/v1/lounge/requests", guard, async (request, reply) => {
    const { fileId, note } = z.object({ fileId: z.uuid(), note: z.string().trim().max(200).default("") }).parse(request.body);
    const r = await requestTrack(db, me(request), fileId, note, now());
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
    for (const a of admins) rt.emit(`user:${a.id}`, "notification:new", { kind: "music_request", requestId: r.id });
    rt.emit("workspace", "lounge:queue", {});
    return reply.code(201).send(r);
  });

  app.post("/api/v1/lounge/requests/:id/decide", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const { decision } = z.object({ decision: z.enum(["queue", "reject", "play_next"]) }).parse(request.body);
    const r = await decideRequest(db, me(request), id, decision, now());
    if (r.requestedBy) rt.emit(`user:${r.requestedBy}`, "notification:new", { kind: "music_request_decided", requestId: id, decision });
    rt.emit("workspace", "lounge:queue", {});
    return { ok: true };
  });

  app.post("/api/v1/lounge/control", guard, async (request) => {
    const input = loungeControlSchema.parse(request.body);
    const before = await readState(db, "lounge");
    const v = await loungeControl(db, me(request), input, now());
    if (v.version !== before.version) {
      broadcast(v);
      if (v.state.requestId && v.state.requestId !== before.state.requestId) await log(me(request).id, "lounge.playing", { title: v.state.title });
    }
    if (["next", "previous", "remove", "ended"].includes(input.action)) rt.emit("workspace", "lounge:queue", {});
    return { serverNow: Date.now(), state: v };
  });

  app.post("/api/v1/lounge/dj", admin, async (request) => {
    const { userId, minutes } = z.object({ userId: z.uuid(), minutes: z.number().int().min(5).max(24 * 60) }).parse(request.body);
    const g = await grantDj(db, me(request), userId, minutes, now());
    await audit(db, { actorId: me(request).id, action: "dj.granted", targetType: "user", targetId: userId, metadata: { minutes } });
    rt.emit(`user:${userId}`, "notification:new", { kind: "dj_granted", expiresAt: g.expiresAt });
    rt.emit("workspace", "lounge:queue", {});
    return g;
  });

  app.delete("/api/v1/lounge/dj/:id", admin, async (request) => {
    const { id } = idParam.parse(request.params);
    await revokeDj(db, me(request), id, now());
    await audit(db, { actorId: me(request).id, action: "dj.revoked", targetType: "user", targetId: id });
    rt.emit("workspace", "lounge:queue", {});
    return { ok: true };
  });

  /* ---------------------------- Presentation ---------------------------- */

  app.post("/api/v1/presentation/control", guard, async (request) => {
    const input = presentControlSchema.parse(request.body);
    const v = await presentControl(db, me(request), input, now());
    broadcast(v);
    if (input.action === "start") await log(me(request).id, "presentation.started", { title: v.state.title });
    return { serverNow: Date.now(), state: v };
  });

  /** Pointer positions are ephemeral: relayed, never stored. Only the presenter may send them. */
  app.post("/api/v1/presentation/pointer", guard, async (request, reply) => {
    const p = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), visible: z.boolean() }).parse(request.body);
    const cur = await readState(db, "presentation");
    if (!cur.state.active || cur.state.presenterId !== me(request).id) return reply.code(403).send({ error: "forbidden" });
    rt.emit("workspace", "presentation:pointer", p);
    return { ok: true };
  });

  /* ----------------------------- Whiteboard ----------------------------- */

  app.get("/api/v1/whiteboard", guard, async () => readState(db, "whiteboard"));

  app.post("/api/v1/whiteboard/strokes", guard, async (request, reply) => {
    const stroke = strokeSchema.parse(request.body);
    const n = await deps.rateLimit.hit(`board:${me(request).id}`, 10_000, now().getTime());
    if (n > 40) return reply.code(429).send({ error: "rate_limited" });
    const v = await writeState(
      db,
      "whiteboard",
      (s) => (s.strokes.some((x) => x.id === stroke.id) ? s : { strokes: [...s.strokes, { ...stroke, userId: me(request).id }].slice(-2000) }),
      { by: me(request).id, now: now() }
    );
    rt.emit("workspace", "whiteboard:stroke", { ...stroke, userId: me(request).id, version: v.version });
    return { version: v.version };
  });

  app.post("/api/v1/whiteboard/clear", guard, async (request, reply) => {
    if (!(await canControl(db, me(request), now()))) return reply.code(403).send({ error: "forbidden" });
    const v = await writeState(db, "whiteboard", () => ({ strokes: [] }), { by: me(request).id, now: now() });
    rt.emit("workspace", "whiteboard:clear", { version: v.version });
    return { version: v.version };
  });

  /* ---------------------------- Follow host ---------------------------- */

  app.put("/api/v1/state/follow", admin, async (request, reply) => {
    const body = followStateSchema.pick({ enabled: true, panel: true }).extend({ expectedVersion: z.number().int() }).parse(request.body);
    const s = await getSettings(db);
    if (!s.followHostMode && body.enabled) return reply.code(409).send({ error: "follow_host_disabled" });
    const v = await writeState(db, "follow", () => ({ enabled: body.enabled, panel: body.panel, hostId: me(request).id }), {
      by: me(request).id,
      expected: body.expectedVersion,
      now: now(),
    });
    broadcast(v);
    return v;
  });

  /* ------------------------- Announcements, feed ------------------------- */

  app.get("/api/v1/announcements", guard, async () => listAnnouncements(db));

  app.post("/api/v1/announcements", admin, async (request, reply) => {
    const { body } = z.object({ body: z.string().trim().min(1).max(1000) }).parse(request.body);
    const [a] = await db.insert(announcements).values({ authorId: me(request).id, body, createdAt: now() }).returning();
    await audit(db, { actorId: me(request).id, action: "announcement.published", targetType: "announcement", targetId: a!.id });
    rt.emit("workspace", "announcement:new", { id: a!.id });
    return reply.code(201).send(a);
  });

  app.delete("/api/v1/announcements/:id", admin, async (request) => {
    const { id } = idParam.parse(request.params);
    await db.update(announcements).set({ deletedAt: now() }).where(and(eq(announcements.id, id), isNull(announcements.deletedAt)));
    rt.emit("workspace", "announcement:new", { id });
    return { ok: true };
  });

  app.get("/api/v1/activity", guard, async () => listActivity(db));

  /* --------------------------- System monitoring --------------------------- */

  app.get("/api/v1/admin/system", admin, async () => {
    const t0 = performance.now();
    await db.execute(sql`select 1`);
    const dbMs = Math.round(performance.now() - t0);
    const mem = process.memoryUsage();
    const [live] = await db.select({ n: sql<string>`count(*)` }).from(meetings).where(eq(meetings.status, "live"));
    const [sec] = await db
      .select({ n: sql<string>`count(*)` })
      .from(securityEvents)
      .where(sql`${securityEvents.createdAt} > now() - interval '24 hours'`);
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
      loadAverage: os.loadavg(),
      cpus: os.cpus().length,
      sockets: rt.io.engine.clientsCount,
      database: { ok: true, latencyMs: dbMs },
      storage: await storageSummary(db),
      egressBytesThisMonth: await getUsage(db, "egress_bytes", now()),
      meetingMinutesThisMonth: await getUsage(db, "meeting_minutes", now()),
      liveMeetings: Number(live!.n),
      securityEvents24h: Number(sec!.n),
      integrations: { storage: Boolean(deps.files), meetings: Boolean(deps.livekit), email: deps.config.email.provider },
    };
  });

  /* -------------------------------- Polls -------------------------------- */

  app.get("/api/v1/polls", guard, async (request) => {
    const q = z.object({ kind: z.enum(["channel", "conversation"]), id: z.uuid() }).parse(request.query);
    return listPolls(db, me(request), targetSchema.parse(q), now());
  });

  app.post("/api/v1/polls", guard, async (request, reply) => {
    const p = await createPoll(db, me(request), pollSchema.parse(request.body), now());
    rt.emit(roomOf(p.target), "poll:changed", { id: p.id, target: p.target });
    return reply.code(201).send(p);
  });

  app.post("/api/v1/polls/:id/vote", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const { options } = z.object({ options: z.array(z.number().int()).max(10) }).parse(request.body);
    const p = await vote(db, me(request), id, options, now());
    rt.emit(roomOf(p.target), "poll:changed", { id: p.id, target: p.target });
    return p;
  });

  app.post("/api/v1/polls/:id/close", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const p = await closePoll(db, me(request), id, now());
    rt.emit(roomOf(p.target), "poll:changed", { id: p.id, target: p.target });
    return p;
  });

}
