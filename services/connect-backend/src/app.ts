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

export type AppDeps = {
  config: Config;
  db: Db;
  rateLimit: RateLimitStore;
  email: EmailSender;
  now: () => Date;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Only the local Nginx may set X-Forwarded-For.
    trustProxy: deps.config.env === "production" ? "127.0.0.1" : false,
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
    reply.header("cache-control", "no-store");
    reply.header("x-robots-tag", "noindex, nofollow");
  });

  // CSRF: state-changing requests need the custom header (not sendable cross-site without a CORS
  // preflight we refuse) and, when present, an allowed Origin.
  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (request.headers["x-connect-csrf"] !== "1" || (origin && !deps.config.allowedOrigins.includes(origin))) {
      return reply.code(403).send({ error: "csrf" });
    }
  });

  app.setErrorHandler((error, request, reply) => {
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
  return app;
}
