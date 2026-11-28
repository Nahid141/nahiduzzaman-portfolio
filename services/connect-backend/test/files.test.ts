import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { channels, files } from "../src/db/schema.js";
import { cleanupFiles, PENDING_TTL_MS } from "../src/files/service.js";
import { updateSettings } from "../src/settings.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
  await t.close();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100, 32)]);
const general = async () => ({ kind: "channel" as const, id: (await t.db.select().from(channels).where(eq(channels.name, "general")))[0]!.id });

/** Request an upload, "PUT" the bytes into the fake bucket, then complete it. */
async function upload(cookie: string, target: { kind: "channel" | "conversation"; id: string }, name: string, mime: string, bytes: Buffer, declared = bytes.length) {
  const req = await t.call("POST", "/api/v1/files/uploads", { target, name, size: declared, mime }, { cookie });
  if (req.statusCode !== 201) return { req, done: null };
  const { file } = req.json();
  t.files.objects.set(`${target.kind === "channel" ? "ch" : "cv"}/${target.id}/${file.id}`, bytes);
  const done = await t.call("POST", `/api/v1/files/${file.id}/complete`, {}, { cookie });
  return { req, done, id: file.id as string };
}

describe("upload pipeline", () => {
  it("accepts a valid image, then serves it only through a short-lived signed URL", async () => {
    const a = await t.activeMember("alice");
    const { req, done, id } = await upload(a.cookie, await general(), "photo.png", "image/png", PNG);
    expect(req.json().uploadHeaders["content-type"]).toBe("image/png");
    expect(req.json().uploadUrl).toMatch(/^memory:\/\/upload\/ch\//);
    expect(done!.statusCode).toBe(200);
    expect(done!.json()).toMatchObject({ status: "ready", kind: "image", scan: "not_scanned" });

    const url = await t.call("POST", `/api/v1/files/${id}/url`, { inline: true }, { cookie: a.cookie });
    expect(url.json()).toMatchObject({ expiresIn: 300 });
    expect(url.json().url).not.toContain("download=");
    const [row] = await t.db.select().from(files).where(eq(files.id, id!));
    expect(row!.sha256).toHaveLength(64);
  });

  it("forces documents that are not previewable to download as attachments", async () => {
    const a = await t.activeMember("alice");
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(50)]);
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { id } = await upload(a.cookie, await general(), "notes.docx", mime, docx);
    const url = await t.call("POST", `/api/v1/files/${id}/url`, { inline: true }, { cookie: a.cookie });
    expect(url.json().url).toContain("download=notes.docx");
  });

  it("rejects disallowed types, mismatched extension/type pairs and oversized files", async () => {
    const a = await t.activeMember("alice");
    const g = await general();
    const html = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "x.html", size: 10, mime: "text/html" }, { cookie: a.cookie });
    expect(html.statusCode).toBe(415);
    const svg = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "x.svg", size: 10, mime: "image/svg+xml" }, { cookie: a.cookie });
    expect(svg.statusCode).toBe(415);
    const lie = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "x.png", size: 10, mime: "application/pdf" }, { cookie: a.cookie });
    expect(lie.statusCode).toBe(415);
    const big = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "x.png", size: 11 * 1024 * 1024, mime: "image/png" }, { cookie: a.cookie });
    expect(big.statusCode).toBe(413);
    const huge = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "x.mp4", size: 51 * 1024 * 1024, mime: "video/mp4" }, { cookie: a.cookie });
    expect(huge.statusCode).toBe(400); // above the Supabase Free 50 MB hard limit
  });

  it("quarantines and deletes an upload whose bytes do not match its declared type or size", async () => {
    const a = await t.activeMember("alice");
    const g = await general();
    const fake = await upload(a.cookie, g, "evil.png", "image/png", Buffer.from("<script>alert(1)</script>"));
    expect(fake.done!.statusCode).toBe(422);
    expect(fake.done!.json().error).toBe("upload_rejected_signature_mismatch");
    const sized = await upload(a.cookie, g, "doc.pdf", "application/pdf", PDF, PDF.length - 10);
    expect(sized.done!.json().error).toBe("upload_rejected_size_mismatch");
    expect(t.files.objects.size).toBe(0);
    const url = await t.call("POST", `/api/v1/files/${fake.id}/url`, {}, { cookie: a.cookie });
    expect(url.statusCode).toBe(404);
  });

  it("refuses to complete an upload that never reached storage", async () => {
    const a = await t.activeMember("alice");
    const req = await t.call("POST", "/api/v1/files/uploads", { target: await general(), name: "a.pdf", size: 10, mime: "application/pdf" }, { cookie: a.cookie });
    const res = await t.call("POST", `/api/v1/files/${req.json().file.id}/complete`, {}, { cookie: a.cookie });
    expect(res.statusCode).toBe(409);
  });

  it("rejects known malware found by the hash scanner", async () => {
    await t.app.close();
    await t.close();
    t = await testApp({ scanner: { lookup: async () => "malware" } });
    const a = await t.activeMember("alice");
    const r = await upload(a.cookie, await general(), "x.pdf", "application/pdf", PDF);
    expect(r.done!.json().error).toBe("upload_rejected_malware");
  });

  it("answers 503 when storage is not configured", async () => {
    await t.app.close();
    await t.close();
    t = await testApp({ noStorage: true });
    const a = await t.activeMember("alice");
    const res = await t.call("POST", "/api/v1/files/uploads", { target: await general(), name: "a.pdf", size: 10, mime: "application/pdf" }, { cookie: a.cookie });
    expect(res.statusCode).toBe(503);
  });
});

