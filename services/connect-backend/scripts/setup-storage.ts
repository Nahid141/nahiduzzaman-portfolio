/**
 * Creates (or updates) the private Supabase Storage bucket and proves the signed-URL round trip:
 * signed upload -> server read-back -> signed download -> anonymous access refused -> delete.
 *
 *   node --env-file=.env --import tsx scripts/setup-storage.ts
 */
import { randomUUID } from "node:crypto";
import { loadConfig } from "../src/config.js";
import { SupabaseFileStore } from "../src/files/storage.js";
import { ALLOWED_MIME_TYPES } from "../src/files/types.js";
import { HARD_MAX_FILE_BYTES } from "../src/settings.js";

const config = loadConfig({ ...process.env, NODE_ENV: "development" });
if (!config.storage) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are not set (run configure-supabase.ps1)");
const store = new SupabaseFileStore(config.storage);

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const info = await store.ensureBucket({ fileSizeLimit: HARD_MAX_FILE_BYTES, allowedMimeTypes: ALLOWED_MIME_TYPES });
check(`bucket "${config.storage.bucket}" is private`, info.public === false);
check("bucket enforces the 50 MB size limit", info.file_size_limit === HARD_MAX_FILE_BYTES, String(info.file_size_limit));
check("bucket restricts MIME types", (info.allowed_mime_types ?? []).length === ALLOWED_MIME_TYPES.length);

const path = `selftest/${randomUUID()}`;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const uploadUrl = await store.signedUploadUrl(path);
const put = await fetch(uploadUrl, { method: "PUT", body: png, headers: { "content-type": "image/png", "x-upsert": "false" } });
check("browser-style PUT to the signed upload URL succeeds", put.ok, String(put.status));

const html = await fetch(await store.signedUploadUrl(`selftest/${randomUUID()}`), { method: "PUT", body: "<b>x</b>", headers: { "content-type": "text/html" } });
check("the bucket refuses a disallowed type (text/html)", !html.ok, String(html.status));

const stream = await store.open(path);
let size = 0;
if (stream) for await (const chunk of stream) size += chunk.length;
check("the backend can read the object back for verification", size === png.length, `${size} bytes`);

const signed = await store.signedDownloadUrl(path, 60);
const dl = await fetch(signed);
check("a signed download URL works", dl.ok && (await dl.arrayBuffer()).byteLength === png.length, String(dl.status));

const anon = await fetch(`${config.storage.url}/storage/v1/object/public/${config.storage.bucket}/${path}`);
check("the object is not reachable through a public URL", !anon.ok, String(anon.status));

await store.remove([path]);
check("delete removes the object", (await store.open(path)) === null);

console.log(`\n${failures ? `${failures} check(s) FAILED` : "Storage is ready."}`);
process.exit(failures ? 1 : 0);
