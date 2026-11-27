# Private Connect: Progress

Resumable checkpoint for future sessions. Update after every major phase.

## Last verified checkpoint: 2026-11-27, Phase 2 complete locally

Branch `feature/private-connect` (local only, not pushed). Base: `site-redesign` @ 77327ee.

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

### Blockers / owner decisions needed before deployment

1. Email provider (SMTP) for verification and reset mail.
2. Approval to create the GCP VM, static IP, DNS `connect-api.fnunahiduzzaman.com`, firewall rules.
3. PostgreSQL: Cloud SQL vs local on the VM. Redis for multi-instance rate limiting (Phase 3).
4. `NEXT_PUBLIC_CONNECT_API_URL` must be set in Vercel once the API host exists.

### Next steps (Phase 3)

Write `docs/superpowers/plans/<date>-private-connect-phase3-realtime.md`, then: Redis-backed
RateLimitStore and presence; Socket.IO gateway authenticated from the session cookie; channels,
messages, reactions, receipts, search; private conversations with per-room authorization;
notifications; versioned shared dashboard state.

### How to run locally

```bash
cd services/connect-backend
npm install
npm test                                  # 43 tests on PGlite
npm run bootstrap-admin -- --email you@example.org   # prompts for a password (hidden)
npm run dev                               # http://127.0.0.1:8020, dev mail printed to console
# in the repo root
npm run dev                               # http://localhost:3000/connect
```
