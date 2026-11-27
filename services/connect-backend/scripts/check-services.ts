/**
 * Live checks of the external services configured in .env. Never prints keys or tokens.
 *
 *   node --env-file=.env --import tsx scripts/check-services.ts                 # Data API, email (test inbox), LiveKit
 *   node --env-file=.env --import tsx scripts/check-services.ts --to you@x.y    # send the test email to a real inbox
 *
 * Without --to the email goes to Resend's/Brevo's simulated inbox semantics: delivered@resend.dev accepts mail
 * without delivering it anywhere, which proves the key and the verified sender domain.
 */
import { AccessToken } from "livekit-server-sdk";
import { createHash } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { HttpEmailSender } from "../src/lib/services.js";
import { LiveKitCloud } from "../src/meetings/livekit.js";

const argv = process.argv.slice(2);
const to = argv.includes("--to") ? argv[argv.indexOf("--to") + 1] : undefined;
const config = loadConfig({ ...process.env, NODE_ENV: "development" });
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

/* Supabase Data API: the secret key acts as service_role, which holds no privileges on public tables. */
if (config.storage) {
  for (const table of ["users", "messages", "files"]) {
    const res = await fetch(`${config.storage.url}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: config.storage.secretKey, accept: "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    const blocked = !res.ok && (body.code === "42501" || res.status === 401 || res.status === 403 || res.status === 404);
    check(`Data API cannot read public.${table}`, blocked, `${res.status}${body.code ? ` ${body.code}` : ""}`);
  }
} else console.log("SKIP  Supabase (no SUPABASE_URL / SUPABASE_SECRET_KEY)");

/* Email */
if (config.email.provider === "brevo" || config.email.provider === "resend") {
  const sender = new HttpEmailSender({ provider: config.email.provider, apiKey: config.email.apiKey, from: config.email.from });
  const target = to ?? (config.email.provider === "resend" ? "delivered@resend.dev" : undefined);
  if (!target) console.log("SKIP  email (Brevo has no test inbox; pass --to)");
  else {
    try {
      await sender.send({ to: target, subject: "Private Connect email check", text: "This is a configuration test from Private Connect. No action is needed." });
      check(`${config.email.provider} accepted a message from ${config.email.from.replace(/^.*</, "").replace(/>$/, "")}`, true, to ? "real inbox" : "test inbox");
    } catch (e) {
      check(`${config.email.provider} accepted the message`, false, (e as Error).message);
    }
  }
} else console.log(`SKIP  email (provider ${config.email.provider})`);

/* LiveKit */
if (config.livekit) {
  const lk = new LiveKitCloud(config.livekit);
  const room = `check-${Date.now()}`;
  try {
    await lk.createRoom(room, 2);
    check("LiveKit API key works (room created)", true, new URL(config.livekit.url.replace(/^wss/, "https")).host);
    const jwt = await lk.token({ room, identity: "check", name: "check", ttlSeconds: 60, sources: ["microphone"] });
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString()) as { video?: { room?: string; roomJoin?: boolean } };
    check("join token is scoped to the room", claims.video?.room === room && claims.video?.roomJoin === true);
    // A webhook signed with the project secret must verify; one with a wrong body hash must not.
    const body = JSON.stringify({ event: "room_started", id: "EV_check", createdAt: Math.floor(Date.now() / 1000), room: { name: room } });
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret);
    at.sha256 = createHash("sha256").update(body).digest("base64");
    const auth = await at.toJwt();
    const ev = await lk.receiveWebhook(body, auth);
    check("webhook signature verification accepts a genuine event", ev.event === "room_started" && ev.room === room);
    const forged = await lk.receiveWebhook(body.replace("room_started", "room_finished"), auth).then(() => true, () => false);
    check("webhook verification rejects a tampered body", !forged);
  } catch (e) {
    check("LiveKit", false, (e as Error).message.slice(0, 120));
  } finally {
    await lk.deleteRoom(room);
  }
} else console.log("SKIP  LiveKit (not configured)");

console.log(`\n${failures ? `${failures} check(s) FAILED` : "All service checks passed."}`);
process.exit(failures ? 1 : 0);
