import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DbHandle = { db: Db; close: () => Promise<void> };

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** PostgreSQL via node-postgres (production) or PGlite (tests; dev when DATABASE_URL is empty). */
export async function createDb(
  opts: { url: string; ca?: string; max?: number } | { pglite: true; dataDir?: string }
): Promise<DbHandle> {
  if ("url" in opts) {
    // With a CA the certificate chain and host name are verified (verify-full); never rejectUnauthorized: false.
    const ssl = opts.ca ? { ca: opts.ca, rejectUnauthorized: true } : undefined;
    const pool = new pg.Pool({ connectionString: opts.url, max: opts.max ?? 5, ssl, idleTimeoutMillis: 30_000 });
    // The server may end an idle connection (pooler restart, failover, maintenance). Without a listener that
    // error would crash the process; the pool already discards the broken client and reconnects on next use.
    pool.on("error", (err) => console.warn(`database connection closed by the server: ${err.message}`));
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => client.close() };
}
