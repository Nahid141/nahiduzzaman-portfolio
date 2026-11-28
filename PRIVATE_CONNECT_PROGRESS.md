# Private Connect: Progress

Resumable checkpoint for future sessions. Update after every major phase.

## 2026-11-28: background player and games room (owner request)

- **Play together keeps playing in the background.** The player lives in the `/connect` layout: on Play together it
  sits in the page; on every other Connect page it moves to a corner (same YouTube player, not reloaded), with the
  title, Open, Move to another corner, Mute for me / Join with sound, and Close. Sound continues unless the member
  mutes it; closing stops it on that device only (Play together offers "Open the player" again). It stops on sign-out
  or when leaving Private Connect.
- **Games room with ten multiplayer games:** chess, Ludo (2-4), tic-tac-toe, four in a row, checkers, reversi, five in
  a row, dots and boxes (2-4), snakes and ladders (2-4), rock-paper-scissors. Open a table from Play together; others
  join from the lobby; two-player games start when the second player sits down, the others when the creator starts
  them; anyone can watch. Resign, open a new table, confetti for the winner; results go to the administrator-only
  activity feed.
- **Fair play:** every move is checked on the server (`services/connect-backend/src/games`, chess rules by chess.js),
  dice are rolled on the server with a cryptographic source, rock-paper-scissors picks stay hidden from the opponent
  and spectators until both have chosen. Limits: 3 open tables per person, 10 new tables and 150 actions a minute.
  Tables nobody joins close after a day, idle games after a week; results are deleted after 30 days.
- **Fix found while testing:** starting a video at the moment a page loaded could leave that page showing the old
  (stopped) state, because the first snapshot replaced the newer live update. Snapshots no longer override newer
  versions.

Migration `0005_games` (one table, RLS on, Data API revoked) applied to production.

## 2026-11-28: meeting and Play together fixes (owner feedback)

- **Full screen:** a Full screen button on the call uses the browser's real full-screen mode for the whole call
  (video grid, controls, reactions and chat stay usable); on iPhone Safari, which only allows `<video>` elements to go
  full screen, it covers the whole browser window instead. Escape or the button exits.
- **Meeting chat:** LiveKit's built-in chat panel overflowed the frame and is hidden; a popup chat over the call
  (same LiveKit chat channel) shows an unread count and a 5-second preview of new messages while closed. It is
  rendered into the call area, so it fits on phones and works in full screen.
- **Play together:** the music lounge and Watch together are one page, `/connect/play` (YouTube, synced for everyone);
  `/connect/music` and `/connect/watch` redirect there. The lounge API remains in the backend but is unused.
- **HD screen sharing:** captured at 1080p, sent at up to 3.5 Mbps / 15 fps (sharper text than LiveKit's 2.5 Mbps
  default) with a 720p layer for weaker connections; each viewer receives the layer that fits their screen.
  Bandwidth note: one HD share costs roughly 1.5 GB per viewer-hour of LiveKit Cloud data transfer.

## 2026-11-27 (evening): owner feature round

Requested by the owner and built:

- **Retention:** shared files expire within 5 days (`fileRetentionDays`), public channel messages are deleted after 10
  days (`channelMessageRetentionDays`); direct messages are kept. Both are admin settings; housekeeping runs every
  10 minutes. Notices on the Files page and under channel chat.
