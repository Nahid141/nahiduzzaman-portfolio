import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { oneTimeTokens, recoveryCodes, sessions, users, type User } from "../db/schema.js";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  normalizeRecoveryCode,
  randomToken,
  sha256,
  totpUri,
  verifyPassword,
  verifyTotp,
} from "../lib/crypto.js";
import { audit, securityEvent } from "../lib/services.js";
import { getSettings } from "../settings.js";
import {
  cookieName,
  cookieOptions,
  createSession,
  loadAuth,
  publicUser,
  requireAdminPendingMfa,
  requireUser,
  revokeUserSessions,
} from "./session.js";

const HOUR = 3600 * 1000;
const WINDOW = 15 * 60 * 1000;

const password = z.string().min(12, "Use at least 12 characters").max(256);
const username = z.string().regex(/^[A-Za-z0-9_.-]{3,32}$/, "3–32 letters, numbers, dot, dash or underscore");

const registerBody = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    username,
    email: z.email().max(254),
    password,
    confirmPassword: z.string(),
    bio: z.string().trim().max(500).optional(),
    acceptTerms: z.literal(true),
  })
  .refine((b) => b.password === b.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

const ACCEPTED = { status: "accepted", message: "If the details are valid, we sent an email with the next step." };

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;
  const ip = (r: FastifyRequest) => r.ip;
  const now = () => deps.now();

  const limited = async (key: string, max: number, windowMs = WINDOW) =>
    (await deps.rateLimit.hit(key, windowMs, now().getTime())) > max;

  const issueToken = async (userId: string, purpose: "verify_email" | "reset_password" | "mfa_ticket", ttlMs: number) => {
    const token = randomToken();
    await db.insert(oneTimeTokens).values({
      userId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(now().getTime() + ttlMs),
    });
    return token;
  };

  /** Atomically consumes an unused, unexpired token; returns its user id or null. */
  const consumeToken = async (token: string, purpose: "verify_email" | "reset_password" | "mfa_ticket") => {
    const rows = await db
      .update(oneTimeTokens)
      .set({ usedAt: now() })
      .where(
        and(
          eq(oneTimeTokens.tokenHash, sha256(token)),
          eq(oneTimeTokens.purpose, purpose),
          isNull(oneTimeTokens.usedAt),
          sql`${oneTimeTokens.expiresAt} > ${now().toISOString()}`
        )
      )
      .returning({ userId: oneTimeTokens.userId });
    return rows[0]?.userId ?? null;
  };

  const findByLogin = async (identifier: string) =>
    (
      await db
        .select()
        .from(users)
        .where(or(sql`lower(${users.username}) = lower(${identifier})`, sql`lower(${users.email}) = lower(${identifier})`))
        .limit(1)
    )[0];

  const link = (path: string, token: string) => `${deps.config.allowedOrigins[0]}${path}?token=${encodeURIComponent(token)}`;

  /* ------------------------------ Registration ----------------------------- */

  app.post("/api/v1/auth/register", async (request, reply) => {
    if (await limited(`register:ip:${ip(request)}`, 10, HOUR)) return reply.code(429).send({ error: "rate_limited" });
    const settings = await getSettings(db);
    if (!settings.registrationEnabled) return reply.code(403).send({ error: "registration_closed" });
    const body = registerBody.parse(request.body);

    const taken = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(sql`lower(${users.username}) = lower(${body.username})`, sql`lower(${users.email}) = lower(${body.email})`));

    if (taken.some((u) => u.username.toLowerCase() === body.username.toLowerCase())) {
      return reply.code(409).send({ error: "username_taken" });
    }
    if (taken.length) {
      // Email already registered: tell the owner of that address, reveal nothing to the requester.
      await deps.email.send({
        to: body.email,
        subject: "Private Connect registration attempt",
        text: "Someone tried to register a Private Connect account with this email address, which already has an account. If this was you, sign in or reset your password instead.",
      });
      return reply.code(202).send(ACCEPTED);
    }

    const [user] = await db
      .insert(users)
      .values({
        fullName: body.fullName,
        username: body.username,
        email: body.email,
        bio: body.bio || null,
        passwordHash: await hashPassword(body.password),
        termsAcceptedAt: now(),
      })
      .returning();
    const token = await issueToken(user!.id, "verify_email", 24 * HOUR);
    await deps.email.send({
      to: body.email,
      subject: "Verify your email for Private Connect",
      text: `Hello ${body.fullName},\n\nConfirm your email address to continue your registration:\n${link("/connect/verify-email", token)}\n\nThe link expires in 24 hours.`,
    });
    await audit(db, { actorId: user!.id, action: "user.registered", targetType: "user", targetId: user!.id });
    return reply.code(202).send(ACCEPTED);
  });

  app.post("/api/v1/auth/verify-email", async (request, reply) => {
    if (await limited(`verify:ip:${ip(request)}`, 30)) return reply.code(429).send({ error: "rate_limited" });
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.body);
    const userId = await consumeToken(token, "verify_email");
    if (!userId) return reply.code(400).send({ error: "invalid_or_expired_token" });

    const settings = await getSettings(db);
    const nextStatus = settings.requireApproval ? "pending" : "active";
    const [user] = await db
      .update(users)
      .set({ status: nextStatus, emailVerifiedAt: now(), updatedAt: now() })
      .where(and(eq(users.id, userId), eq(users.status, "pending_verification")))
      .returning();
    if (!user) return reply.code(400).send({ error: "invalid_or_expired_token" });

    await audit(db, { actorId: user.id, action: "user.email_verified", targetType: "user", targetId: user.id });
    if (nextStatus === "pending") {
      const admins = await db.select().from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      for (const admin of admins) {
        await deps.email.send({
          to: admin.email,
          subject: "New Private Connect registration awaiting approval",
          text: `${user.fullName} (@${user.username}) verified their email and is waiting for approval.\n\nReview: ${deps.config.allowedOrigins[0]}/connect/admin`,
        });
      }
    }
    return { status: nextStatus };
  });

  /* --------------------------------- Login --------------------------------- */

  const loginBody = z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(256) });

  /** Shared password check with per-IP and per-account limits. Returns the user or sends the error. */
  const checkPassword = async (request: FastifyRequest, reply: FastifyReply, role: User["role"]) => {
    const body = loginBody.parse(request.body);
    const account = body.identifier.toLowerCase();
    if (await limited(`login:ip:${ip(request)}`, 20)) {
      await securityEvent(db, { kind: "login.rate_limited_ip", ip: ip(request) });
      reply.code(429).send({ error: "rate_limited" });
      return null;
    }
    if (await limited(`login:acct:${account}`, 5)) {
      await securityEvent(db, { kind: "login.rate_limited_account", ip: ip(request), metadata: { account } });
      reply.code(429).send({ error: "rate_limited" });
      return null;
    }
    const user = await findByLogin(body.identifier);
    const ok = await verifyPassword(user?.passwordHash, body.password);
    if (!user || !ok || user.role !== role) {
      await securityEvent(db, { userId: user?.id, kind: `login.failed.${role}`, ip: ip(request) });
      reply.code(401).send({ error: "invalid_credentials" });
      return null;
    }
    await deps.rateLimit.reset(`login:acct:${account}`);
    if (user.status === "pending_verification") {
      reply.code(403).send({ error: "email_unverified" });
      return null;
    }
    if (user.status === "pending") {
      reply.code(403).send({ error: "account_pending" });
      return null;
    }
    if (user.status !== "active") {
      reply.code(403).send({ error: "account_inactive" });
      return null;
    }
    return user;
  };

  app.post("/api/v1/auth/login/member", async (request, reply) => {
    const user = await checkPassword(request, reply, "member");
    if (!user) return reply;
    await createSession(deps, reply, user.id, { mfaPassed: true, ip: ip(request), userAgent: request.headers["user-agent"] });
    await audit(db, { actorId: user.id, action: "auth.login", metadata: { role: "member" } });
    return { step: "done", user: publicUser(user) };
  });

  app.post("/api/v1/auth/login/admin", async (request, reply) => {
    const user = await checkPassword(request, reply, "admin");
    if (!user) return reply;
    if (!user.mfaEnabled) {
      // Restricted session: can only enroll MFA.
      await createSession(deps, reply, user.id, { mfaPassed: false, ip: ip(request), userAgent: request.headers["user-agent"] });
      return { step: "enroll_mfa" };
    }
    const ticket = await issueToken(user.id, "mfa_ticket", 5 * 60 * 1000);
    return { step: "mfa", ticket };
  });

  app.post("/api/v1/auth/mfa/verify", async (request, reply) => {
    const body = z
      .object({ ticket: z.string().min(20).max(200), code: z.string().max(20).optional(), recoveryCode: z.string().max(20).optional() })
      .parse(request.body);
    const ticketHash = sha256(body.ticket);
    if (await limited(`mfa:${ticketHash}`, 5)) return reply.code(429).send({ error: "rate_limited" });
    const [row] = await db
      .select({ token: oneTimeTokens, user: users })
      .from(oneTimeTokens)
      .innerJoin(users, eq(users.id, oneTimeTokens.userId))
      .where(and(eq(oneTimeTokens.tokenHash, ticketHash), eq(oneTimeTokens.purpose, "mfa_ticket"), isNull(oneTimeTokens.usedAt)))
      .limit(1);
    if (!row || row.token.expiresAt <= now() || !row.user.totpSecretEnc || row.user.status !== "active") {
      return reply.code(401).send({ error: "invalid_mfa" });
    }
    const user = row.user;
    let ok = false;
    if (body.code) {
      ok = verifyTotp(decryptSecret(deps.config.dataKey, user.totpSecretEnc!), body.code, now());
    } else if (body.recoveryCode) {
      const code = normalizeRecoveryCode(body.recoveryCode);
      const codes = await db
        .select()
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)));
      for (const c of codes) {
        if (await verifyPassword(c.codeHash, code)) {
          const used = await db
            .update(recoveryCodes)
            .set({ usedAt: now() })
            .where(and(eq(recoveryCodes.id, c.id), isNull(recoveryCodes.usedAt)))
            .returning();
          ok = used.length === 1;
          if (ok) await audit(db, { actorId: user.id, action: "auth.recovery_code_used" });
          break;
        }
      }
    }
    if (!ok) {
      await securityEvent(db, { userId: user.id, kind: "mfa.failed", ip: ip(request) });
      return reply.code(401).send({ error: "invalid_mfa" });
    }
    if (!(await consumeToken(body.ticket, "mfa_ticket"))) return reply.code(401).send({ error: "invalid_mfa" });
    await createSession(deps, reply, user.id, { mfaPassed: true, ip: ip(request), userAgent: request.headers["user-agent"] });
    await audit(db, { actorId: user.id, action: "auth.login", metadata: { role: "admin" } });
    return { step: "done", user: publicUser(user) };
  });

  /* ------------------------------ MFA enrollment ---------------------------- */

  app.post("/api/v1/auth/mfa/enroll", { preHandler: requireAdminPendingMfa(deps) }, async (request) => {
    const user = request.auth!.user;
    const secret = generateTotpSecret();
    await db
      .update(users)
      .set({ totpSecretEnc: encryptSecret(deps.config.dataKey, secret), updatedAt: now() })
      .where(eq(users.id, user.id));
    return { secret, uri: totpUri(user.username, secret) };
  });

  app.post("/api/v1/auth/mfa/enroll/confirm", { preHandler: requireAdminPendingMfa(deps) }, async (request, reply) => {
    const { code } = z.object({ code: z.string().max(10) }).parse(request.body);
    const { user, session } = request.auth!;
    if (await limited(`mfa-enroll:${user.id}`, 5)) return reply.code(429).send({ error: "rate_limited" });
    if (!user.totpSecretEnc || !verifyTotp(decryptSecret(deps.config.dataKey, user.totpSecretEnc), code, now())) {
      return reply.code(400).send({ error: "invalid_mfa" });
    }
    const codes = generateRecoveryCodes();
    await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
    for (const c of codes) await db.insert(recoveryCodes).values({ userId: user.id, codeHash: await hashPassword(c) });
    await db.update(users).set({ mfaEnabled: true, updatedAt: now() }).where(eq(users.id, user.id));
    await db.update(sessions).set({ mfaPassed: true }).where(eq(sessions.id, session.id));
    await audit(db, { actorId: user.id, action: "auth.mfa_enrolled" });
    return { recoveryCodes: codes };
  });

  /* --------------------------- Session and account --------------------------- */

  app.get("/api/v1/auth/me", async (request, reply) => {
    const auth = await loadAuth(deps, request);
    if (!auth) return reply.code(401).send({ error: "unauthenticated" });
    const needsMfa = auth.user.role === "admin" && !auth.session.mfaPassed;
    return { user: publicUser(auth.user), mfaEnrollmentRequired: needsMfa };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const auth = await loadAuth(deps, request);
    if (auth) {
      await db.update(sessions).set({ revokedAt: now() }).where(eq(sessions.id, auth.session.id));
      await audit(db, { actorId: auth.user.id, action: "auth.logout" });
    }
    reply.clearCookie(cookieName(deps), cookieOptions(deps));
    return { status: "signed_out" };
  });

  app.get("/api/v1/auth/sessions", { preHandler: requireUser(deps) }, async (request) => {
    const { user, session } = request.auth!;
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), sql`${sessions.expiresAt} > ${now().toISOString()}`))
      .orderBy(desc(sessions.lastSeenAt));
    return rows.map((s) => ({
      id: s.id,
      current: s.id === session.id,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ip: s.ip,
      userAgent: s.userAgent,
    }));
  });

  app.delete("/api/v1/auth/sessions/:id", { preHandler: requireUser(deps) }, async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const rows = await db
      .update(sessions)
      .set({ revokedAt: now() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, request.auth!.user.id)))
      .returning({ id: sessions.id });
    if (!rows.length) return reply.code(404).send({ error: "not_found" });
    return { status: "revoked" };
  });

  /* -------------------------------- Passwords -------------------------------- */

  app.post("/api/v1/auth/password/change", { preHandler: requireUser(deps) }, async (request, reply) => {
    const body = z.object({ currentPassword: z.string().max(256), newPassword: password }).parse(request.body);
    const { user, session } = request.auth!;
    if (await limited(`pwchange:${user.id}`, 5)) return reply.code(429).send({ error: "rate_limited" });
    if (!(await verifyPassword(user.passwordHash, body.currentPassword))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: now() })
      .where(eq(users.id, user.id));
    await revokeUserSessions(deps, user.id, session.id);
    await audit(db, { actorId: user.id, action: "auth.password_changed" });
    return { status: "changed" };
  });

  app.post("/api/v1/auth/password/forgot", async (request, reply) => {
    const { email } = z.object({ email: z.email().max(254) }).parse(request.body);
    const limitedIp = await limited(`forgot:ip:${ip(request)}`, 10, HOUR);
    const limitedAcct = await limited(`forgot:acct:${email.toLowerCase()}`, 3, HOUR);
    if (!limitedIp && !limitedAcct) {
      const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
      if (user && !["banned", "rejected"].includes(user.status)) {
        const token = await issueToken(user.id, "reset_password", HOUR);
        await deps.email.send({
          to: user.email,
          subject: "Reset your Private Connect password",
          text: `Reset your password with this link (valid for 1 hour):\n${link("/connect/reset-password", token)}\n\nIf you did not ask for this, ignore this email.`,
        });
      }
    }
    return reply.code(202).send(ACCEPTED);
  });

  app.post("/api/v1/auth/password/reset", async (request, reply) => {
    if (await limited(`reset:ip:${ip(request)}`, 20)) return reply.code(429).send({ error: "rate_limited" });
    const body = z.object({ token: z.string().min(20).max(200), password }).parse(request.body);
    const userId = await consumeToken(body.token, "reset_password");
    if (!userId) return reply.code(400).send({ error: "invalid_or_expired_token" });
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password), updatedAt: now() })
      .where(eq(users.id, userId));
    await revokeUserSessions(deps, userId);
    await audit(db, { actorId: userId, action: "auth.password_reset" });
    return { status: "reset" };
  });
}
