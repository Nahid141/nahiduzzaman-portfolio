/**
 * Rotates CONNECT_DATA_KEY (AES-256-GCM key for stored TOTP secrets) without losing data. Never prints a key.
 *
 *   node --env-file=.env --import tsx scripts/rotate-data-key.ts            # check: which records depend on the key
 *   node --env-file=.env --import tsx scripts/rotate-data-key.ts --rotate   # rotate
 *
 * Crash-safe order: the new key is first saved in .env as CONNECT_DATA_KEY_NEXT, then every secret is re-encrypted
 * in one transaction (each verified before commit), then .env is switched to the new key. Re-running after an
 * interruption picks up CONNECT_DATA_KEY_NEXT and finishes. Authenticator apps keep working: the TOTP seeds
 * themselves do not change, only their encryption.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig } from "../src/config.js";
import { decryptSecret, encryptSecret } from "../src/lib/crypto.js";

const envFile = process.env.ENV_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const rotate = process.argv.includes("--rotate");
const config = loadConfig({ ...process.env, NODE_ENV: "development" });
if (!process.env.CONNECT_DATA_KEY) throw new Error("CONNECT_DATA_KEY is not set in .env");

const toKey = (b64: string, name: string) => {
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32 || k.toString("base64") !== b64) throw new Error(`${name} is not a canonical base64 encoding of 32 bytes`);
  return k;
};
const tryDecrypt = (key: Buffer, payload: string) => {
  try {
    return decryptSecret(key, payload);
  } catch {
    return null;
  }
};

/** Rewrites only the named lines of .env, in place (keeps the file's restricted ACL). */
function setEnvLines(changes: Record<string, string | null>) {
  const lines = readFileSync(envFile, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const name = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    if (name && name in changes) {
      seen.add(name);
      if (changes[name] !== null) out.push(`${name}=${changes[name]}`);
    } else out.push(line);
  }
  for (const [name, value] of Object.entries(changes)) if (!seen.has(name) && value !== null) out.push(`${name}=${value}`);
  writeFileSync(envFile, out.join("\n") + "\n", "utf8");
}
const readEnvValue = (name: string) =>
  new RegExp(`^${name}=(.*)$`, "m").exec(readFileSync(envFile, "utf8").replace(/\r\n/g, "\n"))?.[1]?.trim().replace(/^"(.*)"$/, "$1");

const oldKey = toKey(process.env.CONNECT_DATA_KEY, "CONNECT_DATA_KEY");
const ca = config.databaseCa || undefined;
const db = new pg.Client({ connectionString: config.databaseUrl, ssl: ca ? { ca, rejectUnauthorized: true } : undefined });
await db.connect();

const rows = (await db.query("select id, username, role, mfa_enabled, totp_secret_enc from users where totp_secret_enc is not null order by created_at"))
  .rows as { id: string; username: string; role: string; mfa_enabled: boolean; totp_secret_enc: string }[];
const total = Number((await db.query("select count(*) from users")).rows[0].count);
console.log(`Users: ${total}. Records encrypted with CONNECT_DATA_KEY (users.totp_secret_enc): ${rows.length}.`);
for (const r of rows) {
  console.log(`  ${r.username} (${r.role}, MFA ${r.mfa_enabled ? "on" : "pending enrolment"}): ${tryDecrypt(oldKey, r.totp_secret_enc) !== null ? "decrypts with the current key" : "does NOT decrypt with the current key"}`);
}
console.log("Nothing else depends on the key (passwords, sessions, tokens and recovery codes are hashes).");

if (!rotate) {
  await db.end();
  console.log("\nCheck only. Run with --rotate to rotate the key.");
  process.exit(0);
}

const pending = readEnvValue("CONNECT_DATA_KEY_NEXT");
const newB64 = pending ?? randomBytes(32).toString("base64");
const newKey = toKey(newB64, "the new key");
if (newKey.equals(oldKey)) throw new Error("new key equals the current key");
if (!pending) setEnvLines({ CONNECT_DATA_KEY_NEXT: newB64 });
console.log(pending ? "\nResuming an interrupted rotation." : "\nNew key generated and saved as CONNECT_DATA_KEY_NEXT.");

try {
  await db.query("begin");
  const locked = (await db.query("select id, username, totp_secret_enc from users where totp_secret_enc is not null for update")).rows as {
    id: string;
    username: string;
    totp_secret_enc: string;
  }[];
  let moved = 0;
  for (const r of locked) {
    const plain = tryDecrypt(oldKey, r.totp_secret_enc) ?? tryDecrypt(newKey, r.totp_secret_enc);
    if (plain === null) throw new Error(`${r.username}: secret decrypts with neither key; nothing changed`);
    const enc = encryptSecret(newKey, plain);
    if (decryptSecret(newKey, enc) !== plain) throw new Error("re-encryption check failed");
    await db.query("update users set totp_secret_enc = $1, updated_at = now() where id = $2", [enc, r.id]);
    moved++;
  }
  await db.query("commit");
  console.log(`Re-encrypted ${moved} record(s) in one transaction.`);
} catch (e) {
  await db.query("rollback").catch(() => undefined);
  await db.end();
  console.error(`Rotation aborted, database unchanged: ${(e as Error).message}. The current key is still active.`);
  process.exit(1);
}

setEnvLines({ CONNECT_DATA_KEY: newB64, CONNECT_DATA_KEY_NEXT: null });
const active = readEnvValue("CONNECT_DATA_KEY");
if (active !== newB64 || readEnvValue("CONNECT_DATA_KEY_NEXT") !== undefined) throw new Error(".env was not updated as expected");

const after = (await db.query("select totp_secret_enc from users where totp_secret_enc is not null")).rows as { totp_secret_enc: string }[];
await db.end();
const okNew = after.every((r) => tryDecrypt(newKey, r.totp_secret_enc) !== null);
const oldStillWorks = after.some((r) => tryDecrypt(oldKey, r.totp_secret_enc) !== null);
console.log(`Verified: ${after.length} record(s) decrypt with the new key: ${okNew ? "yes" : "NO"}; old key decrypts any: ${oldStillWorks ? "YES" : "no"}.`);
console.log(`.env now holds the new key (decodes to ${toKey(active, "new key").length} bytes). Sync it to Render next.`);
process.exit(okNew && !oldStillWorks ? 0 : 1);
