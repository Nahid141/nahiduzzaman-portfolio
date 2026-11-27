import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { users } from "../src/db/schema.js";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  verifyPassword,
  verifyTotp,
} from "../src/lib/crypto.js";
import { scrub } from "../src/lib/services.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await testApp();
});
afterAll(async () => {
  await t.app.close();
  await t.close();
});

describe("health and plumbing", () => {
  it("returns minimal health with no-store and noindex", async () => {
    const res = await t.call("GET", "/api/v1/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toContain("noindex");
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await t.call("GET", "/api/v1/nope");
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });

  it("rejects state-changing requests without the CSRF header or from a foreign origin", async () => {
    expect((await t.call("POST", "/api/v1/auth/logout", {}, { csrf: false })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/auth/logout", {}, { origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/auth/logout", {}, { origin: "http://localhost:3000" })).statusCode).toBe(200);
  });
});

describe("config", () => {
  it("refuses to start in production without a data key, database or https origin", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/CONNECT_DATA_KEY/);
    const key = Buffer.alloc(32, 1).toString("base64");
    expect(() => loadConfig({ NODE_ENV: "production", CONNECT_DATA_KEY: key })).toThrow(/DATABASE_URL/);
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CONNECT_DATA_KEY: key,
        DATABASE_URL: "postgres://u@127.0.0.1/db",
        SMTP_HOST: "smtp",
        MAIL_FROM: "a@b.c",
        CONNECT_SITE_ORIGIN: "http://insecure",
      })
    ).toThrow(/https/);
  });

  it("requires verified TLS for a remote database and a real mail provider in production", () => {
    const base = {
      NODE_ENV: "production",
      CONNECT_DATA_KEY: Buffer.alloc(32, 1).toString("base64"),
      MAIL_FROM: "Private Connect <a@b.c>",
      CONNECT_SITE_ORIGIN: "https://www.example.org",
      EMAIL_PROVIDER: "brevo",
      EMAIL_API_KEY: "k",
    };
    const remote = "postgresql://postgres.ref:pw@aws-1-us-east-2.pooler.supabase.com:5432/postgres";
    const pem = "-----BEGIN CERTIFICATE-----\\nAAAA\\n-----END CERTIFICATE-----";
    expect(() => loadConfig({ ...base, DATABASE_URL: remote })).toThrow(/DATABASE_CA/);
    expect(() => loadConfig({ ...base, DATABASE_URL: `${remote}?sslmode=require`, DATABASE_CA_PEM: pem })).toThrow(/sslmode/);
    expect(() => loadConfig({ ...base, DATABASE_URL: remote, DATABASE_CA_PEM: "not a cert" })).toThrow(/PEM/);
    const ok = loadConfig({ ...base, DATABASE_URL: remote, DATABASE_CA_PEM: pem, TRUST_PROXY: "1" });
    expect(ok.databaseCa).toContain("\n");
    expect(ok.trustProxy).toBe(1);
    expect(ok.email.provider).toBe("brevo");
    expect(() => loadConfig({ ...base, DATABASE_URL: remote, DATABASE_CA_PEM: pem, EMAIL_PROVIDER: "console" })).toThrow(/EMAIL_PROVIDER/);
  });
});

describe("crypto", () => {
  it("hashes passwords with Argon2id and verifies them", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong horse battery")).toBe(false);
    expect(await verifyPassword(null, "anything")).toBe(false);
  });

  it("encrypts secrets with AES-GCM and detects tampering", () => {
    const key = Buffer.alloc(32, 3);
    const enc = encryptSecret(key, "JBSWY3DPEHPK3PXP");
    expect(decryptSecret(key, enc)).toBe("JBSWY3DPEHPK3PXP");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1]! ^= 1;
    expect(() => decryptSecret(key, buf.toString("base64"))).toThrow();
  });

  it("accepts a current TOTP code and rejects one from far away", () => {
    const secret = generateTotpSecret();
    const now = t.clock.now;
    expect(verifyTotp(secret, t.totp(secret), now)).toBe(true);
    expect(verifyTotp(secret, t.totp(secret), new Date(now.getTime() + 10 * 60 * 1000))).toBe(false);
    expect(verifyTotp(secret, "12ab56", now)).toBe(false);
  });

  it("generates ten distinct recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/));
  });

  it("scrubs secret-looking keys from audit metadata", () => {
    expect(scrub({ password: "x", resetToken: "y", totpSecret: "z", recoveryCode: "w", role: "admin" })).toEqual({ role: "admin" });
  });
});

describe("schema", () => {
  it("treats emails and usernames case-insensitively unique", async () => {
    const base = { fullName: "A", passwordHash: "x" };
    await t.db.insert(users).values({ ...base, username: "CaseUser", email: "Case@Example.org" });
    await expect(t.db.insert(users).values({ ...base, username: "other", email: "case@example.org" })).rejects.toThrow();
    await expect(t.db.insert(users).values({ ...base, username: "caseuser", email: "new@example.org" })).rejects.toThrow();
  });
});
