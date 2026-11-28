import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { users } from "../src/db/schema.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
  await t.close();
});

const PW = "correct horse battery";
const reg = (over: Record<string, unknown> = {}) => ({
  fullName: "Ada Member",
  username: "ada",
  email: "ada@example.org",
  password: PW,
  confirmPassword: PW,
  acceptTerms: true,
  ...over,
});
const userRow = async (username: string) =>
  (await t.db.select().from(users).where(eq(users.username, username)))[0]!;

describe("registration and email verification", () => {
  it("creates a pending_verification member and mails a verification link", async () => {
    const res = await t.call("POST", "/api/v1/auth/register", reg({ role: "admin" }));
    expect(res.statusCode).toBe(202);
    const u = await userRow("ada");
    expect(u.role).toBe("member");
    expect(u.status).toBe("pending_verification");
    expect(t.email.outbox).toHaveLength(1);
    expect(t.email.outbox[0]!.text).toContain("/connect/verify-email?token=");
  });

  it("does not reveal an existing email: identical 202, no second account, owner is told", async () => {
    await t.call("POST", "/api/v1/auth/register", reg());
    const again = await t.call("POST", "/api/v1/auth/register", reg({ username: "ada2", email: "ADA@example.org" }));
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual((await t.call("POST", "/api/v1/auth/register", reg({ username: "bob", email: "bob@example.org" }))).json());
    expect((await t.db.select().from(users)).map((u) => u.username).sort()).toEqual(["ada", "bob"]);
    expect(t.email.outbox[1]!.subject).toMatch(/registration attempt/);
  });

  it("rejects short passwords, mismatched confirmation and missing terms", async () => {
    expect((await t.call("POST", "/api/v1/auth/register", reg({ password: "short", confirmPassword: "short" }))).statusCode).toBe(400);
    expect((await t.call("POST", "/api/v1/auth/register", reg({ confirmPassword: "different password!" }))).statusCode).toBe(400);
    expect((await t.call("POST", "/api/v1/auth/register", reg({ acceptTerms: false }))).statusCode).toBe(400);
  });

  it("reports a taken username (case-insensitive)", async () => {
    await t.call("POST", "/api/v1/auth/register", reg());
    const res = await t.call("POST", "/api/v1/auth/register", reg({ username: "ADA", email: "x@example.org" }));
    expect(res.statusCode).toBe(409);
  });

  it("verification moves the account to pending, is single-use, and notifies admins", async () => {
    const admin = await t.adminSession();
    expect(admin.recoveryCodes).toHaveLength(10);
    t.email.outbox.length = 0;
    await t.call("POST", "/api/v1/auth/register", reg());
    const token = t.tokenFrom(t.email.outbox[0]!.text);
    const ok = await t.call("POST", "/api/v1/auth/verify-email", { token });
    expect(ok.json()).toEqual({ status: "pending" });
    expect(t.email.outbox.some((m) => m.to === "admin@example.org" && /awaiting approval/.test(m.subject))).toBe(true);
    expect((await t.call("POST", "/api/v1/auth/verify-email", { token })).statusCode).toBe(400);
  });

  it("verification links expire after 24 hours", async () => {
    await t.call("POST", "/api/v1/auth/register", reg());
    t.advance(25 * 3600 * 1000);
    const res = await t.call("POST", "/api/v1/auth/verify-email", { token: t.tokenFrom(t.email.outbox[0]!.text) });
    expect(res.statusCode).toBe(400);
  });

  it("activates directly when manual approval is turned off", async () => {
    const admin = await t.adminSession();
    await t.call("PUT", "/api/v1/admin/settings", { requireApproval: false }, { cookie: admin.cookie });
    await t.registerMember("eve");
    expect((await userRow("eve")).status).toBe("active");
  });

  it("refuses registration when the admin closes it", async () => {
    const admin = await t.adminSession();
    await t.call("PUT", "/api/v1/admin/settings", { registrationEnabled: false }, { cookie: admin.cookie });
    expect((await t.call("POST", "/api/v1/auth/register", reg())).statusCode).toBe(403);
  });
});

