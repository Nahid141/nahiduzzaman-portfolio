import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { START_LEAD_MS } from "../src/collab/service.js";
import { channels } from "../src/db/schema.js";
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

const MP3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(300, 7)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(60, 32)]);

async function shared(cookie: string, name: string, mime: string, bytes: Buffer, target?: { kind: "channel" | "conversation"; id: string }) {
  const g = target ?? { kind: "channel" as const, id: (await t.db.select().from(channels).where(eq(channels.name, "general")))[0]!.id };
  const req = (await t.call("POST", "/api/v1/files/uploads", { target: g, name, size: bytes.length, mime }, { cookie })).json();
  t.files.objects.set(`${g.kind === "channel" ? "ch" : "cv"}/${g.id}/${req.file.id}`, bytes);
  await t.call("POST", `/api/v1/files/${req.file.id}/complete`, {}, { cookie });
  return req.file.id as string;
}

const lounge = async (cookie: string) => (await t.call("GET", "/api/v1/lounge", undefined, { cookie })).json();
const control = (cookie: string, body: Record<string, unknown>) => t.call("POST", "/api/v1/lounge/control", body, { cookie });

describe("music lounge", () => {
  it("runs request -> admin approval -> server-timed start -> pause/seek with versioned state", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const fileId = await shared(a.cookie, "song.mp3", "audio/mpeg", MP3);

    const req = await t.call("POST", "/api/v1/lounge/requests", { fileId, note: "please" }, { cookie: a.cookie });
    expect(req.statusCode).toBe(201);
    expect((await lounge(admin.cookie)).queue.pending).toHaveLength(1);

    // Members cannot approve or control playback.
    expect((await t.call("POST", `/api/v1/lounge/requests/${req.json().id}/decide`, { decision: "queue" }, { cookie: a.cookie })).statusCode).toBe(403);
    expect((await control(a.cookie, { action: "play", expectedVersion: 0 })).statusCode).toBe(403);

    await t.call("POST", `/api/v1/lounge/requests/${req.json().id}/decide`, { decision: "queue" }, { cookie: admin.cookie });
    const v0 = (await lounge(admin.cookie)).state.version;
    const started = (await control(admin.cookie, { action: "play", expectedVersion: v0 })).json().state;
    expect(started.state).toMatchObject({ status: "playing", fileId, requestId: req.json().id });
    expect(started.state.anchorMs).toBe(t.clock.now.getTime() + START_LEAD_MS);

    // A stale write is refused with the current state, so the client can re-apply.
    const stale = await control(admin.cookie, { action: "pause", expectedVersion: v0 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().current.version).toBe(started.version);

    t.advance(START_LEAD_MS + 10_000);
    const paused = (await control(admin.cookie, { action: "pause", expectedVersion: started.version })).json().state;
    expect(paused.state).toMatchObject({ status: "paused", positionMs: 10_000, anchorMs: null });
    const sought = (await control(admin.cookie, { action: "seek", positionMs: 42_000, expectedVersion: paused.version })).json().state;
    expect(sought.state.positionMs).toBe(42_000);
  });

  it("only accepts audio from public channels, so every listener may fetch it", async () => {
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bobby");
    const pdf = await shared(a.cookie, "x.pdf", "application/pdf", PDF);
    expect((await t.call("POST", "/api/v1/lounge/requests", { fileId: pdf }, { cookie: a.cookie })).json().error).toBe("not_audio");
    const cv = (await t.call("POST", "/api/v1/conversations", { userId: b.id }, { cookie: a.cookie })).json();
    const privateSong = await shared(a.cookie, "p.mp3", "audio/mpeg", MP3, { kind: "conversation", id: cv.id });
    expect((await t.call("POST", "/api/v1/lounge/requests", { fileId: privateSong }, { cookie: a.cookie })).json().error).toBe("file_not_shareable");
  });

  it("lets listeners advance only when the reported track has really ended, once", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const f1 = await shared(a.cookie, "one.mp3", "audio/mpeg", MP3);
    const f2 = await shared(a.cookie, "two.mp3", "audio/mpeg", MP3);
    for (const f of [f1, f2]) {
      const r = (await t.call("POST", "/api/v1/lounge/requests", { fileId: f }, { cookie: a.cookie })).json();
      await t.call("POST", `/api/v1/lounge/requests/${r.id}/decide`, { decision: "queue" }, { cookie: admin.cookie });
    }
    let v = (await control(admin.cookie, { action: "play", expectedVersion: 0 })).json().state;
    const requestId = v.state.requestId;
    v = (await control(a.cookie, { action: "duration", requestId, durationMs: 60_000 })).json().state;
    // Too early: ignored.
    expect((await control(a.cookie, { action: "ended", requestId, expectedVersion: v.version })).json().state.version).toBe(v.version);
    t.advance(START_LEAD_MS + 60_000);
    const [first, second] = await Promise.all([
      control(a.cookie, { action: "ended", requestId, expectedVersion: v.version }),
      control(admin.cookie, { action: "ended", requestId, expectedVersion: v.version }),
    ]);
    const states = [first.json().state, second.json().state];
    expect(states.every((s) => s.state.fileId === f2)).toBe(true);
    expect(new Set(states.map((s) => s.version)).size).toBe(1); // advanced exactly once
  });

  it("DJ grants give temporary control and expire", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    expect((await t.call("POST", "/api/v1/lounge/dj", { userId: a.id, minutes: 30 }, { cookie: a.cookie })).statusCode).toBe(403);
    await t.call("POST", "/api/v1/lounge/dj", { userId: a.id, minutes: 30 }, { cookie: admin.cookie });
    expect((await lounge(a.cookie)).canControl).toBe(true);
    t.advance(31 * 60_000);
    expect((await lounge(a.cookie)).canControl).toBe(false);
  });
});

