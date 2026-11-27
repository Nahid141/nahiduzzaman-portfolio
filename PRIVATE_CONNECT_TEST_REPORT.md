# Private Connect: Test Report

Only tests that were actually executed are listed as passing.

## 2026-11-27, against the real services (Supabase, Resend; LiveKit pending)

**Automated suite on Supabase PostgreSQL 17.12** (isolated `connect_test` database through the session pooler,
verify-full TLS; the test helper refuses any database whose name does not end in `_test`):

| Run | Result |
|---|---|
| First run (before fixes) | 83/90 passed; 7 realtime tests failed (socket race, timestamp precision) |
| After the gateway and `0003` fixes, full suite | **90/90 passed** (7 files, 983 s) |
| Re-run of the files changed afterwards (`admin.test.ts`, `files.test.ts`) | **28/28 passed** |
| Local PGlite, full suite after all changes (91 tests incl. the new reset test) | **91/91 passed** |

**Live service checks** (`npm run db:verify`, `storage:setup`, `services:check`):
TLS 1.3 authorised against the Supabase CA; migrations applied; RLS on 28/28 tables, 0 policies, no Data API
grants; REST reads of users/messages/files with the secret key → `403 42501`; private bucket with 50 MB limit and
MIME allow-list, text/html refused, public URL refused, signed upload/download/delete work; Resend accepted a
message from `noreply@fnunahiduzzaman.com` (test inbox `delivered@resend.dev`). LiveKit: **failed**, the secret in
`.env` is a masked `••••` value; not retested yet.

**Production-mode start** with the real `.env` (`NODE_ENV=production`): config validation passes, health 200,
foreign origin 403, HSTS/CSP/no-store headers present, resident memory about 104 MB (Render Free allows 512 MB).

**Browser run** (installed Chrome driven headless by playwright-core; `next build` + `next start`; backend on a
throwaway `connect_e2e` Supabase database with real Storage; admin on a 1280×900 window, member on a 390×844
mobile viewport): **21/21 steps passed**, with no unexpected console errors: landing; admin login → forced MFA
enrolment with a real TOTP → recovery codes → console; wrong password 401; member registration; email
verification link; pending member refused; admin approval; member dashboard; live chat between the two
browsers; image upload with progress, verification and a signed download URL (200, image/png); HTML disguised
as PNG rejected (`signature_mismatch`) and its object deleted; audio + PDF attachments in chat; music request →
admin "Play next" → both see it playing; PDF presentation followed to page 2 on the phone (canvas render);
whiteboard; conference page without LiveKit; live announcement on the member dashboard; members/messages/
settings pages; member blocked from admin data (403). Screenshots were reviewed; the music progress bar bug
was found this way. Not covered: meetings (LiveKit), real audio output, multiple real devices.

## 2026-11-27, Phases 4 to 7 ($0 stack)

`npm test` → **7 files, 89 tests, all passed** on PGlite (new: `files.test.ts` 15, `meetings.test.ts` 9,
`collab.test.ts` 9, plus one config test). Storage and LiveKit are replaced by in-memory fakes in these tests.

| Spec test (§19) | Result |
|---|---|
| 9. File upload validation (type allow-list, extension/MIME pairing, per-kind and 50 MB limits, signature and size verification, malware verdict) | Pass |
| 10. Private file access (non-participant and admin get 404 on URL, metadata, delete and listing) | Pass |
| 11. Ten-participant limit with simultaneous joins (11 concurrent → exactly 10 admitted, 11th gets `meeting_full`) | Pass on PGlite (single connection, so concurrency is serialised by the driver; the row lock is what protects real Postgres and is not yet exercised there) |
| 12. Abandoned reservations free seats; connected participants keep them | Pass |
| 13. Waiting room, lock, invite-only isolation, host controls, one-way mute | Pass |
| 14. Music sync state machine (approval, server-timed start, pause/seek positions, stale-version 409, single advance on concurrent "ended") | Pass |
| 15. Presentation control and pointer limited to controllers; Follow Host gated by settings | Pass |
| Quotas: storage per user and total (incl. 8 concurrent requests), egress, meeting minutes | Pass |
| Database lockdown: RLS on every public table | Pass (PGlite); Data API grant revocation only applies where Supabase roles exist |
| Config: remote DB requires CA, `sslmode` refused, console email refused in production | Pass |

Mutation check: removing the room access check from file downloads made the private-file test fail.

Frontend: `tsc`, `eslint app/connect`, `next build` clean (20 `/connect` routes). Not clicked through in a browser.
Not yet run: anything against Supabase, Render or LiveKit Cloud (credentials pending), sync accuracy on real devices,
load tests.

## 2026-11-27, Phase 3

`npm test` → **4 files, 55 tests, all passed** (12 new in `test/realtime.test.ts`, using a real listening
server and real socket.io clients).

| Spec test (§19) | Result |
|---|---|
| 7. Live messaging between multiple sessions | Pass (delivery, dedupe by clientId, history) |
| 8. Private message isolation incl. WebSocket subscriptions and direct API | Pass: non-participant and admin get no live event, 404 on history/receipts, empty search, subscribe and send refused |
| 19. WebSocket reconnection and state recovery | Partial: reconnect after revocation is refused; connection-state recovery is configured but not tested |
| 21. Suspended user revocation across API and WebSocket | Pass (socket disconnected, reconnect refused; logout cuts the session's socket) |
| Rate limiting of message floods | Pass (16th message in 10 s refused) |
| Restricted channels | Pass (invisible to non-members, send/subscribe refused) |
| Mentions only notify people who can see the message | Pass |

Mutation check: giving admins access to private conversations made the isolation test fail.

Frontend: `tsc`, `eslint app/connect`, `next build` clean. The chat UI was **not** clicked through in a
real browser yet.

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
