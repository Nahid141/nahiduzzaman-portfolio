import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { auditLogs, securityEvents, users, type User } from "../db/schema.js";
import { audit } from "../lib/services.js";
import { publicUser, requireAdmin, revokeUserSessions } from "../auth/session.js";
import { getSettings, settingsSchema, updateSettings } from "../settings.js";

type Status = User["status"];

/* Allowed status transitions per admin action. */
const TRANSITIONS: Record<string, { from: Status[]; to: Status; revoke: boolean; notify?: string }> = {
  approve: { from: ["pending"], to: "active", revoke: false, notify: "Your Private Connect account was approved. You can now sign in." },
  reject: { from: ["pending", "pending_verification"], to: "rejected", revoke: true, notify: "Your Private Connect registration was not approved." },
  suspend: { from: ["active"], to: "suspended", revoke: true },
  ban: { from: ["pending", "pending_verification", "active", "suspended", "rejected"], to: "banned", revoke: true },
  reactivate: { from: ["suspended", "rejected", "banned"], to: "active", revoke: false },
};

export async function adminRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  const guard = { preHandler: requireAdmin(deps) };

  /** Other active admins besides `userId`. */
  const otherActiveAdmins = async (userId: string) =>
    (
      await db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId)))
    )[0]!.n;

  app.get("/api/v1/admin/stats", guard, async () => {
    const rows = await db.select({ status: users.status, n: count() }).from(users).groupBy(users.status);
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    const total = rows.reduce((s, r) => s + r.n, 0);
    return { totalMembers: total, byStatus };
  });

  app.get("/api/v1/admin/users", guard, async (request) => {
    const q = z
      .object({ status: z.enum(["pending_verification", "pending", "active", "rejected", "suspended", "banned"]).optional() })
      .parse(request.query);
    const rows = await db
      .select()
      .from(users)
      .where(q.status ? eq(users.status, q.status) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(500);
    return rows.map(publicUser);
  });

  app.post("/api/v1/admin/users/:id/:action", guard, async (request, reply) => {
    const { id, action } = z
      .object({ id: z.uuid(), action: z.enum(["approve", "reject", "suspend", "ban", "reactivate"]) })
      .parse(request.params);
    const rule = TRANSITIONS[action]!;
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });
    if (!rule.from.includes(target.status)) return reply.code(409).send({ error: "invalid_transition", status: target.status });
    if (target.role === "admin" && rule.to !== "active" && (await otherActiveAdmins(target.id)) === 0) {
      return reply.code(409).send({ error: "last_admin" });
    }
    await db.update(users).set({ status: rule.to, updatedAt: deps.now() }).where(eq(users.id, id));
    if (rule.revoke) await revokeUserSessions(deps, id);
    if (rule.notify) await deps.email.send({ to: target.email, subject: "Private Connect account update", text: rule.notify });
    await audit(db, {
      actorId: request.auth!.user.id,
      action: `user.${action}`,
      targetType: "user",
      targetId: id,
      metadata: { from: target.status, to: rule.to },
    });
    return { id, status: rule.to };
  });

  app.post("/api/v1/admin/users/:id/role", guard, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { role } = z.object({ role: z.enum(["admin", "member"]) }).parse(request.body);
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return reply.code(404).send({ error: "not_found" });
    if (target.role === role) return { id, role };
    if (target.role === "admin" && role === "member" && (await otherActiveAdmins(target.id)) === 0) {
      return reply.code(409).send({ error: "last_admin" });
    }
    // New admins must enroll their own MFA; old sessions carry the old role's assumptions.
    await db
      .update(users)
      .set({ role, mfaEnabled: false, totpSecretEnc: null, updatedAt: deps.now() })
      .where(eq(users.id, id));
    await revokeUserSessions(deps, id);
    await audit(db, { actorId: request.auth!.user.id, action: "user.role_changed", targetType: "user", targetId: id, metadata: { role } });
    return { id, role };
  });

  app.get("/api/v1/admin/settings", guard, async () => getSettings(db));

  app.put("/api/v1/admin/settings", guard, async (request) => {
    const patch = settingsSchema.partial().parse(request.body);
    const next = await updateSettings(db, patch);
    await audit(db, { actorId: request.auth!.user.id, action: "settings.updated", metadata: patch });
    return next;
  });

  app.get("/api/v1/admin/audit", guard, async (request) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
    return db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actor: users.username,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  });

  app.get("/api/v1/admin/security-events", guard, async () =>
    db
      .select()
      .from(securityEvents)
      .where(sql`${securityEvents.createdAt} > now() - interval '7 days'`)
      .orderBy(desc(securityEvents.createdAt))
      .limit(200)
  );
}
