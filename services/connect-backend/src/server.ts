import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { ConsoleEmailSender, HttpEmailSender, MemoryRateLimitStore, SmtpEmailSender, type EmailSender } from "./lib/services.js";
import { createEvents, MemoryPresenceStore, RedisPresenceStore, RedisRateLimitStore } from "./lib/stores.js";
import { cleanupChannelMessages } from "./chat/service.js";
import { cleanupFiles, VirusTotalHashScanner } from "./files/service.js";
import { SupabaseFileStore } from "./files/storage.js";
import { LiveKitCloud } from "./meetings/livekit.js";
import { sweepMeetings } from "./meetings/service.js";

const config = loadConfig(process.env);
const handle = config.databaseUrl
  ? await createDb({ url: config.databaseUrl, ca: config.databaseCa || undefined, max: config.dbPoolMax })
  : await createDb({ pglite: true, dataDir: "./.pglite" });

// Redis is optional: a single instance (Render Free) keeps rate limits and presence in memory.
// With several instances, set REDIS_URL so limits, presence and socket fan-out are shared.
const redis = config.redisUrl ? new Redis(config.redisUrl) : null;

function emailSender(): EmailSender {
  switch (config.email.provider) {
    case "smtp":
      return new SmtpEmailSender(config.smtp);
    case "brevo":
    case "resend":
      return new HttpEmailSender({ provider: config.email.provider, apiKey: config.email.apiKey, from: config.email.from });
    default:
      return new ConsoleEmailSender();
  }
}

const files = config.storage ? new SupabaseFileStore(config.storage) : null;
const app = await buildApp({
  config,
  db: handle.db,
  rateLimit: redis ? new RedisRateLimitStore(redis) : new MemoryRateLimitStore(),
  presence: redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore(),
  events: createEvents(),
  email: emailSender(),
  now: () => new Date(),
  files,
  scanner: config.virusTotalKey ? new VirusTotalHashScanner(config.virusTotalKey) : undefined,
  livekit: config.livekit ? new LiveKitCloud(config.livekit) : null,
});

if (redis) {
  // Fan socket events out across backend instances.
  app.realtime.io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
}

app.log.info(
  { storage: Boolean(files), meetings: Boolean(config.livekit), email: config.email.provider, redis: Boolean(redis) },
  "Private Connect backend starting"
);

// Housekeeping: abandoned uploads, expired files, meeting connections whose webhook was lost.
const housekeeping = setInterval(() => {
  const deps = { db: handle.db, files, now: () => new Date(), livekit: null };
  cleanupFiles(deps).catch((err) => app.log.error({ err }, "file cleanup failed"));
  sweepMeetings(deps).catch((err) => app.log.error({ err }, "meeting sweep failed"));
  cleanupChannelMessages(deps.db, deps.now()).catch((err) => app.log.error({ err }, "message cleanup failed"));
}, 10 * 60_000);
housekeeping.unref();

await app.listen({ host: config.host, port: config.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    clearInterval(housekeeping);
    await app.close();
    await handle.close();
    redis?.disconnect();
    process.exit(0);
  });
}
