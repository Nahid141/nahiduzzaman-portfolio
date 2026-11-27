# Private Connect: Deployment

Status: design only. Nothing has been deployed, and no cloud resource, DNS record or firewall rule
has been created. Each of those needs the owner's explicit approval.

## Placement

- **Do not** run Private Connect on the PRRSLooM VM (`instance-20261114-064217`). PRRSLooM analyses are
  memory-heavy, and a 10-person SFU needs steady CPU and bandwidth. A separate VM keeps one from starving the other.
- Proposed: one new VM `connect-1` (e2-standard-4: 4 vCPU, 16 GB) running Nginx, connect-backend,
  PostgreSQL 16 and Redis 7 under Docker Compose with memory limits; LiveKit on the same VM for a
  first deployment, or LiveKit Cloud to avoid running TURN.

## Domains (to be created only after approval)

- `connect-api.fnunahiduzzaman.com` → Nginx → connect-backend :8020 (HTTPS + WSS)
- `connect-media.fnunahiduzzaman.com` → LiveKit (Phase 5)

## Ports (self-hosted LiveKit, per LiveKit docs; confirm at deploy time)

443/tcp (HTTPS, WSS, TURN/TLS), 80/tcp (ACME), 7881/tcp (WebRTC TCP fallback),
50000–60000/udp (WebRTC media), 3478/udp (TURN/UDP).

## Environment variables (names only; values come from Secret Manager)

`NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `CONNECT_SITE_ORIGIN`, `CONNECT_DATA_KEY` (32-byte base64),
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, later `GCS_BUCKET`,
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. See `services/connect-backend/.env.example`.

## Rough monthly cost estimate (unverified list-price approximations; check current GCP and LiveKit pricing)

| Item | Estimate |
|---|---|
| e2-standard-4 VM, us-central1, always on | about $100 |
| 100 GB balanced persistent disk | about $10 |
| Static external IP | a few dollars |
| GCS storage, 100 GB | about $2 |
| Internet egress for meetings: a 10-person call at ~3 Mbit/s down per person ≈ 13–14 GB/hour; at ~$0.12/GB | about $1.5–2 per meeting-hour |
| Cloud SQL instead of local Postgres (smallest shared-core) | add roughly $10–30 |
| LiveKit Cloud instead of self-hosting | depends on its current participant-minute and bandwidth pricing |

## Backups

Nightly `pg_dump` to a separate private GCS bucket with 30-day retention; quarterly restore test
(procedure to be written and executed in Phase 8).
