import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupChannelMessages, sendMessage, sendSchema } from "../src/chat/service.js";
import { parseYoutubeId } from "../src/collab/youtube.js";
import { channels, files, messages, tasks } from "../src/db/schema.js";
import { cleanupFiles } from "../src/files/service.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
  await t.close();
});

const DAY = 86_400_000;
const general = async () => (await t.db.select().from(channels).where(eq(channels.name, "general")))[0]!.id;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7)]);

describe("retention", () => {
  it("expires uploads within 5 days and deletes files older than that, including ones without an expiry", async () => {
    const a = await t.activeMember("alice");
    const target = { kind: "channel", id: await general() };
    const req = await t.call("POST", "/api/v1/files/uploads", { target, name: "a.png", size: 100, mime: "image/png", expiresInDays: 30 }, { cookie: a.cookie });
    const expiresAt = new Date(req.json().file.expiresAt).getTime();
    expect(expiresAt - t.clock.now.getTime()).toBeLessThanOrEqual(5 * DAY);

    // A legacy row with no expiry, uploaded six days ago, is still removed by the retention rule.
    const [legacy] = await t.db
      .insert(files)
      .values({ ownerId: a.id, channelId: target.id, objectPath: "ch/x/legacy", name: "old.pdf", mime: "application/pdf", kind: "document", sizeBytes: 10, status: "ready", createdAt: new Date(t.clock.now.getTime() - 6 * DAY) })
      .returning();
    t.files.objects.set("ch/x/legacy", Buffer.from("x"));
    await cleanupFiles({ db: t.db, files: t.files, now: () => t.clock.now });
    const [row] = await t.db.select().from(files).where(eq(files.id, legacy!.id));
    expect(row!.status).toBe("deleted");
    expect(t.files.removed).toContain("ch/x/legacy");
  });

  it("deletes channel messages after 10 days and keeps direct messages", async () => {
    const [a, b] = [await t.activeMember("alice"), await t.activeMember("bob")];
    const ch = { kind: "channel" as const, id: await general() };
    const dm = (await t.call("POST", "/api/v1/conversations", { userId: b.id }, { cookie: a.cookie })).json();
    const old = new Date(t.clock.now.getTime() - 11 * DAY);
    const actor = { id: a.id, role: "member" as const };
    const m1 = await sendMessage(t.db, actor, sendSchema.parse({ target: ch, body: "old public", clientId: "client-01" }));
    const m2 = await sendMessage(t.db, actor, sendSchema.parse({ target: { kind: "conversation", id: dm.id }, body: "old private", clientId: "client-02" }));
    await sendMessage(t.db, actor, sendSchema.parse({ target: ch, body: "fresh public", clientId: "client-03" }));
    for (const id of [m1.message.id, m2.message.id]) await t.db.update(messages).set({ createdAt: old }).where(eq(messages.id, id));

    expect((await cleanupChannelMessages(t.db, t.clock.now)).removed).toBe(1);
    const left = (await t.db.select().from(messages)).map((m) => m.body).sort();
    expect(left).toEqual(["fresh public", "old private"]);
  });
});

