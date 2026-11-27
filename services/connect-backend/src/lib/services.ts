import nodemailer from "nodemailer";
import type { Db } from "../db/client.js";
import { auditLogs, securityEvents } from "../db/schema.js";

/* --------------------------------- Email --------------------------------- */

export type Mail = { to: string; subject: string; text: string };

export interface EmailSender {
  send(mail: Mail): Promise<void>;
}

/** Test double: keeps sent mail in memory. */
export class MemoryEmailSender implements EmailSender {
  outbox: Mail[] = [];
  async send(mail: Mail) {
    this.outbox.push(mail);
  }
}

/** Development only: prints mail to the console. Refused in production by server.ts. */
export class ConsoleEmailSender implements EmailSender {
  async send(mail: Mail) {
    console.log(`\n--- dev email to ${mail.to}: ${mail.subject}\n${mail.text}\n---\n`);
  }
}

export class SmtpEmailSender implements EmailSender {
  private transport;
  constructor(private smtp: { host: string; port: number; user: string; password: string; from: string }) {
    this.transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
  }
  async send(mail: Mail) {
    await this.transport.sendMail({ from: this.smtp.from, ...mail });
  }
}

/* ------------------------------ Rate limiting ----------------------------- */

export interface RateLimitStore {
  /** Count one hit for `key` in a fixed window; returns the count including this hit. */
  hit(key: string, windowMs: number, now: number): Promise<number>;
  reset(key: string): Promise<void>;
}

/** Single-process store for dev and tests. Production uses Redis (Phase 3 adds RedisRateLimitStore). */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { start: number; count: number }>();
  async hit(key: string, windowMs: number, now: number) {
    const b = this.buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      this.buckets.set(key, { start: now, count: 1 });
      return 1;
    }
    b.count += 1;
    return b.count;
  }
  async reset(key: string) {
    this.buckets.delete(key);
  }
}

/* ------------------------------ Audit logging ----------------------------- */

const FORBIDDEN_KEYS = /pass|token|secret|code|cookie|key/i;

/** Drops any metadata field whose name suggests a secret, so logs can never hold one. */
export function scrub(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).filter(([k]) => !FORBIDDEN_KEYS.test(k)));
}

export async function audit(
  db: Db,
  entry: { actorId: string | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown> }
) {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: scrub(entry.metadata),
  });
}

export async function securityEvent(
  db: Db,
  entry: { userId?: string | null; kind: string; ip?: string; metadata?: Record<string, unknown> }
) {
  await db.insert(securityEvents).values({
    userId: entry.userId ?? null,
    kind: entry.kind,
    ip: entry.ip,
    metadata: scrub(entry.metadata),
  });
}