describe("presentations, follow host, whiteboard", () => {
  it("synchronises PDF pages for everyone and relays the presenter's pointer only", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const pdf = await shared(a.cookie, "deck.pdf", "application/pdf", PDF);
    const started = (await t.call("POST", "/api/v1/presentation/control", { action: "start", fileId: pdf, expectedVersion: 0 }, { cookie: admin.cookie })).json().state;
    expect(started.state).toMatchObject({ active: true, kind: "pdf", page: 1 });
    expect((await t.call("POST", "/api/v1/presentation/control", { action: "page", page: 3, expectedVersion: started.version }, { cookie: a.cookie })).statusCode).toBe(403);
    await t.call("POST", "/api/v1/presentation/control", { action: "page", page: 3, expectedVersion: started.version }, { cookie: admin.cookie });
    expect((await t.call("GET", "/api/v1/state", undefined, { cookie: a.cookie })).json().presentation.state.page).toBe(3);
    expect((await t.call("POST", "/api/v1/presentation/pointer", { x: 0.5, y: 0.5, visible: true }, { cookie: a.cookie })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/presentation/pointer", { x: 0.5, y: 0.5, visible: true }, { cookie: admin.cookie })).statusCode).toBe(200);
  });

  it("follow-host mode is off until the administrator enables it in settings", async () => {
    const admin = await t.adminSession();
    const body = { enabled: true, panel: "presentation", expectedVersion: 0 };
    expect((await t.call("PUT", "/api/v1/state/follow", body, { cookie: admin.cookie })).statusCode).toBe(409);
    await updateSettings(t.db, { followHostMode: true });
    const ok = (await t.call("PUT", "/api/v1/state/follow", body, { cookie: admin.cookie })).json();
    expect(ok.state).toMatchObject({ enabled: true, panel: "presentation" });
  });

  it("stores whiteboard strokes idempotently and lets only controllers clear the board", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    const stroke = { id: "stroke-0001", color: "#22d3ee", width: 3, points: [[0.1, 0.1], [0.2, 0.3]] };
    await t.call("POST", "/api/v1/whiteboard/strokes", stroke, { cookie: a.cookie });
    await t.call("POST", "/api/v1/whiteboard/strokes", stroke, { cookie: a.cookie });
    expect((await t.call("GET", "/api/v1/whiteboard", undefined, { cookie: a.cookie })).json().state.strokes).toHaveLength(1);
    expect((await t.call("POST", "/api/v1/whiteboard/clear", {}, { cookie: a.cookie })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/whiteboard/clear", {}, { cookie: admin.cookie })).statusCode).toBe(200);
  });
});

describe("polls and announcements", () => {
  it("polls follow room access; single-choice is enforced; re-voting replaces the vote", async () => {
    const a = await t.activeMember("alice");
    const b = await t.activeMember("bobby");
    const c = await t.activeMember("carol");
    const cv = (await t.call("POST", "/api/v1/conversations", { userId: b.id }, { cookie: a.cookie })).json();
    const target = { kind: "conversation", id: cv.id };
    const poll = (await t.call("POST", "/api/v1/polls", { target, question: "Lunch?", options: ["Pizza", "Sushi"] }, { cookie: a.cookie })).json();
    expect((await t.call("POST", `/api/v1/polls/${poll.id}/vote`, { options: [0] }, { cookie: c.cookie })).statusCode).toBe(404);
    expect((await t.call("POST", `/api/v1/polls/${poll.id}/vote`, { options: [0, 1] }, { cookie: b.cookie })).statusCode).toBe(400);
    await t.call("POST", `/api/v1/polls/${poll.id}/vote`, { options: [0] }, { cookie: b.cookie });
    const after = (await t.call("POST", `/api/v1/polls/${poll.id}/vote`, { options: [1] }, { cookie: b.cookie })).json();
    expect(after.options.map((o: { count: number }) => o.count)).toEqual([0, 1]);
    expect((await t.call("POST", `/api/v1/polls/${poll.id}/close`, {}, { cookie: b.cookie })).statusCode).toBe(403);
    await t.call("POST", `/api/v1/polls/${poll.id}/close`, {}, { cookie: a.cookie });
    expect((await t.call("POST", `/api/v1/polls/${poll.id}/vote`, { options: [0] }, { cookie: b.cookie })).statusCode).toBe(409);
  });

  it("only administrators publish announcements", async () => {
    const admin = await t.adminSession();
    const a = await t.activeMember("alice");
    expect((await t.call("POST", "/api/v1/announcements", { body: "Hi" }, { cookie: a.cookie })).statusCode).toBe(403);
    expect((await t.call("POST", "/api/v1/announcements", { body: "Welcome" }, { cookie: admin.cookie })).statusCode).toBe(201);
    expect((await t.call("GET", "/api/v1/announcements", undefined, { cookie: a.cookie })).json()[0].body).toBe("Welcome");
  });
});