describe("YouTube in the lounge and Watch Together", () => {
  it("parses common YouTube links and rejects everything else", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ])
      expect(parseYoutubeId(u)).toBe("dQw4w9WgXcQ");
    for (const u of ["https://vimeo.com/123", "https://evil.example/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "short"]) expect(parseYoutubeId(u)).toBeNull();
  });

  it("queues a requested YouTube video and plays it for everyone", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const bad = await t.call("POST", "/api/v1/lounge/requests", { youtubeUrl: "https://example.org/x" }, { cookie: a.cookie });
    expect(bad.json().error).toBe("invalid_youtube_link");
    const gone = await t.call("POST", "/api/v1/lounge/requests", { youtubeUrl: "https://youtu.be/xxxxxxxxxxx" }, { cookie: a.cookie });
    expect(gone.json().error).toBe("youtube_unavailable");

    const r = await t.call("POST", "/api/v1/lounge/requests", { youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", note: "for Friday" }, { cookie: a.cookie });
    expect(r.statusCode).toBe(201);
    const lounge = (await t.call("GET", "/api/v1/lounge", undefined, { cookie: admin.cookie })).json();
    expect(lounge.queue.pending[0]).toMatchObject({ youtubeId: "dQw4w9WgXcQ", title: "Video dQw4w9WgXcQ", fileId: null });

    await t.call("POST", `/api/v1/lounge/requests/${r.json().id}/decide`, { decision: "play_next" }, { cookie: admin.cookie });
    const v = lounge.state.version;
    const played = await t.call("POST", "/api/v1/lounge/control", { action: "play", expectedVersion: v }, { cookie: admin.cookie });
    expect(played.json().state.state).toMatchObject({ status: "playing", youtubeId: "dQw4w9WgXcQ", fileId: null, title: "Video dQw4w9WgXcQ" });
  });

  it("lets a member host a watch session that others cannot take over, while an admin can", async () => {
    const admin = await t.adminSession();
    const [a, b] = [await t.activeMember("alice"), await t.activeMember("bob")];
    const start = await t.call("POST", "/api/v1/watch/control", { action: "start", url: "https://youtu.be/dQw4w9WgXcQ", expectedVersion: 0 }, { cookie: a.cookie });
    expect(start.json().state.state).toMatchObject({ youtubeId: "dQw4w9WgXcQ", status: "playing", hostId: a.id });
    const v = start.json().state.version;
    expect((await t.call("POST", "/api/v1/watch/control", { action: "pause", expectedVersion: v }, { cookie: b.cookie })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/watch/control", { action: "start", url: "https://youtu.be/aaaaaaaaaaa", expectedVersion: v }, { cookie: b.cookie })).statusCode).toBe(403);
    const paused = await t.call("POST", "/api/v1/watch/control", { action: "pause", expectedVersion: v }, { cookie: a.cookie });
    expect(paused.json().state.state.status).toBe("paused");
    const stop = await t.call("POST", "/api/v1/watch/control", { action: "stop", expectedVersion: paused.json().state.version }, { cookie: admin.cookie });
    expect(stop.json().state.state).toMatchObject({ youtubeId: null, status: "stopped" });

    expect((await t.call("POST", "/api/v1/watch/react", { emoji: "🍿" }, { cookie: b.cookie })).statusCode).toBe(200);
    expect((await t.call("POST", "/api/v1/watch/react", { emoji: "<b>" }, { cookie: b.cookie })).statusCode).toBe(400);
  });
});

describe("profile", () => {
  it("edits name and status, and stores a profile photo up to 200 KB of a real image type", async () => {
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bob");
    const p = await t.call("PUT", "/api/v1/me/profile", { fullName: "Alice Liddell", statusEmoji: "☕", statusText: "Coffee break" }, { cookie: a.cookie });
    expect(p.json()).toMatchObject({ fullName: "Alice Liddell", statusEmoji: "☕", statusText: "Coffee break" });
    expect((await t.call("PUT", "/api/v1/me/profile", { fullName: "  " }, { cookie: a.cookie })).statusCode).toBe(400);

    const up = await t.call("PUT", "/api/v1/me/avatar", { data: JPEG.toString("base64") }, { cookie: a.cookie });
    expect(up.statusCode).toBe(200);
    const key = up.json().avatarKey;
    const members = (await t.call("GET", "/api/v1/members", undefined, { cookie: b.cookie })).json();
    expect(members.find((m: { id: string }) => m.id === a.id)).toMatchObject({ avatarKey: key, statusEmoji: "☕" });

    const img = await t.call("GET", `/api/v1/users/${a.id}/avatar?v=${key}`, undefined, { cookie: b.cookie });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.headers["cross-origin-resource-policy"]).toBe("same-site");
    expect(img.headers["cache-control"]).toBe("private, max-age=86400");
    expect(img.rawPayload.equals(JPEG)).toBe(true);
    expect((await t.call("GET", `/api/v1/users/${a.id}/avatar`)).statusCode).toBe(401);

    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(201 * 1024)]);
    expect((await t.call("PUT", "/api/v1/me/avatar", { data: big.toString("base64") }, { cookie: a.cookie })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await t.call("PUT", "/api/v1/me/avatar", { data: Buffer.from("<svg onload=alert(1)>").toString("base64") }, { cookie: a.cookie })).json().error).toBe("avatar_not_image");

    await t.call("DELETE", "/api/v1/me/avatar", undefined, { cookie: a.cookie });
    expect((await t.call("GET", `/api/v1/users/${a.id}/avatar`, undefined, { cookie: b.cookie })).statusCode).toBe(404);
  });
});