describe("file access control", () => {
  it("keeps files in a private conversation away from non-participants and the administrator", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bobby");
    const c = await t.activeMember("carol");
    const cv = (await t.call("POST", "/api/v1/conversations", { userId: b.id }, { cookie: a.cookie })).json();
    const target = { kind: "conversation" as const, id: cv.id };
    const { id } = await upload(a.cookie, target, "secret.pdf", "application/pdf", PDF);

    expect((await t.call("POST", `/api/v1/files/${id}/url`, {}, { cookie: b.cookie })).statusCode).toBe(200);
    for (const outsider of [c.cookie, admin.cookie]) {
      expect((await t.call("POST", `/api/v1/files/${id}/url`, {}, { cookie: outsider })).statusCode).toBe(404);
      expect((await t.call("GET", `/api/v1/files/${id}`, undefined, { cookie: outsider })).statusCode).toBe(404);
      expect((await t.call("DELETE", `/api/v1/files/${id}`, undefined, { cookie: outsider })).statusCode).toBe(404);
      const list = await t.call("GET", "/api/v1/files", undefined, { cookie: outsider });
      expect(list.json().map((f: { id: string }) => f.id)).not.toContain(id);
    }
    // A participant who is not the owner may see but not delete it.
    expect((await t.call("DELETE", `/api/v1/files/${id}`, undefined, { cookie: b.cookie })).statusCode).toBe(403);
    expect((await t.call("GET", "/api/v1/files?q=secret", undefined, { cookie: b.cookie })).json()).toHaveLength(1);
  });

  it("lets an administrator moderate files in shared channels", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const { id } = await upload(a.cookie, await general(), "x.pdf", "application/pdf", PDF);
    expect((await t.call("DELETE", `/api/v1/files/${id}`, undefined, { cookie: admin.cookie })).statusCode).toBe(200);
    expect(t.files.removed).toHaveLength(1);
  });

  it("attaches only the sender's own ready files from the same room to a message", async () => {
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bobby");
    const g = await general();
    const { id } = await upload(a.cookie, g, "x.pdf", "application/pdf", PDF);
    const { sendMessage } = await import("../src/chat/service.js");
    const sent = await sendMessage(t.db, { id: a.id, role: "member" }, { target: g, body: "", clientId: "client-attach-1", attachments: [id!] });
    expect(sent.message.attachments).toEqual([expect.objectContaining({ id, name: "x.pdf", kind: "document" })]);
    await expect(sendMessage(t.db, { id: b.id, role: "member" }, { target: g, body: "steal", clientId: "client-attach-2", attachments: [id!] })).rejects.toThrow(/invalid_attachment/);
    const { sendSchema } = await import("../src/chat/service.js");
    expect(() => sendSchema.parse({ target: g, body: "  ", clientId: "client-attach-3" })).toThrow(/empty message/);
  });
});

