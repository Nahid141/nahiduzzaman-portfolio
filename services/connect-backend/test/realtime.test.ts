import { eq } from "drizzle-orm";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { channels, users } from "../src/db/schema.js";
import { ORIGIN, testApp, type TestApp } from "./helpers.js";

let t: TestApp;
let url: string;
const sockets: Socket[] = [];
const PW = "correct horse battery";

beforeEach(async () => {
  t = await testApp();
  await t.app.listen({ host: "127.0.0.1", port: 0 });
  const addr = t.app.server.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await t.app.close();
  await t.close();
});

async function member(username: string) {
  await t.registerMember(username, PW);
  await t.db.update(users).set({ status: "active" }).where(eq(users.username, username));
  const cookie = t.cookieOf(await t.call("POST", "/api/v1/auth/login/member", { identifier: username, password: PW }));
  const id = (await t.db.select().from(users).where(eq(users.username, username)))[0]!.id;
  return { cookie, id, username };
}

function open(cookie: string, origin = ORIGIN): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(url, { path: "/api/v1/socket", transports: ["websocket"], forceNew: true, reconnection: false, extraHeaders: { cookie, origin } });
    sockets.push(s);
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => reject(e));
  });
}

const send = (s: Socket, event: string, payload: unknown) => s.timeout(5000).emitWithAck(event, payload);

function next<T = unknown>(s: Socket, event: string, ms = 1500): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    s.once(event, (p: T) => {
      clearTimeout(timer);
      resolve(p);
    });
  });
}

const generalId = async () => (await t.db.select().from(channels).where(eq(channels.name, "general")))[0]!.id;
let n = 0;
const cid = () => `client-${Date.now()}-${n++}`;

describe("socket handshake", () => {
  it("rejects missing sessions and foreign origins", async () => {
    await expect(open("")).rejects.toThrow(/unauthenticated/);
    const ada = await member("ada");
    await expect(open(ada.cookie, "https://evil.example")).rejects.toThrow(/forbidden_origin/);
    await expect(open(ada.cookie)).resolves.toBeTruthy();
  });
});

