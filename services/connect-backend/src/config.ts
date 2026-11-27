import { readFileSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8020),
  /** Fastify trustProxy: "" (off), a hop count such as "1", or a proxy address. */
  TRUST_PROXY: z.string().optional().default(""),
  DATABASE_URL: z.string().optional().default(""),
  /** CA bundle for verify-full TLS to Postgres: a file path, or the PEM itself (Render env vars). */
  DATABASE_CA_FILE: z.string().optional().default(""),
  DATABASE_CA_PEM: z.string().optional().default(""),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  REDIS_URL: z.string().optional().default(""),
  CONNECT_SITE_ORIGIN: z.string().default("http://localhost:3000"),
  CONNECT_DATA_KEY: z.string().optional().default(""),
  EMAIL_PROVIDER: z.enum(["", "smtp", "brevo", "resend", "console"]).optional().default(""),
  EMAIL_API_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  MAIL_FROM: z.string().optional().default(""),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SECRET_KEY: z.string().optional().default(""),
  STORAGE_BUCKET: z.string().regex(/^[a-z0-9-]{3,63}$/).default("connect-files"),
  LIVEKIT_URL: z.string().optional().default(""),
  LIVEKIT_API_KEY: z.string().optional().default(""),
  LIVEKIT_API_SECRET: z.string().optional().default(""),
  VIRUSTOTAL_API_KEY: z.string().optional().default(""),
});

export type EmailProvider = "smtp" | "brevo" | "resend" | "console";

export type Config = {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  trustProxy: boolean | number | string;
  databaseUrl: string;
  /** PEM CA used to verify the database certificate; empty = no TLS (local Postgres or PGlite). */
  databaseCa: string;
  dbPoolMax: number;
  redisUrl: string;
  /** Origins allowed to call the API with credentials. */
  allowedOrigins: string[];
  /** 32-byte key for encrypting secrets at rest (TOTP seeds). */
  dataKey: Buffer;
  email: { provider: EmailProvider; apiKey: string; from: string };
  smtp: { host: string; port: number; user: string; password: string; from: string };
  storage: { url: string; secretKey: string; bucket: string } | null;
  livekit: { url: string; apiKey: string; apiSecret: string } | null;
  virusTotalKey: string;
  /** Secure cookies everywhere except plain-http local development and tests. */
  secureCookies: boolean;
};

const DEV_KEY = Buffer.alloc(32, 7); // development/test only; production refuses to start without a real key

const isLocalDb = (url: string) => {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

function parseTrustProxy(v: string): boolean | number | string {
  if (!v || v === "false") return false;
  if (v === "true") return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = schema.parse(env);
  const production = e.NODE_ENV === "production";
  // A key copied from a dashboard's masked "••••" display is not a key; say so instead of failing at first use.
  for (const name of ["DATABASE_URL", "SUPABASE_SECRET_KEY", "EMAIL_API_KEY", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "SMTP_PASSWORD"] as const) {
    const v = (e as Record<string, unknown>)[name];
    if (typeof v === "string" && /[^\x20-\x7e]/.test(v)) throw new Error(`${name} contains non-ASCII characters (a masked value was probably copied)`);
  }

  let dataKey: Buffer;
  if (e.CONNECT_DATA_KEY) {
    dataKey = Buffer.from(e.CONNECT_DATA_KEY, "base64");
    // The lengths are not secret and make a truncated or mangled paste obvious in the deploy log.
    if (dataKey.length !== 32) {
      throw new Error(`CONNECT_DATA_KEY must be 32 bytes, base64-encoded (got ${e.CONNECT_DATA_KEY.length} characters decoding to ${dataKey.length} bytes)`);
    }
  } else if (production) {
    throw new Error("CONNECT_DATA_KEY is required in production");
  } else {
    dataKey = DEV_KEY;
  }

  const databaseCa = e.DATABASE_CA_PEM
    ? e.DATABASE_CA_PEM.replace(/\\n/g, "\n")
    : e.DATABASE_CA_FILE
      ? readFileSync(e.DATABASE_CA_FILE, "utf8")
      : "";
  if (databaseCa && !databaseCa.includes("BEGIN CERTIFICATE")) throw new Error("Database CA is not a PEM certificate");
  if (/sslmode=/i.test(e.DATABASE_URL)) {
    throw new Error("Remove sslmode from DATABASE_URL; TLS is configured with DATABASE_CA_FILE or DATABASE_CA_PEM");
  }

  const provider: EmailProvider = e.EMAIL_PROVIDER || (e.SMTP_HOST ? "smtp" : "console");

  if (production) {
    if (!e.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    if (!databaseCa && !isLocalDb(e.DATABASE_URL)) {
      throw new Error("A remote database needs DATABASE_CA_FILE or DATABASE_CA_PEM (verify-full TLS)");
    }
    if (provider === "console") throw new Error("Configure EMAIL_PROVIDER (smtp, brevo or resend) in production");
    if (provider === "smtp" && !e.SMTP_HOST) throw new Error("SMTP_HOST is required for EMAIL_PROVIDER=smtp");
    if ((provider === "brevo" || provider === "resend") && !e.EMAIL_API_KEY) throw new Error("EMAIL_API_KEY is required");
    if (!e.MAIL_FROM) throw new Error("MAIL_FROM is required in production");
    if (!e.CONNECT_SITE_ORIGIN.startsWith("https://")) throw new Error("CONNECT_SITE_ORIGIN must be https in production");
  }

  const storage =
    e.SUPABASE_URL && e.SUPABASE_SECRET_KEY
      ? { url: e.SUPABASE_URL.replace(/\/+$/, ""), secretKey: e.SUPABASE_SECRET_KEY, bucket: e.STORAGE_BUCKET }
      : null;
  if (storage && !storage.url.startsWith("https://")) throw new Error("SUPABASE_URL must be https");

  const livekit =
    e.LIVEKIT_URL && e.LIVEKIT_API_KEY && e.LIVEKIT_API_SECRET
      ? { url: e.LIVEKIT_URL, apiKey: e.LIVEKIT_API_KEY, apiSecret: e.LIVEKIT_API_SECRET }
      : null;
  if (livekit && !/^wss:\/\//.test(livekit.url) && production) throw new Error("LIVEKIT_URL must be wss:// in production");

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    databaseUrl: e.DATABASE_URL,
    databaseCa,
    dbPoolMax: e.DB_POOL_MAX,
    redisUrl: e.REDIS_URL,
    allowedOrigins: e.CONNECT_SITE_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    dataKey,
    email: { provider, apiKey: e.EMAIL_API_KEY, from: e.MAIL_FROM },
    smtp: { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, password: e.SMTP_PASSWORD, from: e.MAIL_FROM },
    storage,
    livekit,
    virusTotalKey: e.VIRUSTOTAL_API_KEY,
    secureCookies: production,
  };
}
