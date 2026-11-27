/**
 * Creates (or repairs) the initial administrator. Idempotent.
 *
 *   npm run bootstrap-admin -- [--username nahid007] [--email you@example.org] [--reset-password]
 *
 * The password is read twice from the terminal with echo disabled. It is never printed,
 * logged, written to disk or given a default.
 */
import { eq, sql } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config.js";
import { createDb, type Db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/crypto.js";
import { audit } from "../src/lib/services.js";

export const MIN_ADMIN_PASSWORD = 14;

export async function bootstrapAdmin(
  db: Db,
  opts: { username: string; email: string; fullName?: string; password: string; resetPassword?: boolean }
): Promise<"created" | "unchanged" | "password_reset"> {
  if (opts.password.length < MIN_ADMIN_PASSWORD) {
    throw new Error(`Administrator password must be at least ${MIN_ADMIN_PASSWORD} characters`);
  }
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${opts.username})`)
    .limit(1);
  if (existing) {
    if (existing.role !== "admin") throw new Error(`User ${opts.username} exists and is not an administrator`);
    if (!opts.resetPassword) return "unchanged";
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(opts.password), status: "active", updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    await audit(db, { actorId: existing.id, action: "admin.bootstrap_password_reset" });
    return "password_reset";
  }
  const [created] = await db
    .insert(users)
    .values({
      username: opts.username,
      email: opts.email,
      fullName: opts.fullName ?? opts.username,
      passwordHash: await hashPassword(opts.password),
      role: "admin",
      status: "active",
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
    })
    .returning();
  await audit(db, { actorId: created!.id, action: "admin.bootstrapped" });
  return "created";
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("Run this in an interactive terminal (stdin must be a TTY)."));
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(130);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const username = arg("--username") ?? "nahid007";
  const email = arg("--email");
  const resetPassword = args.includes("--reset-password");
  const config = loadConfig(process.env);
  const handle = config.databaseUrl
    ? await createDb({ url: config.databaseUrl })
    : await createDb({ pglite: true, dataDir: "./.pglite" });
  try {
    const [existing] = await handle.db.select().from(users).where(sql`lower(${users.username}) = lower(${username})`).limit(1);
    if (existing && !resetPassword) {
      console.log(`Administrator ${username} already exists. Nothing changed (use --reset-password to set a new password).`);
      return;
    }
    if (!existing && !email) throw new Error("--email is required when creating the administrator");
    const password = await readHidden(`New password for ${username} (min ${MIN_ADMIN_PASSWORD} chars): `);
    const again = await readHidden("Repeat password: ");
    if (password !== again) throw new Error("Passwords do not match");
    const result = await bootstrapAdmin(handle.db, { username, email: email ?? existing!.email, password, resetPassword });
    console.log(`Done: ${result}. Sign in at /connect/admin/login and enroll two-factor authentication.`);
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
