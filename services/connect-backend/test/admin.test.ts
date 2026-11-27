import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapAdmin } from "../scripts/bootstrap-admin.js";
import { auditLogs, users } from "../src/db/schema.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
  await t.close();
});

const ADMIN_PW = "a very long admin password";
const idOf = async (username: string) => (await t.db.select().from(users).where(eq(users.username, username)))[0]!.id;

describe("bootstrap script", () => {
  it("creates nahid007 once, as an active admin without MFA, and never overwrites silently", async () => {
    expect(await bootstrapAdmin(t.db, { username: "nahid007", email: "admin@example.org", password: ADMIN_PW })).toBe("created");
    expect(await bootstrapAdmin(t.db, { username: "nahid007", email: "admin@example.org", password: "another long password" })).toBe("unchanged");
    const [u] = await t.db.select().from(users);
    expect(u).toMatchObject({ username: "nahid007", role: "admin", status: "active", mfaEnabled: false });
    expect(
      await bootstrapAdmin(t.db, { username: "nahid007", email: "x", password: "another long password", resetPassword: true })
    ).toBe("password_reset");
  });

  it("a password reset also signs the admin out everywhere and requires MFA enrolment again", async () => {
    const admin = await t.adminSession();
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: admin.cookie })).statusCode).toBe(200);
    const fresh = "a brand new admin password";
    await bootstrapAdmin(t.db, { username: "nahid007", email: "x", password: fresh, resetPassword: true });
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: admin.cookie })).statusCode).toBe(401);
    expect((await t.db.select().from(users))[0]).toMatchObject({ mfaEnabled: false, totpSecretEnc: null });
    const login = await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: fresh });
    expect(login.json()).toEqual({ step: "enroll_mfa" });
  });

  it("rejects short admin passwords", async () => {
    await expect(bootstrapAdmin(t.db, { username: "nahid007", email: "a@b.c", password: "short pw" })).rejects.toThrow(/at least 14/);
  });
});

describe("admin MFA", () => {
  it("an admin without MFA can only enroll", async () => {
    await bootstrapAdmin(t.db, { username: "nahid007", email: "admin@example.org", password: ADMIN_PW });
    const login = await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW });
    expect(login.json()).toEqual({ step: "enroll_mfa" });
    const cookie = t.cookieOf(login);
    const res = await t.call("GET", "/api/v1/admin/users", undefined, { cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mfa_enrollment_required");
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie })).json().mfaEnrollmentRequired).toBe(true);
  });

  it("enrollment rejects a wrong code, then later logins need TOTP", async () => {
    await bootstrapAdmin(t.db, { username: "nahid007", email: "admin@example.org", password: ADMIN_PW });
    const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW }));
    const { secret } = (await t.call("POST", "/api/v1/auth/mfa/enroll", {}, { cookie })).json();
    expect((await t.call("POST", "/api/v1/auth/mfa/enroll/confirm", { code: "000000" }, { cookie })).statusCode).toBe(400);
    expect((await t.call("POST", "/api/v1/auth/mfa/enroll/confirm", { code: t.totp(secret) }, { cookie })).statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/admin/users", undefined, { cookie })).statusCode).toBe(200);

    const step = (await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW })).json();
    expect(step.step).toBe("mfa");
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket: step.ticket, code: "123456" })).statusCode).toBe(401);
    const ok = await t.call("POST", "/api/v1/auth/mfa/verify", { ticket: step.ticket, code: t.totp(secret) });
    expect(ok.statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/admin/users", undefined, { cookie: t.cookieOf(ok) })).statusCode).toBe(200);
    // The ticket is single-use.
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket: step.ticket, code: t.totp(secret) })).statusCode).toBe(401);
  });

  it("a recovery code works exactly once", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    const code = admin.recoveryCodes[0]!;
    const login = async () => (await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW })).json().ticket;
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket: await login(), recoveryCode: code.toUpperCase() })).statusCode).toBe(200);
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket: await login(), recoveryCode: code })).statusCode).toBe(401);
  });

  it("limits MFA guesses per ticket", async () => {
    await t.adminSession(ADMIN_PW);
    const { ticket } = (await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW })).json();
    for (let i = 0; i < 5; i++) await t.call("POST", "/api/v1/auth/mfa/verify", { ticket, code: "000000" });
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket, code: "000000" })).statusCode).toBe(429);
  });

  it("MFA tickets expire after 5 minutes", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    const { ticket } = (await t.call("POST", "/api/v1/auth/login/admin", { identifier: "nahid007", password: ADMIN_PW })).json();
    t.advance(6 * 60 * 1000);
    expect((await t.call("POST", "/api/v1/auth/mfa/verify", { ticket, code: t.totp(admin.secret) })).statusCode).toBe(401);
  });
});

