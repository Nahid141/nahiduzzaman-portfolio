import { generateSync } from "otplib";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { MemoryEmailSender, MemoryRateLimitStore } from "../src/lib/services.js";
import { bootstrapAdmin } from "../scripts/bootstrap-admin.js";

export const ORIGIN = "http://localhost:3000";

export async function testApp() {
  const handle = await createDb({ pglite: true });
  const email = new MemoryEmailSender();
  const clock = { now: new Date("2026-11-27T12:00:00Z") };
  const config = loadConfig({ NODE_ENV: "test", CONNECT_SITE_ORIGIN: ORIGIN });
  const app = await buildApp({
    config,
    db: handle.db,
    rateLimit: new MemoryRateLimitStore(),
    email,
    now: () => clock.now,
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
  async function registerMember(username: string, password = "correct horse battery") {
    const res = await call("POST", "/api/v1/auth/register", {
      fullName: `${username} Test`,
      username,
      email: `${username}@example.org`,
      password,
      confirmPassword: password,
      acceptTerms: true,
    });
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

  const totp = (secret: string) => generateSync({ secret, epoch: Math.floor(clock.now.getTime() / 1000) });

  return { app, db: handle.db, close: handle.close, email, clock, call, cookieOf, tokenFrom, advance, registerMember, adminSession, totp };
}

export type TestApp = Awaited<ReturnType<typeof testApp>>;