describe("buzz", () => {
  it("lets members buzz each other with a cooldown; only admins buzz everyone", async () => {
    const admin = await t.adminSession();
    const [a, b] = [await t.activeMember("alice"), await t.activeMember("bob")];
    expect((await t.call("POST", "/api/v1/buzz", { userId: b.id }, { cookie: a.cookie })).statusCode).toBe(200);
    expect((await t.call("POST", "/api/v1/buzz", { userId: b.id }, { cookie: a.cookie })).json().error).toBe("buzz_cooldown");
    expect((await t.call("POST", "/api/v1/buzz", { userId: a.id }, { cookie: a.cookie })).statusCode).toBe(422);
    expect((await t.call("POST", "/api/v1/buzz", { everyone: true }, { cookie: a.cookie })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/buzz", { everyone: true }, { cookie: admin.cookie })).statusCode).toBe(200);
    await t.call("POST", "/api/v1/blocks", { userId: a.id }, { cookie: b.cookie });
    t.advance(30_000);
    expect((await t.call("POST", "/api/v1/buzz", { userId: b.id }, { cookie: a.cookie })).statusCode).toBe(403);
  });
});

describe("to-do list", () => {
  it("is shared and editable by every member; admin items stay with admins", async () => {
    const admin = await t.adminSession();
    const [a, b] = [await t.activeMember("alice"), await t.activeMember("bob")];
    const pub = (await t.call("POST", "/api/v1/tasks", { title: "Bring snacks", visibility: "admin" }, { cookie: a.cookie })).json();
    expect(pub.visibility).toBe("public"); // members cannot create admin-only items
    const edited = await t.call("PUT", `/api/v1/tasks/${pub.id}`, { title: "Bring snacks and tea", done: true }, { cookie: b.cookie });
    expect(edited.json()).toMatchObject({ title: "Bring snacks and tea" });
    expect(edited.json().doneAt).toBeTruthy();
    expect((await t.call("PUT", `/api/v1/tasks/${pub.id}`, { highlight: true }, { cookie: b.cookie })).statusCode).toBe(403);

    const secret = (await t.call("POST", "/api/v1/tasks", { title: "Review budget", visibility: "admin" }, { cookie: admin.cookie })).json();
    const forMember = (await t.call("GET", "/api/v1/tasks", undefined, { cookie: a.cookie })).json();
    expect(forMember.map((x: { id: string }) => x.id)).toEqual([pub.id]);
    expect((await t.call("PUT", `/api/v1/tasks/${secret.id}`, { done: true }, { cookie: a.cookie })).statusCode).toBe(404);
    expect((await t.call("DELETE", `/api/v1/tasks/${secret.id}`, undefined, { cookie: a.cookie })).statusCode).toBe(404);
    expect((await t.call("GET", "/api/v1/tasks", undefined, { cookie: admin.cookie })).json()).toHaveLength(2);

    expect((await t.call("DELETE", `/api/v1/tasks/${pub.id}`, undefined, { cookie: b.cookie })).statusCode).toBe(200);
    const activity = (await t.call("GET", "/api/v1/activity", undefined, { cookie: a.cookie })).json();
    expect(activity.some((x: { kind: string }) => x.kind === "task.done")).toBe(true);
  });
});

describe("meeting and coffee requests", () => {
  it("turns an approved request into a highlighted admin-only to-do and blocks overlapping approvals", async () => {
    const admin = await t.adminSession();
    const [a, b] = [await t.activeMember("alice"), await t.activeMember("bob")];
    const at = (days: number, hour: number) => {
      const d = new Date(t.clock.now.getTime() + days * DAY);
      d.setUTCHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    expect((await t.call("POST", "/api/v1/meeting-requests", { topic: "Now", startsAt: new Date(t.clock.now.getTime() + 60_000).toISOString(), durationMin: 30 }, { cookie: a.cookie })).json().error).toBe("request_too_soon");

    const r1 = (await t.call("POST", "/api/v1/meeting-requests", { kind: "coffee", topic: "Catch up", startsAt: at(3, 15), durationMin: 30 }, { cookie: a.cookie })).json();
    const r2 = (await t.call("POST", "/api/v1/meeting-requests", { topic: "Thesis chat", startsAt: at(3, 15), durationMin: 60 }, { cookie: b.cookie })).json();
    expect((await t.call("GET", "/api/v1/meeting-requests", undefined, { cookie: a.cookie })).json().map((x: { id: string }) => x.id)).toEqual([r1.id]);
    expect((await t.call("POST", `/api/v1/meeting-requests/${r1.id}/decide`, { decision: "approve" }, { cookie: a.cookie })).statusCode).toBe(403);

    const ok = await t.call("POST", `/api/v1/meeting-requests/${r1.id}/decide`, { decision: "approve", note: "See you" }, { cookie: admin.cookie });
    expect(ok.json().status).toBe("approved");
    const [task] = await t.db.select().from(tasks).where(eq(tasks.meetingRequestId, r1.id));
    expect(task).toMatchObject({ visibility: "admin", highlight: true, title: "☕ Coffee with @alice: Catch up" });
    expect(task!.dueAt!.toISOString()).toBe(at(3, 15));
    expect((await t.call("POST", `/api/v1/meeting-requests/${r2.id}/decide`, { decision: "approve" }, { cookie: admin.cookie })).json().error).toBe("slot_taken");

    // Bob sees the slot as busy without Alice's name or topic; Alice was notified.
    const from = at(0, 0), to = at(10, 0);
    const cal = (await t.call("GET", `/api/v1/calendar?from=${from}&to=${to}`, undefined, { cookie: b.cookie })).json();
    expect(cal.find((x: { id: string }) => x.id === r1.id)).toMatchObject({ topic: "Busy", kind: null, mine: false });
    const notes = (await t.call("GET", "/api/v1/notifications", undefined, { cookie: a.cookie })).json();
    expect(notes[0]).toMatchObject({ kind: "meeting_request_decided" });

    await t.call("POST", `/api/v1/meeting-requests/${r1.id}/cancel`, {}, { cookie: a.cookie });
    expect(await t.db.select().from(tasks).where(eq(tasks.meetingRequestId, r1.id))).toHaveLength(0);
  });
});
