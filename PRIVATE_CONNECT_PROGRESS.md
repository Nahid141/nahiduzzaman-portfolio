# Private Connect: Progress

Resumable checkpoint for future sessions. Update after every major phase.

## Last verified checkpoint: 2026-11-27, Phase 3 complete, deployment prepared

Branch `feature/private-connect` (pushed to GitHub, not merged). Base: `site-redesign` @ 77327ee.

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

- Owner approved (2026-11-27): Google Workspace SMTP, new GCP VM + DNS + firewall, pushing the branch.
- Prepared: `services/connect-backend/deploy/{install.sh,set-smtp.sh,connect-backend.service,nginx-connect-api.conf}`.
- Waiting on the owner: `gcloud auth login` (token expired), Namecheap A record for
  `connect-api.fnunahiduzzaman.com`, a Google app password entered via `set-smtp.sh`, Vercel env
  `NEXT_PUBLIC_CONNECT_API_URL`.

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
2. Phase 4: private GCS bucket, signed uploads, scanning, attachments in chat, profile pictures.
3. Shared dashboard state with versioning (spec section 4) together with Phase 6 Follow Host Mode.

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
