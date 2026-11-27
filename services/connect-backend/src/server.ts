import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { ConsoleEmailSender, MemoryRateLimitStore, SmtpEmailSender } from "./lib/services.js";

const config = loadConfig(process.env);
const handle = config.databaseUrl
  ? await createDb({ url: config.databaseUrl })
  : await createDb({ pglite: true, dataDir: "./.pglite" });

if (config.env === "production" && !config.redisUrl) {
  // Phase 3 adds the Redis-backed store; a single in-memory store is only safe for one process.
  console.warn("REDIS_URL not set: using in-memory rate limiting (single instance only).");
}

const app = await buildApp({
  config,
  db: handle.db,
  rateLimit: new MemoryRateLimitStore(),
  email: config.smtp.host ? new SmtpEmailSender(config.smtp) : new ConsoleEmailSender(),
  now: () => new Date(),
});

await app.listen({ host: "127.0.0.1", port: config.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  });
}
