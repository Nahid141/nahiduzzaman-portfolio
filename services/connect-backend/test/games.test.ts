import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { games } from "../src/db/schema.js";
import { cleanupGames } from "../src/games/service.js";
import { testApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.app.close();
  await t.close();
});

describe("games room", () => {
  it("runs a two-player game: join starts it, turns are enforced, the result is recorded", async () => {
    const [a, b, c] = [await t.activeMember("alice"), await t.activeMember("bob"), await t.activeMember("carol")];
    const created = await t.call("POST", "/api/v1/games", { kind: "tictactoe" }, { cookie: a.cookie });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect((await t.call("POST", "/api/v1/games", { kind: "poker" }, { cookie: a.cookie })).statusCode).toBe(400);

    const joined = (await t.call("POST", `/api/v1/games/${id}/join`, {}, { cookie: b.cookie })).json();
    expect(joined.status).toBe("active");
    expect(joined.seat).toBe(1);
    expect((await t.call("POST", `/api/v1/games/${id}/join`, {}, { cookie: c.cookie })).json().error).toBe("game_started");

    const move = (who: { cookie: string }, cell: number) => t.call("POST", `/api/v1/games/${id}/move`, { cell }, { cookie: who.cookie });
    expect((await move(b, 0)).json().error).toBe("not_your_turn");
    expect((await move(c, 0)).statusCode).toBe(403); // spectators cannot play
    for (const [who, cell] of [[a, 0], [b, 3], [a, 1], [b, 4]] as const) expect((await move(who, cell)).statusCode).toBe(200);
    const won = (await move(a, 2)).json();
    expect(won.status).toBe("finished");
    expect(won.winners).toEqual([0]);
    expect((await move(b, 5)).json().error).toBe("game_not_active");

    // Spectators can watch; the list shows the result.
    expect((await t.call("GET", `/api/v1/games/${id}`, undefined, { cookie: c.cookie })).json().seat).toBeNull();
    const list = (await t.call("GET", "/api/v1/games", undefined, { cookie: c.cookie })).json();
    expect(list.find((g: { id: string }) => g.id === id).winners).toEqual([0]);
    // The finished game appears in the admin-only activity feed.
    const admin = await t.adminSession();
    const feed = (await t.call("GET", "/api/v1/activity", undefined, { cookie: admin.cookie })).json();
    expect(feed.find((x: { kind: string }) => x.kind === "game.finished").payload).toEqual({ game: "tictactoe", winners: "alice" });
  });

  it("multi-player tables wait for the creator to start; dice come from the server", async () => {
    const [a, b, c] = [await t.activeMember("alice"), await t.activeMember("bob"), await t.activeMember("carol")];
    const id = (await t.call("POST", "/api/v1/games", { kind: "ludo" }, { cookie: a.cookie })).json().id;
    expect((await t.call("POST", `/api/v1/games/${id}/start`, {}, { cookie: a.cookie })).json().error).toBe("need_more_players");
    await t.call("POST", `/api/v1/games/${id}/join`, {}, { cookie: b.cookie });
    await t.call("POST", `/api/v1/games/${id}/join`, {}, { cookie: c.cookie });
    expect((await t.call("POST", `/api/v1/games/${id}/start`, {}, { cookie: b.cookie })).statusCode).toBe(403);
    const started = (await t.call("POST", `/api/v1/games/${id}/start`, {}, { cookie: a.cookie })).json();
    expect(started.status).toBe("active");
    expect(started.state.colors).toEqual([0, 1, 2]);

    t.dice.push(6);
    const rolled = (await t.call("POST", `/api/v1/games/${id}/move`, { action: "roll" }, { cookie: a.cookie })).json();
    expect(rolled.state.dice).toBe(6);
    expect(rolled.state.legal).toEqual([0, 1, 2, 3]);
    // A browser cannot choose its own dice.
    const cheat = await t.call("POST", `/api/v1/games/${id}/move`, { action: "roll", dice: 6 }, { cookie: a.cookie });
    expect(cheat.json().error).toBe("move_a_token");

    // Resigning skips that seat; when one player is left they win.
    await t.call("POST", `/api/v1/games/${id}/resign`, {}, { cookie: a.cookie });
    let g = (await t.call("GET", `/api/v1/games/${id}`, undefined, { cookie: b.cookie })).json();
    expect(g.state.turn).toBe(1);
    expect(g.state.out).toEqual([true, false, false]);
    await t.call("POST", `/api/v1/games/${id}/resign`, {}, { cookie: c.cookie });
    g = (await t.call("GET", `/api/v1/games/${id}`, undefined, { cookie: b.cookie })).json();
    expect(g.status).toBe("finished");
    expect(g.winners).toEqual([1]);
  });

  it("keeps rock-paper-scissors picks secret from the opponent and spectators", async () => {
    const [a, b, c] = [await t.activeMember("alice"), await t.activeMember("bob"), await t.activeMember("carol")];
    const id = (await t.call("POST", "/api/v1/games", { kind: "rps" }, { cookie: a.cookie })).json().id;
    await t.call("POST", `/api/v1/games/${id}/join`, {}, { cookie: b.cookie });
    const mine = (await t.call("POST", `/api/v1/games/${id}/move`, { pick: "rock" }, { cookie: a.cookie })).json();
    expect(mine.state.picks).toEqual(["rock", null]);
    for (const who of [b, c]) {
      const seen = (await t.call("GET", `/api/v1/games/${id}`, undefined, { cookie: who.cookie })).json();
      expect(JSON.stringify(seen)).not.toContain("rock");
      expect(seen.state.picked).toEqual([true, false]);
    }
  });

  it("limits open tables, lets players leave a waiting table, and cleans up", async () => {
    const a = await t.activeMember("alice");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await t.call("POST", "/api/v1/games", { kind: "chess" }, { cookie: a.cookie })).json().id);
    expect((await t.call("POST", "/api/v1/games", { kind: "chess" }, { cookie: a.cookie })).json().error).toBe("too_many_tables");
    expect((await t.call("POST", `/api/v1/games/${ids[0]}/leave`, {}, { cookie: a.cookie })).json().status).toBe("abandoned");

    t.advance(25 * 3600_000);
    await cleanupGames(t.db, t.clock.now);
    const rows = await t.db.select().from(games).where(eq(games.createdBy, a.id));
    expect(rows.every((g) => g.status === "abandoned")).toBe(true);
    t.advance(31 * 24 * 3600_000);
    await cleanupGames(t.db, t.clock.now);
    expect(await t.db.select().from(games)).toHaveLength(0);
    expect((await t.call("GET", "/api/v1/games", undefined, {})).statusCode).toBe(401);
  });
});
