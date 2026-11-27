import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8020),
  DATABASE_URL: z.string().optional().default(""),
  REDIS_URL: z.string().optional().default(""),
  CONNECT_SITE_ORIGIN: z.string().default("http://localhost:3000"),
  CONNECT_DATA_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default(""),
});

export type Config = {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  redisUrl: string;
  /** Origins allowed to call the API with credentials. */
  allowedOrigins: string[];
  /** 32-byte key for encrypting secrets at rest (TOTP seeds). */
  dataKey: Buffer;
  smtp: { host: string; port: number; user: string; password: string; from: string };
  /** Secure cookies everywhere except plain-http local development and tests. */
  secureCookies: boolean;
};

const DEV_KEY = Buffer.alloc(32, 7); // development/test only; production refuses to start without a real key

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = schema.parse(env);
  const production = e.NODE_ENV === "production";

  let dataKey: Buffer;
  if (e.CONNECT_DATA_KEY) {
    dataKey = Buffer.from(e.CONNECT_DATA_KEY, "base64");
    if (dataKey.length !== 32) throw new Error("CONNECT_DATA_KEY must be 32 bytes, base64-encoded");
  } else if (production) {
    throw new Error("CONNECT_DATA_KEY is required in production");
  } else {
    dataKey = DEV_KEY;
  }

  if (production) {
    if (!e.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    if (!e.SMTP_HOST || !e.MAIL_FROM) throw new Error("SMTP_HOST and MAIL_FROM are required in production");
    if (!e.CONNECT_SITE_ORIGIN.startsWith("https://")) throw new Error("CONNECT_SITE_ORIGIN must be https in production");
  }

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    allowedOrigins: e.CONNECT_SITE_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    dataKey,
    smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, password: e.SMTP_PASSWORD, from: e.MAIL_FROM },
    secureCookies: production,
  };
}
