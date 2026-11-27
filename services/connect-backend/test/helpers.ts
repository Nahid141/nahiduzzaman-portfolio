import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import pg from "pg";
import { generateSync } from "otplib";
import { users } from "../src/db/schema.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { MemoryEmailSender, MemoryRateLimitStore } from "../src/lib/services.js";
import { createEvents, MemoryPresenceStore } from "../src/lib/stores.js";
import { bootstrapAdmin } from "../scripts/bootstrap-admin.js";
import { MemoryFileStore } from "../src/files/storage.js";
import type { HashScanner } from "../src/files/service.js";
import { FakeLiveKit } from "../src/meetings/livekit.js";

export const ORIGIN = "http://localhost:3000";

/**
 * Real-PostgreSQL mode (e.g. Supabase): every test starts from an empty schema, so the database
 * name must end in "_test". This guard is what stops the suite from ever wiping a real database.
 */
async function freshPostgres(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(name)) throw new Error(`TEST_DATABASE_URL must point at a database whose name ends in _test (got "${name}")`);
  const ca = process.env.DATABASE_CA_FILE ? readFileSync(process.env.DATABASE_CA_FILE, "utf8") : undefined;
  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
  await pool.query("drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;");
  await pool.end();
  return createDb({ url, ca, max: 3 });
}

export async function testApp(opts: { scanner?: HashScanner; noStorage?: boolean } = {}) {
  const handle = process.env.TEST_DATABASE_URL ? await freshPostgres(process.env.TEST_DATABASE_URL) : await createDb({ pglite: true });
  const email = new MemoryEmailSender();
  const clock = { now: new Date() };
  const files = new MemoryFileStore();
  const livekit = new FakeLiveKit();
  const config = loadConfig({ NODE_ENV: "test", CONNECT_SITE_ORIGIN: ORIGIN });
  const app = await buildApp({
    config,
    db: handle.db,
    rateLimit: new MemoryRateLimitStore(),
    email,
    now: () => clock.now,
    events: createEvents(),
    presence: new MemoryPresenceStore(),
    files: opts.noStorage ? null : files,
    scanner: opts.scanner,
    livekit,
  });

  type Opts = { cookie?: string; csrf?: boolean; origin?: string; ip?: string };
  const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown, opts: Opts = {}) =>
    app.inject({
      method,
      url,
      payload: body as object | undefined,
      remoteAddress: opts.ip ?? "10.0.0.1",
      headers: {
        ...(opts.csrf === false ? {} : { "x-connect-csrf": "1" }),
        ...(opts.origin ? { origin: opts.origin } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
    });

  const cookieOf = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers["set-cookie"];
    const first = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
    return first ? first.split(";")[0]! : "";
  };

  const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s]+)/.exec(text)![1]!);

  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };

  /** Registers, verifies (and optionally approves via an admin cookie) a member. */
  async function registerMember(username: string, password = "correct horse battery", ip?: string) {
    const res = await call("POST", "/api/v1/auth/register", {
      fullName: `${username} Test`,
      username,
      email: `${username}@example.org`,
      password,
      confirmPassword: password,
      acceptTerms: true,
    }, { ip });
    const mail = email.outbox.at(-1)!;
    await call("POST", "/api/v1/auth/verify-email", { token: tokenFrom(mail.text) });
    return res;
  }

  /** Bootstraps nahid007, enrolls MFA, returns the full admin cookie and TOTP secret. */
  async function adminSession(password = "a very long admin password") {
    await bootstrapAdmin(handle.db, { username: "nahid007", email: "admin@example.org", password });
    const login = await call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password });
    const restricted = cookieOf(login);
    const enroll = await call("POST", "/api/v1/auth/mfa/enroll", {}, { cookie: restricted });
    const secret = enroll.json().secret as string;
    const confirm = await call(
      "POST",
      "/api/v1/auth/mfa/enroll/confirm",
      { code: totp(secret) },
      { cookie: restricted }
    );
    return { cookie: restricted, secret, recoveryCodes: confirm.json().recoveryCodes as string[], password };
  }

  /** An active, signed-in member: { cookie, id, username }. */
  let memberCount = 0;
  async function activeMember(username: string, password = "correct horse battery") {
    // Distinct client addresses so per-IP registration limits do not interfere with multi-user tests.
    const ip = `10.9.${Math.floor(memberCount / 250)}.${(memberCount++ % 250) + 1}`;
    await registerMember(username, password, ip);
    await handle.db.update(users).set({ status: "active" }).where(eq(users.username, username));
    const cookie = cookieOf(await call("POST", "/api/v1/auth/login/member", { identifier: username, password }, { ip }));
    const id = (await handle.db.select().from(users).where(eq(users.username, username)))[0]!.id;
    return { cookie, id, username };
  }

  const totp = (secret: string) => generateSync({ secret, epoch: Math.floor(clock.now.getTime() / 1000) });

  return { app, db: handle.db, close: handle.close, email, clock, files, livekit, call, cookieOf, tokenFrom, advance, registerMember, activeMember, adminSession, totp };
}

export type TestApp = Awaited<ReturnType<typeof testApp>>;