describe("admin user management", () => {
  it("members cannot reach admin endpoints", async () => {
    await t.adminSession(ADMIN_PW);
    await t.registerMember("ada");
    await t.db.update(users).set({ status: "active" }).where(eq(users.username, "ada"));
    const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "correct horse battery" }));
    for (const [m, url] of [
      ["GET", "/api/v1/admin/users"],
      ["GET", "/api/v1/admin/settings"],
      ["GET", "/api/v1/admin/audit"],
    ] as const) {
      expect((await t.call(m, url, undefined, { cookie })).statusCode).toBe(403);
    }
    expect((await t.call("POST", `/api/v1/admin/users/${await idOf("ada")}/ban`, {}, { cookie })).statusCode).toBe(403);
    expect((await t.call("GET", "/api/v1/admin/users")).statusCode).toBe(401);
  });

  it("approve, suspend (revoking sessions), reactivate, with emails and audit trail", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    await t.registerMember("ada");
    const id = await idOf("ada");
    const pending = (await t.call("GET", "/api/v1/admin/users?status=pending", undefined, { cookie: admin.cookie })).json();
    expect(pending.map((u: { username: string }) => u.username)).toEqual(["ada"]);

    expect((await t.call("POST", `/api/v1/admin/users/${id}/approve`, {}, { cookie: admin.cookie })).json().status).toBe("active");
    expect(t.email.outbox.at(-1)!.text).toMatch(/approved/);
    const member = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "correct horse battery" }));
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: member })).statusCode).toBe(200);

    await t.call("POST", `/api/v1/admin/users/${id}/suspend`, {}, { cookie: admin.cookie });
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: member })).statusCode).toBe(401);
    // Approving a suspended user is not a valid transition.
    expect((await t.call("POST", `/api/v1/admin/users/${id}/approve`, {}, { cookie: admin.cookie })).statusCode).toBe(409);
    expect((await t.call("POST", `/api/v1/admin/users/${id}/reactivate`, {}, { cookie: admin.cookie })).json().status).toBe("active");

    const log = (await t.call("GET", "/api/v1/admin/audit", undefined, { cookie: admin.cookie })).json();
    const actions = log.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["user.approve", "user.suspend", "user.reactivate", "auth.mfa_enrolled"]));
    const raw = JSON.stringify(await t.db.select().from(auditLogs));
    expect(raw).not.toMatch(/password|token|secret|argon2/i);
  });

  it("refuses to suspend, ban or demote the last active admin", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    const id = await idOf("nahid007");
    for (const action of ["suspend", "ban"]) {
      const res = await t.call("POST", `/api/v1/admin/users/${id}/${action}`, {}, { cookie: admin.cookie });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("last_admin");
    }
    const demote = await t.call("POST", `/api/v1/admin/users/${id}/role`, { role: "member" }, { cookie: admin.cookie });
    expect(demote.json().error).toBe("last_admin");
  });

  it("promoting a member to admin signs them out and requires their own MFA", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    await t.registerMember("ada");
    const id = await idOf("ada");
    await t.call("POST", `/api/v1/admin/users/${id}/approve`, {}, { cookie: admin.cookie });
    const member = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: "ada", password: "correct horse battery" }));
    expect((await t.call("POST", `/api/v1/admin/users/${id}/role`, { role: "admin" }, { cookie: admin.cookie })).statusCode).toBe(200);
    expect((await t.call("GET", "/api/v1/auth/me", undefined, { cookie: member })).statusCode).toBe(401);
    const step = (await t.call("POST", "/api/v1/auth/login/admin", { identifier: "ada", password: "correct horse battery" })).json();
    expect(step.step).toBe("enroll_mfa");
  });

  it("stats reflect real counts", async () => {
    const admin = await t.adminSession(ADMIN_PW);
    await t.registerMember("ada");
    await t.registerMember("bob");
    const stats = (await t.call("GET", "/api/v1/admin/stats", undefined, { cookie: admin.cookie })).json();
    expect(stats.totalMembers).toBe(3);
    expect(stats.byStatus).toEqual({ active: 1, pending: 2 });
  });
});