- **YouTube:** music-lounge requests take a YouTube link (title checked through YouTube oEmbed, no API key; private or
  non-embeddable videos are refused) and play in YouTube's visible embedded player, synced to the server timeline
  (muted autoplay, "Join with sound"). **Watch together** page: one shared YouTube video hosted by whoever starts it
  (host or admin/DJ controls), floating emoji reactions. Netflix and other subscriptions cannot be relayed (DRM and
  their terms); the page says so and points to Teleparty (each viewer's own account).
- **Meetings:** limit raised to 15 (setting max 15, CHECK 2..15, LiveKit room cap follows). Screen sharing already
  existed and was verified in a real LiveKit call.
- **Buzz:** vibrate (Android browsers; iPhones do not expose vibration to web pages), chime, screen shake and a
  "Buzz back" notice; member-to-member with a 20 s per-pair cooldown and 6/min; only admins buzz everyone; blocked
  members cannot buzz each other; mute per device in Settings.
- **To-do list:** shared, everyone can add/edit/tick/delete, live updates, confetti; administrator-only items are
  amber and never sent to members (clients refetch on a content-free signal).
- **Calendar & coffee:** members request a meeting or coffee at a chosen time (30 min to 120 days ahead, 15-240 min,
  max 3 pending); members see others' approved slots as "Busy"; approval refuses overlaps and creates a highlighted
  admin-only to-do with the date; the requester is notified; cancelling removes the to-do.
- **Profile:** edit display name, bio, status emoji + text; profile photo cropped square and compressed in the
  browser to <= 200 KB (WebP/JPEG), checked server-side (size, real image type), stored in Postgres and served to
  signed-in members only with a versioned private cache.
- **Extras:** "Designed and developed by Nahiduzzaman. You are all invited to take a cup of coffee with me, upon
  availability" on the gateway, sidebar and dashboard with a "Request a coffee chat" button; dashboard to-do and
  watch cards; activity entries for completed tasks and watch parties.
- **Robustness fix found while testing:** an idle database connection ended by the server (failover, maintenance)
  crashed the backend (unhandled pool `error`). The pool now logs and reconnects; regression test added.

Migration `0004_profiles_tasks_requests` applied to production (31 tables, RLS on all, Data API 403 on the new ones).

## Last verified checkpoint: 2026-11-27, Supabase live; Render, DNS, Vercel and LiveKit webhook not done yet

### Done against the real services (2026-11-27, second session)

- **Supabase database:** TLS 1.3 with the CA chain verified; migrations `0000`–`0003` applied to production
  (`postgres`); audit passes (28 tables, RLS on all, 0 policies, no grants for anon/authenticated/service_role,
  6 CHECK constraints, `#general` seeded). Live REST probe with the secret key: `403 42501` on users/messages/files.
- **Supabase Storage:** private bucket `connect-files` (50 MB, MIME allow-list); signed upload, signed download,
  public URL refused, text/html refused, delete. Test objects removed (`scripts/purge-orphan-objects.ts`).
- **Resend:** accepted a message from `noreply@fnunahiduzzaman.com` (Resend test inbox).
- **LiveKit:** NOT working yet. The `LIVEKIT_API_SECRET` in `.env` is 32 mask characters (`•`) copied from the
  dashboard's hidden display. Fix: `scripts/set-secret.ps1 LIVEKIT_API_SECRET`, then `npm run services:check`.
- **Test suite against Supabase** (isolated `connect_test` database): see the test report.
- **Browser run** (Chrome via playwright-core, production build, local backend on a throwaway `connect_e2e`
  database, real Supabase Storage): 21/21 steps, see the test report. The database was dropped afterwards.

### Bugs found and fixed by running against the real database

- Socket.IO: rooms were joined and event handlers registered only after awaited database calls in the
  `connection` handler, so events sent right after connecting were dropped (invisible on PGlite, real over a
  35 ms network). Rooms are now resolved in the handshake middleware and handlers register synchronously.
- Timestamps: Postgres stored microseconds but JavaScript keeps milliseconds, so marking the latest message read
  left it unread. Migration `0003_ms_timestamps` sets every timestamp column to millisecond precision.
- `render.yaml` generated its own `CONNECT_DATA_KEY`, which would not decrypt the MFA secret of an administrator
  bootstrapped locally. It is now `sync: false` and pasted from `.env` (`scripts/copy-env-value.ps1`).
- `bootstrap-admin --reset-password` now also clears MFA and revokes sessions (the recovery path for a lost
  authenticator or data key; before, a lost key meant a permanent lock-out).
- Music lounge showed a full progress bar before the track length was known; the file list ignored
  `targetKind` without `targetId`.

### Phases 4 to 7 built earlier on 2026-11-27 (first tested on PGlite)

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

- Not yet run: Render, the custom domain, Vercel production env, LiveKit (secret pending), a real meeting with
  several devices, music sync accuracy across real devices.
- Not built: background blur, picture-in-picture button, music ducking, lyrics, scheduled-meeting calendar UI,
  shared notes, bookmarks, tasks, reminders, push notifications, QR invites, DND status, light theme,
  presentation requests from members, profile pictures, malware scanning beyond hash lookup, load testing.
- Meetings have not been opened in a browser with a working LiveKit key yet.

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

1. Owner: replace the masked LiveKit secret (`scripts/set-secret.ps1 LIVEKIT_API_SECRET`); then `npm run services:check`.
2. Owner: `npm run admin:bootstrap -- --email <address>` (hidden prompt), sign in, enrol MFA.
3. Owner: Render Blueprint (paste secrets with `copy-env-value.ps1`), Namecheap CNAME, Vercel env, LiveKit webhook
   (PRIVATE_CONNECT_DEPLOYMENT.md steps 5 to 8). Then: production smoke test and a multi-device meeting test.
4. Remaining features (see the gaps list), in order of value: profile pictures, scheduled meetings UI, notes/tasks,
   push notifications, light theme.

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