describe("member login and sessions", () => {
  async function activeMember(username = "ada") {
    await t.registerMember(username, PW);
    await t.db.update(users).set({ status: "active" }).where(eq(users.username, username));
  }

  it("signs in an active member with a hardened cookie", async () => {
    await activeMember();
    const res = await t.call("POST", "/api/v1/auth/login/member", { identifier: "ADA@example.org", password: PW });
    expect(res.statusCode).toBe(200);
    const raw = String(res.headers["set-cookie"]);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    const me = await t.call("GET", "/api/v1/auth/me", undefined, { cookie: t.cookieOf(res) });
    expect(me.json().user.username).toBe("ada");
  });

  it("gives one generic error for wrong password, unknown user and wrong login door", async () => {
    await activeMember();
    const wrong = await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "nope nope nope" });
    const unknown = await t.call("POST", "/api/v1/auth/login/member", { identifier: "ghost", password: PW });
    const adminDoor = await t.call("POST", "/api/v1/auth/login/admin", { identifier: "ada", password: PW });
    for (const r of [wrong, unknown, adminDoor]) {
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({ error: "invalid_credentials" });
    }
  });

  it("explains pending accounts only after the correct password", async () => {
    await t.registerMember("ada", PW);
    const res = await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("account_pending");
  });

  it("locks an account after 5 attempts in 15 minutes", async () => {
    await activeMember();
    for (let i = 0; i < 5; i++) await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "bad password x" });
    const sixth = await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW });
    expect(sixth.statusCode).toBe(429);
    t.advance(16 * 60 * 1000);
    expect((await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW })).statusCode).toBe(200);
  });

  it("limits one IP spraying many usernames", async () => {
    for (let i = 0; i < 20; i++) {
      await t.call("POST", "/api/v1/auth/login/member", { identifier: `user${i}`, password: "guess guess" }, { ip: "9.9.9.9" });
    }
    const next = await t.call("POST", "/api/v1/auth/login/member", { identifier: "another", password: "guess" }, { ip: "9.9.9.9" });
    expect(next.statusCode).toBe(429);
  });

  it("logout revokes the session", async () => {
    await activeMember();
    const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    await t.call("POST", "/api/v1/auth/logout", {}, { cookie });
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie })).statusCode).toBe(401);
  });

  it("expires idle sessions after 12 hours", async () => {
    await activeMember();
    const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    t.advance(13 * 3600 * 1000);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie })).statusCode).toBe(401);
  });

  it("a suspended user's existing cookie stops working immediately", async () => {
    await activeMember();
    const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    await t.db.update(users).set({ status: "suspended" }).where(eq(users.username, "ada"));
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie })).statusCode).toBe(401);
  });

  it("lists and revokes own sessions only", async () => {
    await activeMember("ada");
    await activeMember("bob");
    const a1 = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    const a2 = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    const b = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "bob", password: PW }));
    const list = (await t.call("GET", "/api/v1/auth/sessions", undefined, { cookie: a1 })).json();
    expect(list).toHaveLength(2);
    const other = list.find((s: { current: boolean }) => !s.current);
    expect((await t.call("DELETE", `/api/v1/auth/sessions/${other.id}`, undefined, { cookie: b })).statusCode).toBe(404);
    expect((await t.call("DELETE", `/api/v1/auth/sessions/${other.id}`, undefined, { cookie: a1 })).statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: a2 })).statusCode).toBe(401);
  });
});

describe("passwords", () => {
  async function login() {
    await t.registerMember("ada", PW);
    await t.db.update(users).set({ status: "active" }).where(eq(users.username, "ada"));
    return t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
  }

  it("change needs the current password and signs out other sessions", async () => {
    const c1 = await login();
    const c2 = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: PW }));
    const bad = await t.call("POST", "/api/v1/auth/password/change", { currentPassword: "nope", newPassword: "a brand new password" }, { cookie: c1 });
    expect(bad.statusCode).toBe(401);
    const ok = await t.call("POST", "/api/v1/auth/password/change", { currentPassword: PW, newPassword: "a brand new password" }, { cookie: c1 });
    expect(ok.statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: c1 })).statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: c2 })).statusCode).toBe(401);
  });

  it("forgot-password looks the same for unknown emails and sends nothing", async () => {
    const res = await t.call("POST", "/api/v1/auth/password/forgot", { email: "nobody@example.org" });
    expect(res.statusCode).toBe(202);
    expect(t.email.outbox).toHaveLength(0);
  });

  it("reset is single-use, revokes sessions and sets the new password", async () => {
    const cookie = await login();
    t.email.outbox.length = 0;
    await t.call("POST", "/api/v1/auth/password/forgot", { email: "ada@example.org" });
    const token = t.tokenFrom(t.email.outbox[0]!.text);
    expect((await t.call("POST", "/api/v1/auth/password/reset", { token, password: "reset password here" })).statusCode).toBe(200);
    expect((await t.call("POST", "/api/v1/auth/password/reset", { token, password: "another one entirely" })).statusCode).toBe(400);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie })).statusCode).toBe(401);
    expect((await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "reset password here" })).statusCode).toBe(200);
  });

  it("reset links expire after one hour", async () => {
    await login();
    t.email.outbox.length = 0;
    await t.call("POST", "/api/v1/auth/password/forgot", { email: "ada@example.org" });
    t.advance(61 * 60 * 1000);
    const res = await t.call("POST", "/api/v1/auth/password/reset", { token: t.tokenFrom(t.email.outbox[0]!.text), password: "reset password here" });
    expect(res.statusCode).toBe(400);
  });
});
