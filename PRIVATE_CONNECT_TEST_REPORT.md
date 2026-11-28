# Private Connect: Test Report

Only tests that were actually executed are listed as passing.

## 2026-11-27, production backend and frontend connectivity

**Deployed backend** (`scripts/check-production.ts` against `https://connect-api.fnunahiduzzaman.com`): 19/19 passed.
TLS (Google Trust Services, expires 2027-02-26); health; HSTS/CSP/no-store; server clock within 0.5 s; Render URL
health; 401 for me/members/files/meetings/admin-stats without a session; CORS preflight allowed for
`https://www.fnunahiduzzaman.com` with credentials and refused for a foreign origin; POST without the CSRF header 403;
unknown login generic 401; WebSocket without a session refused. LiveKit webhook: unsigned 401, tampered 401, valid
signature 200, and **real delivery**: a test meeting row was created, its LiveKit room created and deleted, LiveKit
Cloud sent `room_finished` to the production webhook and the backend ended the meeting (row deleted afterwards).

**Root cause of "cannot reach / server sleeping"**: `/connect` is not on the production site yet (main not merged), so
the pages were opened on a Vercel preview. A `*.vercel.app` origin is not allowed by the API (by design) and could not
hold the `__Host-` SameSite=Strict cookie anyway; a preview built before `NEXT_PUBLIC_CONNECT_API_URL` existed also
falls back to `http://localhost:8020`. The client then retried every network failure for ~55 s and blamed a
sleeping server. Fixed in the client (`app/connect/_lib/api.ts`): wrong deployment or missing build setting is
reported immediately; a slow answer (cold start; Render holds requests while starting) shows a notice after 4 s with
a 75 s limit; an outright failure is followed by a cookie-less `/health` probe that separates "blocked by the browser"
from "server unreachable" (short 10 s retry only for the latter). The socket no longer retries on such deployments.

**Browser check of the new client against the production API** (this build served under the production origin via a
local mapping inside headless Chrome): wrong credentials → correct message in 0.9 s (member) and 0.4 s (admin); a
request blocked by the client → "blocked" message in 0.4 s; API unreachable → "cannot reach" after 10.2 s; 7 s
delayed answer → "starting up" notice, then the real result; preview host → explanation at load, zero API requests;
navigation Home | Research | Publications | Tools | Blog | Connect | About.

**Website regression** (merged build, phone 390, tablet 820, desktop 1366; all public pages + /tools/prrsloom +
/connect): 24/24 after one fix: the redesigned home page overflowed phones by 49 px (photo deck fan and glow); the
hero now clips horizontally. PRRSLooM, QI-Genex and EGStat-N APIs return the same status and response shape from
the merged build as from the live site. ESLint reports 236 errors in four pre-existing tool files; main has the
identical counts, so none are new (left untouched).

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
