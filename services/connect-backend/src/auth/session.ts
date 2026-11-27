import { and, eq, isNull, ne } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppDeps } from "../app.js";
import { sessions, users, type Session, type User } from "../db/schema.js";
import { randomToken, sha256 } from "../lib/crypto.js";

export const SESSION_ABSOLUTE_MS = 7 * 24 * 3600 * 1000;
export const SESSION_IDLE_MS = 12 * 3600 * 1000;
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export const cookieName = (deps: AppDeps) => (deps.config.secureCookies ? "__Host-connect" : "connect_session");

export function cookieOptions(deps: AppDeps) {
  return {
    httpOnly: true,
    secure: deps.config.secureCookies,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  };
}

export async function createSession(
  deps: AppDeps,
  reply: FastifyReply,
  userId: string,
  opts: { mfaPassed: boolean; ip?: string; userAgent?: string }
) {
  const token = randomToken();
  const now = deps.now();
  await deps.db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    mfaPassed: opts.mfaPassed,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    ip: opts.ip,
    userAgent: opts.userAgent?.slice(0, 300),
  });
  reply.setCookie(cookieName(deps), token, cookieOptions(deps));
}

export async function revokeUserSessions(deps: AppDeps, userId: string, exceptSessionId?: string) {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
    : and(eq(sessions.userId, userId), isNull(sessions.revokedAt));
  await deps.db.update(sessions).set({ revokedAt: deps.now() }).where(where);
  // Live sockets: drop all of the user's connections (they reconnect with a still-valid cookie).
  deps.events.emit("user:revoked", userId);
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: { user: User; session: Session };
  }
}

/** Resolves the session cookie. Rejects revoked, expired, idle sessions and non-active accounts. */
export async function loadAuth(deps: AppDeps, request: FastifyRequest) {
  return loadAuthByToken(deps, request.cookies[cookieName(deps)]);
}

export async function loadAuthByToken(deps: AppDeps, token: string | undefined) {
  if (!token) return null;
  const rows = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = deps.now().getTime();
  const { session, user } = row;
  if (session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (user.status !== "active") return null;
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await deps.db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, session.id));
  }
  return { user, session };
}

const deny = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });

/** Any fully signed-in user. Admins must have passed MFA. */
export const requireUser = (deps: AppDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const auth = await loadAuth(deps, request);
  if (!auth) return deny(reply, 401, "unauthenticated");
  if (auth.user.role === "admin" && !auth.session.mfaPassed) return deny(reply, 403, "mfa_enrollment_required");
  request.auth = auth;
};

/** Admin who passed MFA in this session and has MFA enrolled. */
export const requireAdmin = (deps: AppDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const auth = await loadAuth(deps, request);
  if (!auth) return deny(reply, 401, "unauthenticated");
  if (auth.user.role !== "admin") return deny(reply, 403, "forbidden");
  if (!auth.user.mfaEnabled || !auth.session.mfaPassed) return deny(reply, 403, "mfa_enrollment_required");
  request.auth = auth;
};

/** Admin session that has not yet enrolled MFA: may only use the enrollment endpoints. */
export const requireAdminPendingMfa = (deps: AppDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const auth = await loadAuth(deps, request);
  if (!auth) return deny(reply, 401, "unauthenticated");
  if (auth.user.role !== "admin") return deny(reply, 403, "forbidden");
  if (auth.user.mfaEnabled) return deny(reply, 409, "mfa_already_enabled");
  request.auth = auth;
};

export const publicUser = (u: User) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  fullName: u.fullName,
  bio: u.bio,
  role: u.role,
  status: u.status,
  mfaEnabled: u.mfaEnabled,
  createdAt: u.createdAt,
});
