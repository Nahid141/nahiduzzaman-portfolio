import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RESERVATION_MS } from "../src/meetings/service.js";
import { getUsage } from "../src/lib/usage.js";
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

const create = (cookie: string, body: Record<string, unknown> = {}) =>
  t.call("POST", "/api/v1/meetings", { title: "Lab sync", ...body }, { cookie });
const join = (cookie: string, id: string) => t.call("POST", `/api/v1/meetings/${id}/join`, {}, { cookie });
const host = (cookie: string, id: string, body: Record<string, unknown>) => t.call("POST", `/api/v1/meetings/${id}/host`, body, { cookie });
const decode = (token: string) => JSON.parse(Buffer.from(token.slice(5), "base64url").toString());
const webhook = (body: unknown, auth = "valid") =>
  t.app.inject({ method: "POST", url: "/api/v1/livekit/webhook", payload: JSON.stringify(body), headers: { "content-type": "application/webhook+json", authorization: auth } });

async function members(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await t.activeMember(`member${String(i).padStart(2, "0")}`));
  return out;
}

describe("meetings", () => {
  it("creates a LiveKit room capped at 10 and issues scoped, short-lived tokens", async () => {
    const [h] = await members(1);
    const m = (await create(h!.cookie)).json();
    expect(t.livekit.calls.find((c) => c.op === "createRoom")!.args[1]).toBe(10);
    const j = (await join(h!.cookie, m.id)).json();
    expect(j.state).toBe("admitted");
    const grant = decode(j.token);
    expect(grant).toMatchObject({ identity: h!.id, ttlSeconds: 600 });
    expect(grant.room).toMatch(/^m_[0-9a-f]{24}$/);
    expect(grant.sources).toContain("screen_share");
  });

  it("admits exactly ten of eleven simultaneous join attempts and tells the eleventh it is full", async () => {
    const ms = await members(11);
    const m = (await create(ms[0]!.cookie)).json();
    const results = await Promise.all(ms.map((x) => join(x.cookie, m.id)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(10);
    const refused = results.filter((r) => r.statusCode !== 200);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.json().error).toBe("meeting_full");
  });

  it("frees seats from abandoned reservations, but not from connected participants", async () => {
    await updateSettings(t.db, { maxMeetingParticipants: 2 });
    const [a, b, c] = await members(3);
    const m = (await create(a!.cookie)).json();
    await join(a!.cookie, m.id);
    await join(b!.cookie, m.id);
    expect((await join(c!.cookie, m.id)).json().error).toBe("meeting_full");
    // b never connects: its seat is released after the reservation window.
    t.advance(RESERVATION_MS + 1000);
    expect((await join(c!.cookie, m.id)).statusCode).toBe(200);
    // c connects (LiveKit webhook); now nobody else fits even after the window.
    const room = decode((await join(a!.cookie, m.id)).json().token).room;
    await webhook({ id: "e1", event: "participant_joined", room, identity: c!.id, createdAt: t.clock.now.getTime() });
    await webhook({ id: "e2", event: "participant_joined", room, identity: a!.id, createdAt: t.clock.now.getTime() });
    t.advance(RESERVATION_MS + 1000);
    expect((await join(b!.cookie, m.id)).json().error).toBe("meeting_full");
  });

  it("puts people in the waiting room until the host admits them; locked meetings refuse newcomers", async () => {
    const [h, a, b] = await members(3);
    const m = (await create(h!.cookie, { waitingRoom: true })).json();
    expect((await join(a!.cookie, m.id)).json().state).toBe("waiting");
    expect((await host(a!.cookie, m.id, { action: "admit", userId: a!.id })).statusCode).toBe(403);
    expect((await host(h!.cookie, m.id, { action: "admit", userId: a!.id })).statusCode).toBe(200);
    expect((await join(a!.cookie, m.id)).json().state).toBe("admitted");

    await host(h!.cookie, m.id, { action: "lock", on: true });
    expect((await join(b!.cookie, m.id)).json().error).toBe("meeting_locked");
    expect((await join(a!.cookie, m.id)).statusCode).toBe(200); // already admitted
  });

  it("keeps invite-only meetings invisible to everyone else, including the administrator", async () => {
    const admin = await t.adminSession();
    const [h, invited, outsider] = await members(3);
    const m = (await create(h!.cookie, { inviteOnly: true, invitees: [invited!.id] })).json();
    expect((await join(invited!.cookie, m.id)).statusCode).toBe(200);
    for (const c of [outsider!.cookie, admin.cookie]) {
      expect((await join(c, m.id)).statusCode).toBe(404);
      expect((await t.call("GET", `/api/v1/meetings/${m.id}`, undefined, { cookie: c })).statusCode).toBe(404);
    }
    expect((await t.call("GET", "/api/v1/meetings", undefined, { cookie: outsider!.cookie })).json().meetings).toHaveLength(0);
    // The administrator sees that it exists (monitoring) but not its title or participants, and may end it.
    const seen = (await t.call("GET", "/api/v1/meetings", undefined, { cookie: admin.cookie })).json().meetings[0];
    expect(seen).toMatchObject({ title: "Private meeting", participants: [] });
    expect((await host(admin.cookie, m.id, { action: "end" })).statusCode).toBe(200);
    expect(t.livekit.calls.some((c) => c.op === "deleteRoom")).toBe(true);
  });

  it("host controls: remove, mute (never unmute), screen-share policy with one presenter, transfer", async () => {
    const [h, a, b] = await members(3);
    const m = (await create(h!.cookie, { screenShare: "approved" })).json();
    for (const x of [h, a, b]) await join(x!.cookie, m.id);
    expect(decode((await join(a!.cookie, m.id)).json().token).sources).not.toContain("screen_share");

    await host(h!.cookie, m.id, { action: "grant_screen_share", userId: a!.id, on: true });
    await host(h!.cookie, m.id, { action: "grant_screen_share", userId: b!.id, on: true });
    const shares = t.livekit.calls.filter((c) => c.op === "setSources");
    expect(shares.at(-2)!.args).toEqual([expect.any(String), a!.id, ["camera", "microphone"]]); // a lost it
    expect(shares.at(-1)!.args[2]).toContain("screen_share");

    await host(h!.cookie, m.id, { action: "mute", userId: a!.id, source: "microphone" });
    expect(t.livekit.calls.at(-1)).toMatchObject({ op: "mute", args: [expect.any(String), a!.id, "microphone"] });
    expect((await host(h!.cookie, m.id, { action: "mute", userId: a!.id, source: "unmute" })).statusCode).toBe(400);

    await host(h!.cookie, m.id, { action: "remove", userId: b!.id });
    expect((await join(b!.cookie, m.id)).json().error).toBe("not_admitted");

    await host(h!.cookie, m.id, { action: "transfer_host", userId: a!.id });
    expect((await host(h!.cookie, m.id, { action: "lock", on: true })).statusCode).toBe(403);
    expect((await host(a!.cookie, m.id, { action: "lock", on: true })).statusCode).toBe(200);
  });

  it("counts participant minutes from verified webhooks and stops joins at the monthly cap", async () => {
    const [h, a] = await members(2);
    const m = (await create(h!.cookie)).json();
    const room = decode((await join(h!.cookie, m.id)).json().token).room;
    expect((await webhook({ event: "participant_joined", room, identity: h!.id }, "forged")).statusCode).toBe(401);
    await webhook({ id: "1", event: "participant_joined", room, identity: h!.id, createdAt: t.clock.now.getTime() });
    await webhook({ id: "2", event: "participant_left", room, identity: h!.id, createdAt: t.clock.now.getTime() + 125_000 });
    expect(await getUsage(t.db, "meeting_minutes", t.clock.now)).toBe(3);
    await updateSettings(t.db, { meetingMinutesMonthly: 3 });
    expect((await join(a!.cookie, m.id)).json().error).toBe("meeting_quota_exceeded");
  });

  it("removes from the media room anyone LiveKit reports who was never admitted", async () => {
    const [h, a] = await members(2);
    const m = (await create(h!.cookie)).json();
    const room = decode((await join(h!.cookie, m.id)).json().token).room;
    await webhook({ id: "x", event: "participant_joined", room, identity: a!.id, createdAt: t.clock.now.getTime() });
    expect(t.livekit.calls.at(-1)).toMatchObject({ op: "removeParticipant", args: [room, a!.id] });
  });

  it("audio-only meetings never grant camera publishing", async () => {
    const [h] = await members(1);
    const m = (await create(h!.cookie, { audioOnly: true, screenShare: "host" })).json();
    expect(decode((await join(h!.cookie, m.id)).json().token).sources).toEqual(["microphone", "screen_share", "screen_share_audio"]);
  });
});
