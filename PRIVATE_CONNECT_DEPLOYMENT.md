# Private Connect: Deployment ($0/month target)

Adopted 2026-11-27, replacing the GCP VM plan. Nothing here needs Google Cloud or a payment method.

| Part | Service and plan | Free allowance | How the app stays inside it |
|---|---|---|---|
| Frontend | Vercel (existing site) | existing | `/connect/*` pages only |
| Backend | Render Free web service, region Ohio | 750 instance-hours/month, 512 MB RAM, sleeps after 15 idle minutes, no SMTP ports | one instance; wake-up retry in the client |
| Database | Supabase Free, session pooler | 500 MB, paused after 7 days without activity | pool max 5 |
| Files | Supabase Storage, private bucket `connect-files` | 1 GB storage, 5 GB egress, 50 MB per file | caps: 900 MB total, 150 MB per member, 4 GB downloads/month |
| Meetings | LiveKit Cloud Build | 5,000 participant-minutes, 100 concurrent connections | cap 4,500 minutes/month, 10 per meeting |
| Email | Brevo Free (300/day) or Resend Free (100/day) over HTTPS | provider limits | verification and reset emails only |

Free tiers change; check each provider's pricing page before relying on these numbers.

## One-time setup

Status on 2026-11-27: steps 1 to 3 are done (database migrated through `0003`, bucket `connect-files` created and
checked). Steps 4 to 9 are still to do.

1. **Credentials.** On your PC:
   `powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\configure-supabase.ps1`
   It asks for the database password, the downloaded Supabase CA certificate and (optionally) the Storage secret
   key, LiveKit keys and an email API key, all with hidden input, and writes the git-ignored `.env`.
   To replace one value later: `scripts\set-secret.ps1 LIVEKIT_API_SECRET` (hidden input). Both scripts refuse a
   value made of mask characters (`••••`), which is what a dashboard shows before you reveal or copy a key.
2. **Review and migrate** (in `services/connect-backend`): `npm run db:verify` (review only), then `npm run db:migrate`.
3. **Storage bucket and live service checks:** `npm run storage:setup`, then `npm run services:check` (Data API
   lockdown, email through the provider's test inbox, LiveKit room/token/webhook signature).
4. **Administrator:** `npm run admin:bootstrap -- --email <your address>` (hidden password prompt, at least 14
   characters). Then sign in at `/connect/admin/login` and enrol MFA.
5. **Render:** New → Blueprint → this repository (`render.yaml`, branch `feature/private-connect`). Render asks for the
   `sync: false` values. Paste each one with
   `powershell -ExecutionPolicy Bypass -File services\connect-backend\scripts\copy-env-value.ps1 <NAME>`, which
   copies the value from `.env` to the clipboard without showing it and clears the clipboard after 60 seconds:
   `CONNECT_DATA_KEY`, `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `EMAIL_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
   `CONNECT_DATA_KEY` must be the same value as `.env`: the administrator's MFA secret is encrypted with it in step 4.
6. **DNS (Namecheap):** Advanced DNS → add a CNAME record, host `connect-api`, value = the `onrender.com` target Render
   shows under Custom Domains. Then click Verify in Render. Render issues the TLS certificate.
7. **Vercel:** Project → Settings → Environment Variables: `NEXT_PUBLIC_CONNECT_API_URL` =
   `https://connect-api.fnunahiduzzaman.com` (Production), then redeploy.
8. **LiveKit webhook:** LiveKit Cloud → project Settings → Webhooks → add
   `https://connect-api.fnunahiduzzaman.com/api/v1/livekit/webhook` (signed with the project's API key).
9. **Supabase hardening (optional):** Dashboard → Integrations → Data API → turn it off. Storage keeps working.

The cookie is first-party because `connect-api.fnunahiduzzaman.com` and `www.fnunahiduzzaman.com` are the same
site; do not use the bare `onrender.com` URL in production (browsers would block the cookie).

## Environment variables (names only)

`NODE_ENV`, `HOST`, `PORT` (set by Render), `TRUST_PROXY`, `CONNECT_SITE_ORIGIN`, `CONNECT_DATA_KEY`, `DATABASE_URL`,
`DATABASE_CA_FILE` or `DATABASE_CA_PEM`, `DB_POOL_MAX`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STORAGE_BUCKET`,
`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `MAIL_FROM` (or `SMTP_*` off Render), `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, optional `REDIS_URL`, optional `VIRUSTOTAL_API_KEY`.

## Operating notes

- **Cold starts:** the first request after 15 idle minutes waits about a minute; the UI shows "Waking the server".
- **Supabase pause:** a free project pauses after a week without activity; restore it from the dashboard.
- **Backups:** Supabase Free has no managed backups. Take a manual dump when it matters:
  `pg_dump "<DATABASE_URL>" --no-owner -Fc -f connect-YYYYMMDD.dump` (needs a local `pg_dump` 17).
  Restoring into a fresh project and running `verify-db.ts` is the backup verification.
- **Data key:** `CONNECT_DATA_KEY` encrypts MFA secrets. Keep the `.env` value and the Render value identical, and back
  it up somewhere private. Losing or changing it makes the stored MFA secret unreadable (the administrator would then run
  `bootstrap-admin --reset-password` and enrol MFA again).

## Self-hosting alternative

`services/connect-backend/deploy/` still installs the backend on any Ubuntu 24.04 server (Postgres, Redis, Nginx,
systemd). It is optional and no longer the default.
