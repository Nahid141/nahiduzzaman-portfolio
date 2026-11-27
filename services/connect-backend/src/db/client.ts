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
export async function createDb(opts: { url: string } | { pglite: true; dataDir?: string }): Promise<DbHandle> {
  if ("url" in opts) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  const client = new PGlite(opts.dataDir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as Db, close: () => client.close() };
}
