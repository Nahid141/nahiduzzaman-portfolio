/**
 * Prepares a throwaway database for browser testing: creates "connect_e2e" next to DATABASE_URL's database,
 * migrates it and bootstraps a test administrator with a random password written to the file given with --out.
 * Refuses any database whose name does not end in _e2e, so it can never touch production.
 *
 *   node --env-file=.env --import tsx scripts/e2e-seed.ts --out <file>     # create + seed
 *   node --env-file=.env --import tsx scripts/e2e-seed.ts --drop           # remove connect_e2e afterwards
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { bootstrapAdmin } from "./bootstrap-admin.js";

const argv = process.argv.slice(2);
const config = loadConfig({ ...process.env, NODE_ENV: "development" });
const ca = config.databaseCa || undefined;
const ssl = ca ? { ca, rejectUnauthorized: true } : undefined;
const target = new URL(config.databaseUrl);
target.pathname = "/connect_e2e";
if (!/_e2e$/.test(target.pathname.slice(1))) throw new Error("refusing: not an _e2e database");

const admin = new pg.Client({ connectionString: config.databaseUrl, ssl });
await admin.connect();
if (argv.includes("--drop")) {
  await admin.query("drop database if exists connect_e2e with (force)");
  console.log("connect_e2e dropped.");
  await admin.end();
  process.exit(0);
}
const exists = (await admin.query("select 1 from pg_database where datname = 'connect_e2e'")).rowCount;
if (!exists) await admin.query("create database connect_e2e");
await admin.end();

const out = argv[argv.indexOf("--out") + 1];
if (!argv.includes("--out") || !out) throw new Error("--out <file> is required");
const h = await createDb({ url: target.toString(), ca, max: 1 });
const password = randomBytes(18).toString("base64url");
const result = await bootstrapAdmin(h.db, { username: "nahid007", email: "admin@example.test", fullName: "E2E Admin", password, resetPassword: true });
await h.close();
writeFileSync(out, password, { mode: 0o600 });
console.log(`connect_e2e ${exists ? "reused" : "created"}; test administrator ${result}; password written to --out file.`);
