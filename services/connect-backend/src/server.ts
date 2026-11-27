import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { ConsoleEmailSender, MemoryRateLimitStore, SmtpEmailSender } from "./lib/services.js";
import { createEvents, MemoryPresenceStore, RedisPresenceStore, RedisRateLimitStore } from "./lib/stores.js";

const config = loadConfig(process.env);
const handle = config.databaseUrl
  ? await createDb({ url: config.databaseUrl })
  : await createDb({ pglite: true, dataDir: "./.pglite" });

if (config.env === "production" && !config.redisUrl) {
  throw new Error("REDIS_URL is required in production (shared rate limits, presence and socket fan-out)");
}
const redis = config.redisUrl ? new Redis(config.redisUrl) : null;

const app = await buildApp({
  config,
  db: handle.db,
  rateLimit: redis ? new RedisRateLimitStore(redis) : new MemoryRateLimitStore(),
  presence: redis ? new RedisPresenceStore(redis) : new MemoryPresenceStore(),
  events: createEvents(),
  email: config.smtp.host ? new SmtpEmailSender(config.smtp) : new ConsoleEmailSender(),
  now: () => new Date(),
});

if (redis) {
  // Fan socket events out across backend instances.
  app.realtime.io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
}

await app.listen({ host: "127.0.0.1", port: config.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  });
}
