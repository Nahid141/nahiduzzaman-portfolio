# Private Connect: Test Report

Only tests that were actually executed are listed as passing.

## 2026-11-27, Phase 2

### Automated (Vitest, PGlite = real PostgreSQL in WASM)

`cd services/connect-backend && npm test` → **3 files, 43 tests, all passed.**

| Spec test (§19) | Covered by | Result |
|---|---|---|
| 1. Admin login and MFA | admin.test.ts: enroll-only before MFA, wrong/valid TOTP, ticket single-use, ticket expiry, recovery code once | Pass |
| 2. Invalid logins and rate limiting | auth.test.ts: generic errors, 5-per-account lock, 20-per-IP spray limit; admin.test.ts: MFA guess limit | Pass |
| 3. Registration and email verification | auth.test.ts: pending_verification, enumeration-safe duplicate email, validation, single-use + 24 h expiry, approval toggle, closed registration | Pass |
| 4. Admin approval and rejection | admin.test.ts: approve/suspend/reactivate with mail + audit, invalid transition 409 | Pass |
| 5. Unauthorized dashboard access | auth.test.ts `/me` 401 without/after logout/idle; admin.test.ts unauthenticated admin API 401 | Pass |
| 6. Member hitting admin endpoints | admin.test.ts: 403 on users/settings/audit/actions | Pass |
| 21. Suspended user revocation (API part) | auth.test.ts + admin.test.ts: cookie dead immediately | Pass (WebSocket/media parts: later phases) |
| 23. Negative authorization checks | CSRF header/origin, foreign session revoke 404, last-admin 409, audit has no secrets | Pass |

Mutation check: removing the `status !== "active"` guard in `loadAuth` made exactly one test fail
("a suspended user's existing cookie stops working immediately"), confirming the test is not vacuous.

### Live smoke test against a running dev server

`npx tsx scripts/e2e-smoke.ts <pw-file> <log-file>` with the backend on :8020 (PGlite on disk, console mail):
**16/16 steps passed**: register → verify → pending blocked → admin password → enroll-only → MFA enrolled
→ approve → member signs in → member blocked from admin → CORS refuses foreign origin → second admin
login needs TOTP → suspend revokes the member's session. The server log contained neither password
nor any cookie value.

### Frontend

- `npx tsc --noEmit`, `npx eslint app/connect app/layout.tsx`: clean.
- `npx next build`: success; all 18 `/connect/*` routes built.
- `next dev`: every `/connect/*` page returned 200 with a `noindex` robots tag; `/` has none.
- **Not done:** a browser-driven (Playwright) run of the forms. The pages were not clicked through in a
  real browser in this session.

### Not yet tested (later phases)

Tests 7–20, 22, 24–25 of §19 depend on Phases 3–8.
