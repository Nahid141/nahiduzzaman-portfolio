import pg from "pg";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";

// Needs a real PostgreSQL: run with TEST_DATABASE_URL (a *_test database). Skipped on PGlite.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database pool resilience", () => {
  it("survives the server terminating its idle connections and keeps answering", async () => {
    const ca = process.env.DATABASE_CA_FILE ? (await import("node:fs")).readFileSync(process.env.DATABASE_CA_FILE, "utf8") : undefined;
    const h = await createDb({ url: url!, ca, max: 2 });
    await h.db.execute("select 1");
    // Terminate every other backend of this database, as a failover or admin command would.
    const killer = new pg.Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
    await killer.connect();
    await killer.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()");
    await killer.end();
    await new Promise((r) => setTimeout(r, 1000));
    const r = await h.db.execute("select 1 as ok");
    expect((r as unknown as { rows: { ok: number }[] }).rows[0]!.ok).toBe(1);
    await h.close();
  });
});
