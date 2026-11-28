# Private Connect Phase 2 (Authentication & Administration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone, tested auth + admin backend (`services/connect-backend`) and the `/connect` auth pages, so only approved members and an MFA-verified admin can reach a guarded dashboard shell.

**Architecture:** Fastify 5 app built by `buildApp(deps)` so tests inject PGlite, an in-memory rate-limit store and an in-memory email outbox. Drizzle schema + committed SQL migrations. Opaque hashed session tokens in an HttpOnly cookie. Next.js pages call the API with `credentials: "include"`.

**Tech Stack:** Node 24, TypeScript, Fastify 5, @fastify/cookie, @fastify/cors, @fastify/helmet, Drizzle ORM 0.45 + drizzle-kit, pg, @electric-sql/pglite, zod 4, @node-rs/argon2, otplib 13, Vitest, tsx.

**Spec:** `docs/private-connect/SPEC.md` sections 2, 3, 12 (user management + global settings), 15, 16, 17. Architecture: `PRIVATE_CONNECT_ARCHITECTURE.md`.

## Global Constraints

- Initial administrator username: `nahid007`; created only by `scripts/bootstrap-admin.ts` with hidden-input password; no default password anywhere.
- Argon2id for passwords and recovery codes.
- Account states: `pending_verification`, `pending`, `active`, `rejected`, `suspended`, `banned` (spec's "pending" split into before/after email verification).
- Manual approval required by default (`require_approval = true`).
- Verification and recovery tokens: expiring, single-use, stored as hashes; no account enumeration.
- Cookie: `HttpOnly; Secure; SameSite=Strict; Path=/`; `Cache-Control: no-store` on every API response.
- Admin role never assignable via registration or client input; last active admin cannot be removed.
- Audit logs never contain passwords, tokens, keys or private content.

## Review Focus

1. Registration with an email/username that differs only in letter case from an existing one → treated as duplicate (citext / lower-cased unique index).
2. Reusing a verification or reset link a second time → rejected, no state change.
3. A suspended user's existing session cookie → 401 on the very next request.
4. Admin with correct password but no MFA enrolled → can only reach MFA enrollment, nothing else under `/admin`.
5. Same IP hammering login with different usernames → rate-limited even though each account sees few failures.

---

### Task 1: Service scaffold, config, health

**Files:** Create `services/connect-backend/{package.json,tsconfig.json,vitest.config.ts,.env.example,.gitignore}`, `src/config.ts`, `src/app.ts`, `src/health/routes.ts`; Test `test/health.test.ts`.

**Interfaces — Produces:** `loadConfig(env): Config`; `buildApp(deps: AppDeps): Promise<FastifyInstance>` where `AppDeps = { config, db, rateLimit, email, now?: () => Date }`.

- [ ] Test: `GET /api/v1/health` → 200 `{status:"ok"}` with `cache-control: no-store`; unknown route → 404 JSON.
- [ ] Test: `loadConfig({NODE_ENV:"production"})` without `CONNECT_DATA_KEY` throws.
- [ ] Implement; run `npm test`; commit.

### Task 2: Schema, migrations, test DB helper

**Files:** `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `src/db/migrations/*`, `test/helpers.ts`.

**Produces:** `createDb(url | {pglite: true})`, `migrate(db)`, `testApp(): {app, db, outbox, clock}`.

- [ ] Tables exactly as in the architecture doc; unique indexes on `lower(username)`, `lower(email)`, `token_hash`.
- [ ] Generate migration with `npx drizzle-kit generate`; test helper applies it to a fresh PGlite per test file.
- [ ] Test: inserting two users with emails `A@x.org` / `a@x.org` violates uniqueness.

### Task 3: Crypto utilities

**Files:** `src/lib/crypto.ts`, `src/lib/totp.ts`; Test `test/crypto.test.ts`.

**Produces:** `randomToken(): string` (32 bytes base64url), `sha256(s): string`, `hashPassword`, `verifyPassword`, `encryptSecret/decryptSecret(key, s)` (AES-256-GCM), `generateTotpSecret()`, `totpUri(user, secret)`, `verifyTotp(secret, code, now)`, `generateRecoveryCodes(): string[]` (10 × `xxxx-xxxx`).

- [ ] Tests: hash verifies / wrong password fails; encrypt→decrypt roundtrip, tampered ciphertext throws; TOTP valid in window, invalid outside.

### Task 4: Registration and email verification

**Files:** `src/auth/routes.ts` (register, verify-email), `src/lib/email.ts`, `src/lib/audit.ts`; Test `test/register.test.ts`.

- [ ] Tests: valid body → 202 and one outbox mail containing a token; duplicate email → identical 202 body, no second user; weak password (<12 chars) → 400; `role:"admin"` in body ignored; verify token → user `pending` and admins get an outbox notification; reused token → 400; expired (clock +25 h) → 400; with `require_approval=false` → `active`.

### Task 5: Login, sessions, logout, rate limiting

**Files:** `src/auth/session.ts`, `src/lib/rateLimit.ts`, routes in `src/auth/routes.ts`; Test `test/login.test.ts`.

**Produces:** `requireUser` / `requireAdmin` Fastify preHandlers; `request.user`, `request.session`.

- [ ] Tests: active member logs in via `/login/member` → cookie set with HttpOnly/Secure/SameSite=Strict; `/me` works; member via `/login/admin` → 401 generic; pending user → 403 `account_pending`; wrong password → 401 generic; 6th failure for an account within 15 min → 429; 21 attempts from one IP across usernames → 429; logout → `/me` 401; missing CSRF header on POST → 403; suspended user's old cookie → 401.

### Task 6: Admin MFA and recovery codes

**Files:** `src/auth/mfa.ts`; Test `test/mfa.test.ts`.

- [ ] Tests: admin password login without MFA → session limited to enrollment (`mfa_enrollment_required` on `/admin/*`); enroll + confirm with valid code → returns 10 codes once; next login returns `{step:"mfa", ticket}`; valid TOTP → full session; recovery code works once; wrong code ×5 → 429.

### Task 7: Password change, forgot, reset

- [ ] Tests: change requires current password and revokes other sessions; forgot for unknown email → same 202, no mail; reset token single-use, revokes all sessions, new password logs in.

### Task 8: Admin user management, settings, audit

**Files:** `src/admin/routes.ts`; Test `test/admin.test.ts`.

- [ ] Tests: member calling `/admin/users` → 403; approve pending → active; suspend → sessions revoked; demote the only admin → 409 `last_admin`; settings toggle persists; audit log has entries without any `password`/`token` keys.

### Task 9: Bootstrap script

**Files:** `scripts/bootstrap-admin.ts`; Test `test/bootstrap.test.ts` (calls exported `bootstrapAdmin(db, username, password)`).

- [ ] Tests: creates `nahid007` as active admin with MFA not yet enrolled; second run does not create a duplicate or change the password unless `--reset-password`; password < 14 chars rejected. CLI reads password twice with echo disabled.

### Task 10: Frontend auth pages and guarded shell

**Files:** `app/connect/layout.tsx` (noindex), `app/connect/page.tsx` (gateway), `login/`, `admin/login/`, `member/login/`, `register/`, `forgot-password/`, `reset-password/`, `verify-email/`, `dashboard/`, `admin/` pages; `app/connect/_lib/api.ts`; discreet "Connect" link in footer.

- [ ] `npx tsc --noEmit`, `npx eslint app/connect`, `npx next build` pass; manual run against local backend: register → verify (dev console mail) → admin approves → member reaches dashboard.
