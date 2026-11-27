import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { usageCounters } from "../db/schema.js";

/* Monthly free-tier counters. Increments are conditional, so concurrent requests cannot overshoot a cap. */

export type UsageKey = "egress_bytes" | "meeting_minutes";

export const periodOf = (d: Date) => d.toISOString().slice(0, 7); // "2026-11", UTC

export async function getUsage(db: Db, key: UsageKey, at: Date) {
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.key, key), eq(usageCounters.period, periodOf(at))));
  return row?.value ?? 0;
}

/** Adds `delta` unless that would exceed `cap`. Returns false (and changes nothing) when over. */
export async function consume(db: Db, key: UsageKey, at: Date, delta: number, cap: number) {
  const period = periodOf(at);
  await db.insert(usageCounters).values({ key, period, value: 0 }).onConflictDoNothing();
  const rows = await db
    .update(usageCounters)
    .set({ value: sql`${usageCounters.value} + ${delta}`, updatedAt: at })
    .where(and(eq(usageCounters.key, key), eq(usageCounters.period, period), sql`${usageCounters.value} + ${delta} <= ${cap}`))
    .returning({ value: usageCounters.value });
  return rows.length > 0;
}

/** Records usage that already happened (e.g. meeting minutes reported by LiveKit). */
export async function record(db: Db, key: UsageKey, at: Date, delta: number) {
  const period = periodOf(at);
  await db
    .insert(usageCounters)
    .values({ key, period, value: delta })
    .onConflictDoUpdate({
      target: [usageCounters.key, usageCounters.period],
      set: { value: sql`${usageCounters.value} + ${delta}`, updatedAt: at },
    });
}
