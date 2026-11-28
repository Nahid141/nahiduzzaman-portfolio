/**
 * Connects to DATABASE_URL with verified TLS, reviews pending migrations, optionally applies them,
 * then audits tables, indexes, constraints, RLS and Data API grants. Never prints credentials.
 *
 *   node --env-file=.env --import tsx scripts/verify-db.ts             # review only, changes nothing
 *   node --env-file=.env --import tsx scripts/verify-db.ts --migrate   # apply pending migrations, then audit
 *   node --env-file=.env --import tsx scripts/verify-db.ts --create-test-db   # create "connect_test" for npm test
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable as PgTableClass } from "drizzle-orm/pg-core";
import pg from "pg";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";

const args = new Set(process.argv.slice(2));
const config = loadConfig({ ...process.env, NODE_ENV: "development" });
if (!config.databaseUrl) throw new Error("DATABASE_URL is not set (run configure-supabase.ps1 first)");
const ca = config.databaseCa || undefined;
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "../src/db/migrations");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function connect(url = config.databaseUrl) {
  const client = new pg.Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
  await client.connect();
  return client;
}

/* 1. Connection and TLS */
const client = await connect();
const stream = (client as unknown as { connection: { stream: TLSSocket } }).connection.stream;
const host = new URL(config.databaseUrl).hostname;
check("TLS to the database is on and the certificate chain verified", Boolean(stream.encrypted && stream.authorized), stream.encrypted ? `${stream.getProtocol()}, host ${host}` : "unencrypted");
const info = (await client.query("select current_user, current_database(), split_part(version(), ' ', 2) as v")).rows[0];
console.log(`      connected as ${info.current_user} to ${info.current_database}, PostgreSQL ${info.v}`);

/* 2. Migration review */
const journal = JSON.parse(readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
const hasHistory = (await client.query("select to_regclass('drizzle.__drizzle_migrations') as t")).rows[0].t !== null;
const applied = hasHistory ? Number((await client.query("select count(*) from drizzle.__drizzle_migrations")).rows[0].count) : 0;
const pending = journal.entries.slice(applied);
const existing = (await client.query("select tablename from pg_tables where schemaname = 'public'")).rows.map((r) => r.tablename as string);
console.log(`\nMigrations: ${applied} applied, ${pending.length} pending`);
for (const m of pending) {
  const sql = readFileSync(path.join(migrationsDir, `${m.tag}.sql`), "utf8");
  const count = (re: RegExp) => (sql.match(re) ?? []).length;
  console.log(
    `  ${m.tag}: ${count(/CREATE TABLE/g)} tables, ${count(/CREATE (UNIQUE )?INDEX/g)} indexes, ${count(/CREATE TYPE/g)} enums, ` +
      `${count(/FOREIGN KEY/g)} foreign keys, ${count(/ CHECK /g)} checks${/ROW LEVEL SECURITY/.test(sql) ? ", enables RLS + revokes Data API grants" : ""}` +
      `${/DROP |TRUNCATE|DELETE FROM/i.test(sql) ? "  !! contains destructive statements" : ""}`
  );
}
const ours = new Set(Object.values(schema).filter((v) => is(v, PgTableClass)).map((t) => getTableConfig(t as PgTable).name));
const foreign = existing.filter((t) => !ours.has(t));
if (applied === 0 && existing.length) {
  check("public schema holds no unrelated tables before the first migration", foreign.length === 0, foreign.join(", "));
}

if (args.has("--create-test-db")) {
  const exists = (await client.query("select 1 from pg_database where datname = 'connect_test'")).rowCount;
  if (!exists) await client.query("create database connect_test");
  console.log(`\nconnect_test ${exists ? "already exists" : "created"}. Test URL = DATABASE_URL with /connect_test as the database.`);
}
await client.end();

if (args.has("--migrate") && pending.length) {
  console.log("\nApplying migrations...");
  const h = await createDb({ url: config.databaseUrl, ca, max: 1 });
  await h.close();
  console.log("Done.");
} else if (pending.length) {
  console.log("\nReview only. Re-run with --migrate to apply.");
}

/* 3. Audit */
const c = await connect();
const q = async <T = Record<string, unknown>>(text: string) => (await c.query(text)).rows as T[];
const tables = await q<{ tablename: string; rowsecurity: boolean }>(
  "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename"
);
if (tables.length) {
  const names = new Set(tables.map((t) => t.tablename));
  const missing = [...ours].filter((t) => !names.has(t));
  console.log("");
  check(`all ${ours.size} application tables exist`, missing.length === 0, missing.join(", "));
  const noRls = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename);
  check("row level security enabled on every public table", noRls.length === 0, noRls.join(", "));
  const policies = await q<{ n: string }>("select count(*) as n from pg_policies where schemaname = 'public'");
  check("no RLS policies grant Data API access (backend-only model)", policies[0]!.n === "0", `${policies[0]!.n} policies`);
  const grants = await q<{ grantee: string; n: string }>(
    "select grantee, count(*) as n from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role') group by grantee"
  );
  check("anon, authenticated and service_role hold no table privileges", grants.length === 0, grants.map((g) => `${g.grantee}:${g.n}`).join(", "));
  const seqGrants = await q<{ n: string }>(
    "select count(*) as n from information_schema.usage_privileges where object_schema = 'public' and grantee in ('anon','authenticated','service_role')"
  );
  check("no sequence/usage privileges for Data API roles", seqGrants[0]!.n === "0", `${seqGrants[0]!.n}`);
  const fkNoIndex = await q<{ table_name: string; fk_column: string }>(`
    select conrelid::regclass::text as table_name, a.attname as fk_column
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and a.attnum = i.indkey[0])`);
  console.log(`INFO  foreign-key columns without a leading index: ${fkNoIndex.length ? fkNoIndex.map((r) => `${r.table_name}.${r.fk_column}`).join(", ") : "none"}`);
  const checks = await q<{ conname: string }>("select conname from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace");
  const want = ["messages_one_target", "files_one_target", "polls_one_target", "files_size_positive", "meetings_max_participants_range", "meetings_screen_share_policy", "music_requests_one_source", "music_requests_youtube_id_format", "tasks_title_length", "meeting_requests_duration_range", "user_avatars_size", "games_kind_format", "games_players_count"];
  const haveChecks = new Set(checks.map((r) => r.conname));
  check("CHECK constraints present", want.every((w) => haveChecks.has(w)), want.filter((w) => !haveChecks.has(w)).join(", "));
  const idx = await q<{ n: string }>("select count(*) as n from pg_indexes where schemaname = 'public'");
  const uq = await q<{ n: string }>("select count(*) as n from pg_constraint where contype in ('p','u') and connamespace = 'public'::regnamespace");
  console.log(`INFO  ${tables.length} tables, ${idx[0]!.n} indexes, ${uq[0]!.n} primary/unique keys, ${checks.length} checks`);
  const general = await q("select 1 from channels where name = 'general'");
  check("#general channel seeded", general.length === 1);
}
await c.end();
console.log(`\n${failures ? `${failures} check(s) FAILED` : "All checks passed."}`);
process.exit(failures ? 1 : 0);
