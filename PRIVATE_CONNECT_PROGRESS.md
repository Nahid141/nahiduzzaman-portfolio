# Private Connect: Progress

Resumable checkpoint for future sessions. Update after every major phase.

## Last verified checkpoint: 2026-11-27, Phases 4 to 7 built on the $0 stack (not yet deployed)

Owner decision (2026-11-27): target $0/month. Supabase Free (Postgres + Storage), Render Free (backend), LiveKit
Cloud Build (meetings), Brevo/Resend (email over HTTPS, because Render Free blocks SMTP). The GCP VM plan is dropped;
`deploy/install.sh` remains only as an optional self-hosting path.

### Done in this round (tested on PGlite; 89 backend tests pass)

- **Supabase readiness:** verify-full TLS with the Supabase CA (`DATABASE_CA_FILE`/`DATABASE_CA_PEM`; `sslmode` in the URL
  refused), pool size 5, Redis optional, `HOST`/`TRUST_PROXY` for Render. Migration `0002_files_meetings_lounge` adds
  13 tables and then enables RLS on every public table and revokes all Data API grants (no policies).
  `scripts/configure-supabase.ps1` (hidden input, percent-encoding, writes git-ignored `.env`, restricts ACL),
  `scripts/verify-db.ts` (TLS check, migration review, `--migrate`, audit of tables/indexes/checks/RLS/grants),
  `scripts/setup-storage.ts` (private bucket + signed-URL round trip), guarded real-Postgres test mode
  (`TEST_DATABASE_URL` must name a `*_test` database).
- **Phase 4 files:** signed direct uploads, server-side verification (size, signature, SHA-256), optional hash-only
  VirusTotal lookup, room-scoped access, 5-minute download links, forced attachment for non-media, moderation,
  folders, expiry, search, cleanup job, storage/egress quotas; Files page (drag and drop, multiple, progress,
  previews), chat attachments.
- **Phase 5 meetings:** LiveKit tokens/rooms/webhooks, 10-person cap with transactional admission and seat
  reservations, waiting room, lock, invite-only, host controls (admit/deny/remove/mute/screen-share policy and
  grants/transfer/end), raise hand, share requests, minute quota; Meetings page with LiveKit VideoConference
  (grid/speaker, screen share, device menus, chat), reactions over the data channel.
- **Phase 6:** versioned shared state with conflict responses, music lounge (requests, admin/DJ approval,
  server-timed start, pause/seek/next/previous/repeat/shuffle, DJ grants with expiry, clock-offset sync and
  drift correction, Enable Audio, local volume), synchronised presentations (PDF via pdf.js, video, image,
  audio, whiteboard) with presenter pointer and leave/follow toggle, Follow Host Mode (offer banner).
- **Phase 7 (partial):** polls, whiteboard, announcements, activity feed, live dashboard, admin limits/flags/
  system metrics, PWA manifest without a service worker, cold-start wake banner.

### Not done / honest gaps

- Nothing has run against Supabase, Render or LiveKit yet: waiting for the owner to run `configure-supabase.ps1`.
- Not built: background blur, picture-in-picture button, music ducking, lyrics, scheduled-meeting calendar UI,
  shared notes, bookmarks, tasks, reminders, push notifications, QR invites, DND status, light theme,
  presentation requests from members, profile pictures, malware scanning beyond hash lookup, load testing.
- Browser click-through of the new pages has not been done.

### Phase 3 (real-time messaging), done

- Schema `0001_messaging`: channels (public/restricted) + members, conversations (1:1 unique per pair via
  `direct_key`, invitation-only groups) + participants (archive, mute), messages (one-target CHECK, clientId
  de-duplication, replies, forwards, mentions, pins, edit/delete), reactions (fixed emoji set), read states,
  blocks, notifications; `#general` seeded.
