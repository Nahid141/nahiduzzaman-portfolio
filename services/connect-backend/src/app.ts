import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { adminRoutes } from "./admin/routes.js";
import { authRoutes } from "./auth/routes.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { EmailSender, RateLimitStore } from "./lib/services.js";
import type { AppEvents, PresenceStore } from "./lib/stores.js";
import { chatRoutes } from "./chat/routes.js";
import { ChatError } from "./chat/service.js";
import { attachGateway, type Realtime } from "./realtime/gateway.js";
import { fileRoutes } from "./files/routes.js";
import type { HashScanner } from "./files/service.js";
import type { FileStore } from "./files/storage.js";
import type { LiveKitApi } from "./meetings/livekit.js";
import { LIVEKIT_WEBHOOK_PATH, meetingRoutes } from "./meetings/routes.js";
import type { YoutubeLookup } from "./collab/youtube.js";
import { socialRoutes } from "./social/routes.js";
import { collabRoutes } from "./collab/routes.js";
import { gameRoutes } from "./games/routes.js";
import { GameError } from "./games/types.js";
import { VersionConflict } from "./collab/state.js";

declare module "fastify" {
  interface FastifyInstance {
    realtime: Realtime;
  }
}

export type AppDeps = {
  config: Config;
  db: Db;
  rateLimit: RateLimitStore;
  email: EmailSender;
  now: () => Date;
  events: AppEvents;
  presence: PresenceStore;
  /** Private object storage; null when not configured (file routes answer 503). */
  files?: FileStore | null;
  scanner?: HashScanner;
  /** LiveKit server API; null when not configured (meeting routes answer 503). */
  livekit?: LiveKitApi | null;
  /** YouTube title lookup; defaults to YouTube's public oEmbed endpoint. */
  youtube?: YoutubeLookup;
  /** Dice for games; defaults to a cryptographic source. Tests pass a fixed sequence. */
  random?: () => number;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Which proxy may set X-Forwarded-For: "127.0.0.1" behind local Nginx, a hop count on Render.
    trustProxy:
      typeof deps.config.trustProxy === "number"
        ? ((hops: number) => (_addr: string, hop: number) => hop < hops)(deps.config.trustProxy)
        : deps.config.trustProxy,
    bodyLimit: 64 * 1024,
    logger:
      deps.config.env === "test"
        ? false
        : { redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'] },
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: deps.config.allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["content-type", "x-connect-csrf"],
  });
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });

  app.addHook("onSend", async (_request, reply) => {
    // Versioned profile photos set their own short private cache; everything else is never cached.
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
    reply.header("x-robots-tag", "noindex, nofollow");
  });

  // CSRF: state-changing requests need the custom header (not sendable cross-site without a CORS
  // preflight we refuse) and, when present, an allowed Origin.
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    // Server-to-server webhook authenticated by its own signature (no cookies are read there).
    if (request.method === "POST" && request.url === LIVEKIT_WEBHOOK_PATH) return;
    const origin = request.headers.origin;
    if (request.headers["x-connect-csrf"] !== "1" || (origin && !deps.config.allowedOrigins.includes(origin))) {
      return reply.code(403).send({ error: "csrf" });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof VersionConflict) return reply.code(409).send({ error: error.code, current: error.current });
    if (error instanceof ChatError || error instanceof GameError) return reply.code(error.status).send({ error: error.code });
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "invalid_input",
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? "server_error" : "bad_request" });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "not_found" }));

  app.get("/api/v1/health", async () => ({ status: "ok" }));
  await authRoutes(app, deps);
  await adminRoutes(app, deps);
  const realtime = attachGateway(app, deps);
  app.decorate("realtime", realtime);
  await chatRoutes(app, deps, realtime);
  await fileRoutes(app, deps, realtime);
  await meetingRoutes(app, deps, realtime);
  await collabRoutes(app, deps, realtime);
  await socialRoutes(app, deps, realtime);
  await gameRoutes(app, deps, realtime);
  return app;
}
