/**
 * Lists objects in the Storage bucket that no row in the `files` table of DATABASE_URL refers to, and deletes them
 * with --delete. Use after browser tests against a throwaway database, or to clean up after a crash.
 *
 *   node --env-file=.env --import tsx scripts/purge-orphan-objects.ts            # list only
 *   node --env-file=.env --import tsx scripts/purge-orphan-objects.ts --delete   # delete orphans
 */
import pg from "pg";
import { loadConfig } from "../src/config.js";

const config = loadConfig({ ...process.env, NODE_ENV: "development" });
if (!config.storage) throw new Error("Storage is not configured");
const { url, secretKey, bucket } = config.storage;
const headers = { apikey: secretKey, "content-type": "application/json" };

async function list(prefix: string): Promise<string[]> {
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`list ${prefix || "/"} returned ${res.status}`);
  const items = (await res.json()) as { name: string; id: string | null }[];
  const out: string[] = [];
  for (const it of items) {
    const p = prefix ? `${prefix}/${it.name}` : it.name;
    if (it.id === null) out.push(...(await list(p))); // folder
    else out.push(p);
  }
  return out;
}

const objects = await list("");
const ca = config.databaseCa || undefined;
const db = new pg.Client({ connectionString: config.databaseUrl, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
await db.connect();
const known = new Set((await db.query("select object_path from files")).rows.map((r) => r.object_path as string));
await db.end();
const orphans = objects.filter((o) => !known.has(o));
console.log(`${objects.length} objects in "${bucket}", ${known.size} file rows, ${orphans.length} orphaned`);
if (process.argv.includes("--delete") && orphans.length) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: orphans }) });
  if (!res.ok) throw new Error(`delete returned ${res.status}`);
  console.log(`deleted ${orphans.length}; ${(await list("")).length} objects remain`);
}