- Socket.IO gateway at `/api/v1/socket`: Origin allow-list + session-cookie handshake, admin must have
  passed MFA, every event re-checks the session and account, per-user event and message rate limits,
  zod payload validation, acknowledgements, typing, read receipts (by message id), presence, explicit
  subscribe authorization, connection-state recovery. Suspend/ban/role change/password reset disconnect
  all of the user's sockets; logout and session revoke disconnect that session's sockets.
- REST: channels (+ admin create), history pagination, conversations, receipts, archive/mute, full-text
  search limited to accessible rooms, members with presence, blocks, notifications.
- Admins have **no** implicit access to private conversations (tested); admins may delete messages in
  shared channels (moderation).
- Production: Redis rate limiting, presence and the socket.io Redis adapter; `REDIS_URL` required.
- Frontend: `/connect/chat` (channels, unread badges, search, connection status), `/connect/messages`
  (1:1 and group, archive, mute, block, seen-up-to receipts), `/connect/members` (online status, message).
- Deferred to later phases with reasons: attachments and voice messages (Phase 4 file pipeline), link
  previews (needs SSRF-safe fetcher), E2EE (see SECURITY).

### Deployment status

See PRIVATE_CONNECT_DEPLOYMENT.md (Supabase + Render + LiveKit Cloud). The earlier GCP approval is superseded
by the $0 decision; no GCP resources were created.

### Done

- **Phase 1:** inspection, plan, architecture, threat model, deployment design, dependency/licence check
  (all MIT or Apache-2.0). Docs: PRIVATE_CONNECT_{PLAN,ARCHITECTURE,SECURITY,DEPLOYMENT}.md.
- **Phase 2 backend** (`services/connect-backend`): schema + migration `0000_init`, Argon2id, hashed opaque
  sessions (7 d absolute / 12 h idle), registration → email verification → pending → admin approval,
  admin-only login door with mandatory TOTP MFA + 10 hashed single-use recovery codes, password
  change/forgot/reset, own-session list/revoke, admin users/stats/actions/role/settings/audit/security-events,
  last-admin protection, CSRF (origin + custom header), CORS allow-list, rate limits, scrubbed audit log,
  `npm run bootstrap-admin` (hidden-input, idempotent, no default password).
- **Phase 2 frontend** (`app/connect/*`): gateway, member login, admin login + MFA step + recovery code,
  MFA setup with recovery-code display, register, verify-email, forgot/reset password, three-panel
  workspace shell, dashboard (real data only), settings (password + sessions), admin console
  (approve/reject/suspend/ban/reactivate, promote/demote, settings toggles, audit). Modules from later
  phases show an explicit "not built yet" state. `/connect/*` is `noindex`; small footer link added.

### Decisions made during Phase 2

- "pending" is split into `pending_verification` (email not confirmed) and `pending` (awaiting approval).
- Username collisions are reported (409) because usernames are visible to members anyway; email
  collisions are never revealed (identical 202, owner gets an email).
- Promoting a member to admin clears MFA and signs them out, so the new admin must enroll their own TOTP.
- Profile pictures are deferred to Phase 4 (needs the private file pipeline).
- `maintenanceMode` is stored but not enforced until there is something to put in maintenance.

### Next steps

1. Finish deployment (see above), then run the smoke test against production.
2. After `.env` exists: `npm run db:verify`, `npm run db:migrate`, `npm run storage:setup`, run the suite against
   `connect_test` (`verify-db.ts --create-test-db`, then `TEST_DATABASE_URL=... npm test`), bootstrap the admin.
3. Render Blueprint, Namecheap CNAME, Vercel env, LiveKit webhook; then browser click-through and a production smoke test.

### How to run locally

```bash
cd services/connect-backend
npm install
npm test                                  # 55 tests on PGlite
npm run bootstrap-admin -- --email you@example.org   # prompts for a password (hidden)
npm run dev                               # http://127.0.0.1:8020, dev mail printed to console
# in the repo root
npm run dev                               # http://localhost:3000/connect
```