describe("general chat", () => {
  it("delivers messages live, stores them once per clientId, and serves history", async () => {
    const [ada, bob] = [await member("ada"), await member("bob")];
    const [sa, sb] = [await open(ada.cookie), await open(bob.cookie)];
    const target = { kind: "channel", id: await generalId() };
    const incoming = next<{ body: string; author: { username: string } }>(sb, "chat:message");
    const clientId = cid();
    const r1 = await send(sa, "chat:send", { target, body: "hello everyone", clientId });
    expect(r1.ok).toBe(true);
    expect(await incoming).toMatchObject({ body: "hello everyone", author: { username: "ada" } });

    const second = next(sb, "chat:message", 600);
    const r2 = await send(sa, "chat:send", { target, body: "hello everyone", clientId });
    expect(r2.data.id).toBe(r1.data.id);
    expect(await second).toBe("timeout");

    const hist = (await t.call("GET", `/api/v1/channels/${target.id}/messages`, undefined, { cookie: bob.cookie })).json();
    expect(hist.map((m: { body: string }) => m.body)).toEqual(["hello everyone"]);
  });

  it("edits, reactions, pins and deletes follow the permission rules", async () => {
    const admin = await t.adminSession();
    const [ada, bob] = [await member("ada"), await member("bob")];
    const [sa, sb, sx] = [await open(ada.cookie), await open(bob.cookie), await open(admin.cookie)];
    const target = { kind: "channel", id: await generalId() };
    const { data: msg } = await send(sa, "chat:send", { target, body: "draft text", clientId: cid() });

    expect((await send(sb, "chat:edit", { id: msg.id, body: "hijack" })).error).toBe("forbidden");
    const updated = next<{ body: string; editedAt: string }>(sb, "chat:updated");
    expect((await send(sa, "chat:edit", { id: msg.id, body: "final text" })).ok).toBe(true);
    expect(await updated).toMatchObject({ body: "final text" });

    expect((await send(sb, "chat:react", { id: msg.id, emoji: "👍", on: true })).data.reactions).toEqual([
      { emoji: "👍", count: 1, userIds: [bob.id] },
    ]);
    expect((await send(sb, "chat:react", { id: msg.id, emoji: "<script>", on: true })).error).toBe("invalid_reaction");
    expect((await send(sb, "chat:pin", { id: msg.id, on: true })).error).toBe("forbidden");
    expect((await send(sx, "chat:pin", { id: msg.id, on: true })).data.pinned).toBe(true);

    expect((await send(sb, "chat:delete", { id: msg.id })).error).toBe("forbidden");
    const del = await send(sx, "chat:delete", { id: msg.id });
    expect(del.data).toMatchObject({ body: "", reactions: [] });
    expect(del.data.deletedAt).toBeTruthy();
  });

  it("typing indicators reach others but not the sender", async () => {
    const [ada, bob] = [await member("ada"), await member("bob")];
    const [sa, sb] = [await open(ada.cookie), await open(bob.cookie)];
    const target = { kind: "channel", id: await generalId() };
    const toBob = next(sb, "chat:typing");
    const toAda = next(sa, "chat:typing", 500);
    await send(sa, "chat:typing", { target, typing: true });
    expect(await toBob).toMatchObject({ userId: ada.id, typing: true });
    expect(await toAda).toBe("timeout");
  });

  it("paginates history newest-first pages returned in chronological order", async () => {
    const ada = await member("ada");
    const sa = await open(ada.cookie);
    const target = { kind: "channel", id: await generalId() };
    for (let i = 1; i <= 5; i++) {
      await send(sa, "chat:send", { target, body: `m${i}`, clientId: cid() });
      await new Promise((r) => setTimeout(r, 5));
    }
    const page1 = (await t.call("GET", `/api/v1/channels/${target.id}/messages?limit=2`, undefined, { cookie: ada.cookie })).json();
    expect(page1.map((m: { body: string }) => m.body)).toEqual(["m4", "m5"]);
    const page2 = (
      await t.call("GET", `/api/v1/channels/${target.id}/messages?limit=2&before=${page1[0].createdAt}`, undefined, { cookie: ada.cookie })
    ).json();
    expect(page2.map((m: { body: string }) => m.body)).toEqual(["m2", "m3"]);
  });

  it("rate-limits message floods", async () => {
    const ada = await member("ada");
    const sa = await open(ada.cookie);
    const target = { kind: "channel", id: await generalId() };
    const results = [];
    for (let i = 0; i < 16; i++) results.push(await send(sa, "chat:send", { target, body: `spam ${i}`, clientId: cid() }));
    expect(results.at(-1)).toEqual({ ok: false, error: "rate_limited" });
  });

  it("restricted channels are invisible to non-members", async () => {
    const admin = await t.adminSession();
    const [ada, bob] = [await member("ada"), await member("bob")];
    const res = await t.call("POST", "/api/v1/channels", { name: "core-team", kind: "restricted", memberIds: [bob.id] }, { cookie: admin.cookie });
    expect(res.statusCode).toBe(201);
    const id = res.json().id;
    expect((await t.call("POST", "/api/v1/channels", { name: "x-team" }, { cookie: ada.cookie })).statusCode).toBe(403);
    const adaList = (await t.call("GET", "/api/v1/channels", undefined, { cookie: ada.cookie })).json();
    expect(adaList.map((c: { name: string }) => c.name)).toEqual(["general"]);
    expect((await t.call("GET", `/api/v1/channels/${id}/messages`, undefined, { cookie: ada.cookie })).statusCode).toBe(404);
    expect((await t.call("GET", `/api/v1/channels/${id}/messages`, undefined, { cookie: bob.cookie })).statusCode).toBe(200);
    const sa = await open(ada.cookie);
    expect((await send(sa, "chat:send", { target: { kind: "channel", id }, body: "let me in", clientId: cid() })).error).toBe("not_found");
    expect((await send(sa, "subscribe", { target: { kind: "channel", id } })).error).toBe("not_found");
  });
});

