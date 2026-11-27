# Private Connect: Security and Threat Model

Status: Phase 2 design. Not yet reviewed for production. Do not deploy publicly before the Phase 8 review.

## Assets

Account credentials and sessions; admin MFA secrets and recovery codes; private conversations and files;
member personal data (name, email, bio, avatar); meeting access; audit logs; infrastructure secrets
(DB, Redis, SMTP, GCS, LiveKit API secret, `CONNECT_DATA_KEY`).

## Actors

Anonymous internet users and bots; registered but unapproved users; approved members; suspended or banned
users with leftover sessions; the administrator; an attacker who stole a member's password; infrastructure
operators (VM, database or cloud access).

## Threats and controls (STRIDE)

| Threat | Control (phase) |
|---|---|
| Credential stuffing / brute force | Per-IP and per-account rate limits on login, MFA, forgot-password; generic error messages; security_events log; Argon2id hashing (2) |
| Account enumeration | register/forgot always return 202 with identical bodies; login returns one generic error (2) |
| Privilege escalation via registration | role column defaults to `member`; no client field maps to role; separate admin login checks server role (2) |
| Session theft | HttpOnly, Secure, SameSite=Strict cookie; tokens stored hashed; idle + absolute expiry; revoke on password change, suspend, ban (2) |
| CSRF | Strict origin allow-list + custom header requirement on every state change; CORS allows only the site origin (2) |
| XSS | React escaping; no `dangerouslySetInnerHTML` for user content; CSP on API responses via helmet; CSP for `/connect` pages (3) |
| SQL injection | Drizzle parameterized queries only; no raw string SQL with input (2) |
| Admin takeover | TOTP MFA mandatory before any admin action; recovery codes hashed; no default password; bootstrap prompts hidden input (2) |
| Last admin lockout | role/status changes refuse to leave zero active admins (2) |
| Token replay (verify/reset) | 32-byte tokens, hashed, single-use, 1 h (reset) / 24 h (verify) expiry (2) |
| Suspended user keeps access | sessions revoked immediately; socket disconnect + LiveKit removal in later phases (2/3/5) |
| Private message leakage | per-conversation room authorization on subscribe and every event; never broadcast private events (3) |
| File-based attacks | signature checks, quarantine, ClamAV, no inline HTML/SVG rendering, short-lived signed URLs (4) |
| Meeting capacity races | atomic DB/Redis reservation with TTL; LiveKit `maxParticipants` set per room (5) |
| Secrets exposure | env/secret manager only; `.env.example` has names, never values; logs redact `authorization`, `cookie`, `password`, `token` (2) |
| Search indexing of private pages | `robots: noindex` on `/connect/*` and `Cache-Control: no-store` on API (2) — not a security control |

## Encryption

- **In transit:** TLS everywhere (Vercel, Nginx with Let's Encrypt, WSS, LiveKit DTLS-SRTP).
- **In transit (database):** node-postgres verifies the Supabase CA chain and host name (`verify-full`
  equivalent); `sslmode` in the URL is refused so it cannot silently weaken this.
- **At rest:** provider-managed encryption (Supabase Postgres and Storage) + application-level AES-256-GCM
  for TOTP secrets.
- **End-to-end:** NOT implemented in Phase 2/3. The UI must say "private" only in the access-control sense.
  Server-side access control means the application prevents other members from reading a conversation,
  but anyone with database or VM access (the infrastructure operator) technically could. E2EE would remove
  that, at the cost of server-side search, moderation, server-side backup restore of readable history, and
  simpler multi-device sync (each device needs its own keys; new devices cannot read old history without
  key backup). Candidate libraries: `vodozemac` (Olm/Megolm, Apache-2.0) or libsignal (AGPL-3.0, licence
  decision required). No custom cryptography will be written.

## Logging rules

Audit logs record actor, action, target and non-sensitive metadata. Never: passwords, tokens, TOTP secrets,
recovery codes, cookie values, private message bodies, file contents.

## Supabase-specific controls

- Every table in `public` has row level security enabled and **no policies**, and all privileges are
  revoked from `anon`, `authenticated` and `service_role` (migration 0002, verified by
  `scripts/verify-db.ts` and a test). The Data API therefore exposes nothing even if it is enabled;
  turning the Data API off in the dashboard is recommended as a second layer (Storage keeps working).
- The backend is the only database client; it connects as the table owner over the session pooler.
- The Storage secret key exists only in the backend environment. Browsers receive signed URLs: uploads
  valid ~2 h for one path, downloads 5 minutes. The bucket is private and restricts MIME types and size.

## File-sharing controls (Phase 4)

- Allow-list of extension + MIME pairs; SVG, HTML and executables are refused. The stored bytes are
  verified (size, signature) before the file becomes visible; mismatches are deleted.
- Files that are not safe media are always served as attachments (`download=`), from the Supabase origin,
  never from the site origin. PDFs in the presentation view render through pdf.js as canvas pixels.
- Malware: there is no free scanner that fits Render Free (ClamAV needs ~1 GB RAM). Files are labelled
  "not malware-scanned" unless `VIRUSTOTAL_API_KEY` is set, which enables a **hash-only** lookup (file
  contents never leave Supabase; only known malware is detected). ZIP files are never extracted server-side.
- Abandoned uploads (2 h) and expired files are deleted every 10 minutes.

## Meetings (Phase 5)

- LiveKit tokens: 10-minute TTL, scoped to one opaque room, identity = user id, publish sources limited by
  the meeting's policy, no room-admin or recording grants. A webhook (signature-verified) that reports an
  identity the database never admitted triggers removal from the room.
- Recording is not implemented (off). Media is encrypted in transit (DTLS-SRTP) but LiveKit Cloud can
  technically see it; LiveKit E2EE would need per-meeting key distribution through this backend, which
  would then know the key, so it is not enabled. Background blur is not implemented.

## Residual risks (current)

- Render Free restarts or sleeps the single instance; in-memory rate limits and presence reset then.
- `TRUST_PROXY=1` assumes Render adds exactly one proxy hop; confirm after the first deploy.
- E2EE absent for messages (documented above) and media.
- Free-tier caps are enforced by this app's counters, which are estimates (egress is charged per signed
  URL, not per byte actually transferred).
- No dependency vulnerability scanning in CI yet.
