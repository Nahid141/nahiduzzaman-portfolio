/**
 * Read-mostly checks of the deployed backend. Never prints secrets.
 *
 *   node --env-file=.env --import tsx scripts/check-production.ts [--api https://connect-api.fnunahiduzzaman.com]
 *
 * Side effects, all temporary or intended: two rejected webhook attempts are recorded in security_events (that is
 * the control being tested), and a test meeting row is created, ended by a real LiveKit webhook, then deleted.
 */
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { createHash } from "node:crypto";
import tls from "node:tls";
import pg from "pg";
import { io } from "socket.io-client";
import { loadConfig } from "../src/config.js";

const argv = process.argv.slice(2);
const API = argv.includes("--api") ? argv[argv.indexOf("--api") + 1]! : "https://connect-api.fnunahiduzzaman.com";
const SITE = "https://www.fnunahiduzzaman.com";
const config = loadConfig({ ...process.env, NODE_ENV: "development" });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const req = (path: string, init: RequestInit = {}) => fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(90_000) });

/* TLS and basics */
const host = new URL(API).hostname;
const cert = await new Promise<tls.PeerCertificate>((resolve, reject) => {
  const s = tls.connect({ host, port: 443, servername: host }, () => { resolve(s.getPeerCertificate()); s.end(); });
  s.on("error", reject);
});
check("TLS certificate valid for the API host", Boolean(cert.subject), `issuer ${cert.issuer?.O ?? cert.issuer?.CN}, expires ${cert.valid_to}`);
const health = await req("/api/v1/health");
check("GET /api/v1/health", health.status === 200 && (await health.json()).status === "ok");
const h = health.headers;
check("security headers (HSTS, CSP, frame-ancestors, no-store)", Boolean(h.get("strict-transport-security") && /frame-ancestors 'none'/.test(h.get("content-security-policy") ?? "") && h.get("cache-control") === "no-store"));
const time = await req("/api/v1/time");
const serverNow = (await time.json()).now as number;
check("GET /api/v1/time (clock within 5 s)", Math.abs(serverNow - Date.now()) < 5000, `${serverNow - Date.now()} ms`);
const render = await fetch("https://connect-backend-x15t.onrender.com/api/v1/health", { signal: AbortSignal.timeout(90_000) });
check("Render URL health", render.status === 200);

/* Authentication and CSRF */
for (const p of ["/api/v1/auth/me", "/api/v1/members", "/api/v1/files", "/api/v1/meetings", "/api/v1/admin/stats"]) {
  const r = await req(p, { headers: { origin: SITE } });
  check(`GET ${p} without a session is refused`, r.status === 401 || r.status === 403, String(r.status));
}
const pre = await req("/api/v1/auth/login/member", { method: "OPTIONS", headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-connect-csrf" } });
check("CORS preflight from the site is allowed with credentials", pre.headers.get("access-control-allow-origin") === SITE && pre.headers.get("access-control-allow-credentials") === "true");
const evil = await req("/api/v1/auth/login/member", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
check("CORS preflight from a foreign origin is not allowed", !evil.headers.get("access-control-allow-origin"));
const noCsrf = await req("/api/v1/auth/login/member", { method: "POST", headers: { origin: SITE, "content-type": "application/json" }, body: "{}" });
check("POST without the CSRF header is refused", noCsrf.status === 403, String(noCsrf.status));
const badLogin = await req("/api/v1/auth/login/member", {
  method: "POST",
  headers: { origin: SITE, "content-type": "application/json", "x-connect-csrf": "1" },
  body: JSON.stringify({ identifier: `no_such_user_${Date.now()}`, password: "not-a-real-password-123" }),
});
check("login for an unknown account gets the generic 401", badLogin.status === 401, String(badLogin.status));
const sockErr = await new Promise<string>((resolve) => {
  const s = io(API, { path: "/api/v1/socket", transports: ["websocket"], reconnection: false, extraHeaders: { origin: SITE }, timeout: 30_000 });
  s.on("connect", () => { s.close(); resolve("connected"); });
  s.on("connect_error", (e) => { s.close(); resolve(e.message); });
});
check("WebSocket without a session is refused", sockErr === "unauthenticated", sockErr);

/* LiveKit webhook: signature validation */
if (!config.livekit) throw new Error("LiveKit is not configured in .env");
const hook = `${API}/api/v1/livekit/webhook`;
const body = JSON.stringify({ event: "room_started", id: `EV_check_${Date.now()}`, createdAt: Math.floor(Date.now() / 1000), room: { name: `no-such-room-${Date.now()}` } });
const signed = async (b: string) => {
  const at = new AccessToken(config.livekit!.apiKey, config.livekit!.apiSecret);
  at.sha256 = createHash("sha256").update(b).digest("base64");
  return at.toJwt();
};
const post = (b: string, auth?: string) =>
  fetch(hook, { method: "POST", headers: { "content-type": "application/webhook+json", ...(auth ? { authorization: auth } : {}) }, body: b, signal: AbortSignal.timeout(60_000) });
check("webhook without a signature is rejected", (await post(body)).status === 401);
const auth = await signed(body);
check("webhook with a tampered body is rejected", (await post(body.replace("room_started", "room_finished"), auth)).status === 401);
const good = await post(body, auth);
check("webhook with a valid signature is accepted", good.status === 200, String(good.status));

/* LiveKit webhook: real delivery from LiveKit Cloud */
const ca = config.databaseCa || undefined;
const db = new pg.Client({ connectionString: config.databaseUrl, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
await db.connect();
const room = `webhook-check-${Date.now()}`;
const admin = (await db.query("select id from users where role = 'admin' order by created_at limit 1")).rows[0]?.id;
const { rows: [mtg] } = await db.query(
  "insert into meetings (title, room, created_by, host_id, status) values ('Webhook delivery check', $1, $2, $2, 'live') returning id",
  [room, admin]
);
const rooms = new RoomServiceClient(config.livekit.url.replace(/^wss:/, "https:"), config.livekit.apiKey, config.livekit.apiSecret);
try {
  await rooms.createRoom({ name: room, emptyTimeout: 30 });
  await new Promise((r) => setTimeout(r, 3000));
  await rooms.deleteRoom(room); // LiveKit Cloud then sends room_finished to the production webhook
  let status = "live";
  const until = Date.now() + 90_000;
  while (status === "live" && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    status = (await db.query("select status from meetings where id = $1", [mtg.id])).rows[0].status;
  }
  check("LiveKit Cloud delivered room_finished and the backend ended the meeting", status === "ended", status);
} finally {
  await db.query("delete from meetings where id = $1", [mtg.id]);
  await db.end();
}

/* Frontend */
const site = await fetch(`${SITE}/`, { signal: AbortSignal.timeout(30_000) });
check("website home page", site.status === 200);
const connect = await fetch(`${SITE}/connect`, { signal: AbortSignal.timeout(30_000) });
console.log(`INFO  ${SITE}/connect -> ${connect.status}${connect.status === 404 ? " (not merged to main yet)" : ""}`);

console.log(`\n${failures ? `${failures} check(s) FAILED` : "All production checks passed."}`);
process.exit(failures ? 1 : 0);
