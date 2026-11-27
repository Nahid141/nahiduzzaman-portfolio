# Private Connect: Plan

Spec: `C:\Users\nahid_vv0xche\Downloads\PRIVATE_CONNECT_MASTER_PROMPT.md` (copied to `docs/private-connect/SPEC.md`).
Branch: `feature/private-connect` (based on `site-redesign` at 77327ee, which is open as PR #7).
Route: `/connect` on www.fnunahiduzzaman.com. Initial administrator username: `nahid007`.

The spec covers eight largely independent subsystems. Each phase below gets its own
task-level plan in `docs/superpowers/plans/` when it starts, and each phase must leave the
system working and tested on its own. Phase 2's detailed plan is
`docs/superpowers/plans/2026-11-27-private-connect-phase2-auth.md`.

## Phase overview

| Phase | Scope | Depends on | Status |
|---|---|---|---|
| 1 | Discovery, architecture, schema outline, threat model, dependency evaluation | none | Done (this document set) |
| 2 | Connect backend service, PostgreSQL schema + migrations, Argon2id auth, sessions, registration, email verification, approval workflow, admin TOTP MFA + recovery codes, password reset, admin user management, audit log, bootstrap script, frontend auth pages and guarded shell | 1 | In progress |
| 3 | Socket.IO gateway (authenticated, per-event authorization), Redis presence, general + admin-created channels, messages (reactions, replies, edits, deletes, mentions, pins, receipts, search), private conversations, notifications, shared dashboard state with versioning | 2 | Not started |
| 4 | Private GCS bucket, signed upload/download URLs, signature/MIME validation, quarantine + ClamAV scan, previews, quotas, retention | 2, 3 | Not started |
| 5 | LiveKit (self-hosted or Cloud), meeting service with atomic 10-participant cap, waiting room, host controls, screen sharing queue | 2, 3 | Not started |
| 6 | Music lounge (request/approve queue, server-authoritative playback state, clock-offset sync, drift correction), synchronized video/PDF/slides, Follow Host Mode | 3, 4 | Not started |
| 7 | Whiteboard, polls, scheduling, PWA (no private-data caching), accessibility pass | 3–6 | Not started |
| 8 | Playwright E2E, load tests, security review, Docker/Nginx/CI, staging deploy, production checklist | all | Not started |

## Decisions taken in Phase 1

1. **Separate backend service** (`services/connect-backend`, Node 24 + TypeScript + Fastify 5),
   deployed on its own GCP VM behind Nginx at `connect-api.fnunahiduzzaman.com`. Vercel cannot
   hold WebSockets, and the PRRSLooM VM must not absorb this workload.
2. **Drizzle ORM** instead of Prisma (the spec allows an equivalent). Reason: Drizzle runs the
   same schema against `node-postgres` in production and against **PGlite** (PostgreSQL compiled
   to WASM) in tests, so tests hit real PostgreSQL semantics on a machine with no Docker/Postgres.
3. **Sessions:** opaque 256-bit random tokens, stored only as SHA-256 hashes, sent as a host-only
   `__Host-`-style cookie on the API origin (`HttpOnly; Secure; SameSite=Strict; Path=/`).
   The site and API are same-site (same registrable domain), so browser fetches with
   `credentials: "include"` carry the cookie. CSRF: Origin allow-list + required
   `X-Connect-CSRF: 1` header on state-changing requests (not sendable cross-origin without CORS approval).
4. **Passwords:** Argon2id via `@node-rs/argon2` (m=19 MiB, t=2, p=1, OWASP minimum).
5. **Admin MFA:** TOTP (RFC 6238) via `otplib`; 10 single-use recovery codes stored as Argon2id hashes.
   Admin privileged endpoints refuse to work until MFA is enrolled.
6. **Redis** is behind small interfaces (`RateLimitStore`, later `PresenceStore`) with an in-memory
   implementation for tests/dev and `ioredis` in production.
7. **Email** behind an `EmailSender` interface: `ConsoleEmailSender` (dev only, never in production),
   `SmtpEmailSender` (production; credentials via env/secret manager). Production email provider is
   an open decision for the owner.
8. **E2EE:** Phase 2/3 ship server-side access control + TLS + encryption at rest only, and the UI
   must not claim E2EE. E2EE for private messages is evaluated in Phase 3 (candidate: libsignal via
   `@signalapp/libsignal-client`, AGPL-3.0 — licence is a blocker that needs the owner's decision;
   alternative: Matrix Olm/Megolm via `vodozemac`, Apache-2.0). See PRIVATE_CONNECT_SECURITY.md.

## Open decisions for the owner

- Email provider for verification/reset mail (e.g. Google Workspace SMTP relay, SendGrid, Postmark).
- LiveKit self-hosted on a new VM vs LiveKit Cloud (cost and ops trade-off in PRIVATE_CONNECT_DEPLOYMENT.md).
- Managed PostgreSQL (Cloud SQL) vs PostgreSQL on the new VM.
- E2EE library licence (see decision 8).
- Creating any paid GCP resource, DNS record or firewall rule (needs explicit approval).
