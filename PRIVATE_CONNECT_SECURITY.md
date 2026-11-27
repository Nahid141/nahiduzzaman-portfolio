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
- **At rest:** managed disk encryption (GCP default) + application-level AES-256-GCM for TOTP secrets.
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

## Residual risks (current)

- Email delivery not configured; verification and reset depend on choosing a provider.
- Single-VM deployment has no high availability.
- E2EE absent (documented above).
- No dependency vulnerability scanning in CI yet (Phase 8).