describe("quotas and cleanup", () => {
  it("enforces per-user and total storage caps, counting in-flight uploads", async () => {
    await updateSettings(t.db, { storagePerUserBytes: 1000, storageTotalBytes: 1500 });
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bobby");
    const g = await general();
    const req = (cookie: string, size: number) => t.call("POST", "/api/v1/files/uploads", { target: g, name: "a.pdf", size, mime: "application/pdf" }, { cookie });
    expect((await req(a.cookie, 900)).statusCode).toBe(201);
    expect((await req(a.cookie, 200)).json().error).toBe("user_quota_exceeded");
    expect((await req(b.cookie, 500)).statusCode).toBe(201);
    expect((await req(b.cookie, 200)).json().error).toBe("storage_full");
  });

  it("holds simultaneous uploads to the cap (no overshoot under concurrency)", async () => {
    await updateSettings(t.db, { storagePerUserBytes: 10_000, storageTotalBytes: 1000 });
    const a = await t.activeMember("alice");
    const g = await general();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => t.call("POST", "/api/v1/files/uploads", { target: g, name: "a.pdf", size: 300, mime: "application/pdf" }, { cookie: a.cookie }))
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
  });

  it("stops signing downloads when the monthly egress budget is spent", async () => {
    const a = await t.activeMember("alice");
    const { id } = await upload(a.cookie, await general(), "x.pdf", "application/pdf", PDF);
    // Verification already read the file back once (counts as egress).
    await updateSettings(t.db, { egressMonthlyBytes: PDF.length * 2 });
    expect((await t.call("POST", `/api/v1/files/${id}/url`, {}, { cookie: a.cookie })).statusCode).toBe(200);
    expect((await t.call("POST", `/api/v1/files/${id}/url`, {}, { cookie: a.cookie })).json().error).toBe("egress_quota_exceeded");
    const usage = (await t.call("GET", "/api/v1/files/usage", undefined, { cookie: a.cookie })).json();
    expect(usage.egress.usedBytes).toBe(PDF.length * 2);
  });

  it("deletes abandoned uploads and expired files", async () => {
    const a = await t.activeMember("alice");
    const g = await general();
    await t.call("POST", "/api/v1/files/uploads", { target: g, name: "a.pdf", size: 10, mime: "application/pdf" }, { cookie: a.cookie });
    const req = await t.call("POST", "/api/v1/files/uploads", { target: g, name: "b.pdf", size: PDF.length, mime: "application/pdf", expiresInDays: 1 }, { cookie: a.cookie });
    const fid = req.json().file.id;
    t.files.objects.set(`ch/${g.id}/${fid}`, PDF);
    await t.call("POST", `/api/v1/files/${fid}/complete`, {}, { cookie: a.cookie });
    t.advance(PENDING_TTL_MS + 1000);
    const deps = { db: t.db, files: t.files, now: () => t.clock.now };
    expect((await cleanupFiles(deps)).removed).toBe(1);
    await t.db.update(files).set({ expiresAt: new Date(t.clock.now.getTime() - 1000) }).where(eq(files.id, fid));
    expect((await t.call("POST", `/api/v1/files/${fid}/url`, {}, { cookie: a.cookie })).statusCode).toBe(404);
    expect((await cleanupFiles(deps)).removed).toBe(1);
    const left = await t.db.select({ n: sql<string>`count(*)` }).from(files).where(sql`${files.status} <> 'deleted'`);
    expect(Number(left[0]!.n)).toBe(0);
  });
});

describe("database lockdown", () => {
  it("enables row level security on every table in the public schema", async () => {
    const res = await t.db.execute(sql`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
    const rows = (res as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows;
    expect(rows.length).toBeGreaterThanOrEqual(25);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
});
