/**
 * Manual smoke test against a running dev backend (http://127.0.0.1:8020) whose console
 * email output goes to a log file. Not part of `npm test`.
 *
 *   npx tsx scripts/e2e-smoke.ts <file-with-admin-password> <backend-log-file>
 */
import { readFileSync } from "node:fs";
import { generateSync } from "otplib";

const [pwFile, logFile] = process.argv.slice(2) as [string, string];
const BASE = "http://127.0.0.1:8020/api/v1";
const ORIGIN = "http://localhost:3000";
let failures = 0;

function client() {
  let cookie = "";
  return async (path: string, body?: unknown, method?: string) => {
    const res = await fetch(BASE + path, {
      method: method ?? (body ? "POST" : "GET"),
      headers: { "content-type": "application/json", "x-connect-csrf": "1", origin: ORIGIN, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    return { status: res.status, body: await res.json().catch(() => null), setCookie: set };
  };
}

const lastToken = (page: string) => {
  const log = readFileSync(logFile, "utf8");
  const m = [...log.matchAll(new RegExp(`${page}[?]token=([A-Za-z0-9_%-]+)`, "g"))].pop();
  if (!m) throw new Error(`no ${page} link in the log`);
  return decodeURIComponent(m[1]!);
};

const step = (name: string, ok: boolean) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const member = client();
const pwMember = "member password long";
step(
  "register returns 202",
  (await member("/auth/register", { fullName: "E2E Member", username: "e2e_member", email: "member@example.test", password: pwMember, confirmPassword: pwMember, acceptTerms: true })).status === 202
);
await new Promise((r) => setTimeout(r, 300));
step("verify email -> pending", (await member("/auth/verify-email", { token: lastToken("verify-email") })).body?.status === "pending");
const pendingLogin = await member("/auth/login/member", { identifier: "e2e_member", password: pwMember });
step("pending member cannot sign in", pendingLogin.status === 403 && pendingLogin.body?.error === "account_pending");

const admin = client();
const pw = readFileSync(pwFile, "utf8");
const a1 = await admin("/auth/login/admin", { identifier: "nahid007", password: pw });
step("admin password step -> enroll_mfa", a1.body?.step === "enroll_mfa");
step("cookie is HttpOnly + SameSite=Strict", /HttpOnly/i.test(a1.setCookie ?? "") && /SameSite=Strict/i.test(a1.setCookie ?? ""));
step("admin console blocked before MFA", (await admin("/admin/users")).status === 403);
const enroll = await admin("/auth/mfa/enroll", {});
const confirm = await admin("/auth/mfa/enroll/confirm", { code: generateSync({ secret: enroll.body.secret }) });
step("MFA enrolled with 10 recovery codes", confirm.status === 200 && confirm.body.recoveryCodes.length === 10);
const pending = await admin("/admin/users?status=pending");
const target = pending.body.find((u: { username: string }) => u.username === "e2e_member");
step("admin sees the pending member", Boolean(target));
step("admin approves", (await admin(`/admin/users/${target.id}/approve`, {})).body?.status === "active");
step("approved member signs in", (await member("/auth/login/member", { identifier: "e2e_member", password: pwMember })).status === 200);
step("member /me works", (await member("/auth/me")).body?.user?.username === "e2e_member");
step("member blocked from admin API", (await member("/admin/users")).status === 403);
const pre = await fetch(BASE + "/auth/me", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
step("CORS refuses a foreign origin", pre.headers.get("access-control-allow-origin") !== "https://evil.example");
const admin2 = client();
const t = await admin2("/auth/login/admin", { identifier: "nahid007", password: pw });
step("second admin login asks for TOTP", t.body?.step === "mfa");
const v = await admin2("/auth/mfa/verify", { ticket: t.body.ticket, code: generateSync({ secret: enroll.body.secret }) });
step("TOTP gives a working admin session", v.status === 200 && (await admin2("/admin/stats")).status === 200);
step("suspend revokes the member immediately", (await admin(`/admin/users/${target.id}/suspend`, {})).status === 200 && (await member("/auth/me")).status === 401);

console.log(failures ? `\n${failures} step(s) failed` : "\nAll steps passed");
process.exit(failures ? 1 : 0);