describe("private conversations", () => {
  it("only participants receive, read or search a direct conversation; the admin has no access", async () => {
    const admin = await t.adminSession();
    const [ada, bob, cyd] = [await member("ada"), await member("bob"), await member("cyd")];
    const [sa, sb, sc, sx] = [await open(ada.cookie), await open(bob.cookie), await open(cyd.cookie), await open(admin.cookie)];

    const created = await t.call("POST", "/api/v1/conversations", { userId: bob.id }, { cookie: ada.cookie });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    // Opening it again returns the same conversation.
    expect((await t.call("POST", "/api/v1/conversations", { userId: ada.id }, { cookie: bob.cookie })).json().id).toBe(id);
    await new Promise((r) => setTimeout(r, 100));

    const toBob = next<{ body: string }>(sb, "chat:message");
    const toCyd = next(sc, "chat:message", 700);
    const toAdmin = next(sx, "chat:message", 700);
    const sent = await send(sa, "chat:send", { target: { kind: "conversation", id }, body: "secret plan zebra", clientId: cid() });
    expect(await toBob).toMatchObject({ body: "secret plan zebra" });
    expect(await toCyd).toBe("timeout");
    expect(await toAdmin).toBe("timeout");

    for (const c of [cyd.cookie, admin.cookie]) {
      expect((await t.call("GET", `/api/v1/conversations/${id}/messages`, undefined, { cookie: c })).statusCode).toBe(404);
      expect((await t.call("GET", "/api/v1/search?q=zebra", undefined, { cookie: c })).json()).toEqual([]);
      expect((await t.call("GET", `/api/v1/conversations/${id}/receipts`, undefined, { cookie: c })).statusCode).toBe(404);
    }
    expect((await send(sc, "subscribe", { target: { kind: "conversation", id } })).error).toBe("not_found");
    expect((await send(sx, "chat:send", { target: { kind: "conversation", id }, body: "peek", clientId: cid() })).error).toBe("not_found");
    expect((await t.call("GET", "/api/v1/search?q=zebra", undefined, { cookie: bob.cookie })).json()).toHaveLength(1);

    // Unread counts, read receipts and notifications for the recipient.
    const convs = (await t.call("GET", "/api/v1/conversations", undefined, { cookie: bob.cookie })).json();
    expect(convs[0].unread).toBe(1);
    const readEvt = next(sa, "chat:read");
    await send(sb, "chat:read", { target: { kind: "conversation", id }, messageId: sent.data.id });
    expect(await readEvt).toMatchObject({ userId: bob.id });
    expect((await t.call("GET", "/api/v1/conversations", undefined, { cookie: bob.cookie })).json()[0].unread).toBe(0);
    const receipts = (await t.call("GET", `/api/v1/conversations/${id}/receipts`, undefined, { cookie: ada.cookie })).json();
    expect(receipts.map((r: { userId: string }) => r.userId).sort()).toEqual([ada.id, bob.id].sort());
    const notes = (await t.call("GET", "/api/v1/notifications", undefined, { cookie: bob.cookie })).json();
    expect(notes[0].kind).toBe("direct_message");
  });

  it("blocking stops direct messages in both directions", async () => {
    const [ada, bob] = [await member("ada"), await member("bob")];
    const id = (await t.call("POST", "/api/v1/conversations", { userId: bob.id }, { cookie: ada.cookie })).json().id;
    await t.call("POST", "/api/v1/blocks", { userId: ada.id }, { cookie: bob.cookie });
    const sa = await open(ada.cookie);
    expect((await send(sa, "chat:send", { target: { kind: "conversation", id }, body: "hi", clientId: cid() })).error).toBe("blocked");
    expect((await t.call("POST", "/api/v1/conversations", { userId: bob.id }, { cookie: ada.cookie })).statusCode).toBe(403);
  });

  it("mentions notify only people who can see the message", async () => {
    const admin = await t.adminSession();
    const [ada, bob, cyd] = [await member("ada"), await member("bob"), await member("cyd")];
    const id = (
      await t.call("POST", "/api/v1/channels", { name: "pair", kind: "restricted", memberIds: [ada.id, bob.id] }, { cookie: admin.cookie })
    ).json().id;
    const sa = await open(ada.cookie);
    await send(sa, "subscribe", { target: { kind: "channel", id } });
    const r = await send(sa, "chat:send", { target: { kind: "channel", id }, body: "hey @bob and @cyd", clientId: cid() });
    expect(r.data.mentions).toEqual([bob.id]);
    expect((await t.call("GET", "/api/v1/notifications", undefined, { cookie: bob.cookie })).json()[0].kind).toBe("mention");
    expect((await t.call("GET", "/api/v1/notifications", undefined, { cookie: cyd.cookie })).json()).toEqual([]);
  });
});

describe("presence and revocation", () => {
  it("broadcasts presence and lists online members", async () => {
    const [ada, bob] = [await member("ada"), await member("bob")];
    const sb = await open(bob.cookie);
    const seen = next(sb, "presence:update");
    await open(ada.cookie);
    expect(await seen).toEqual({ userId: ada.id, online: true });
    const list = (await t.call("GET", "/api/v1/members", undefined, { cookie: bob.cookie })).json();
    expect(list.filter((m: { online: boolean }) => m.online).map((m: { username: string }) => m.username).sort()).toEqual(["ada", "bob"]);
  });

  it("suspending a user and signing out cut live sockets immediately", async () => {
    const admin = await t.adminSession();
    const [ada, bob] = [await member("ada"), await member("bob")];
    const sa = await open(ada.cookie);
    const gone = next(sa, "disconnect");
    await t.call("POST", `/api/v1/admin/users/${ada.id}/suspend`, {}, { cookie: admin.cookie });
    expect(await gone).not.toBe("timeout");
    await expect(open(ada.cookie)).rejects.toThrow(/unauthenticated/);

    const sb = await open(bob.cookie);
    const bobGone = next(sb, "disconnect");
    await t.call("POST", "/api/v1/auth/logout", {}, { cookie: bob.cookie });
    expect(await bobGone).not.toBe("timeout");
  });
});
