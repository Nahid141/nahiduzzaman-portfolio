import { randomInt } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { games } from "../db/schema.js";
import { engineFor, GAME_KINDS } from "./engines.js";
import { GameError, nextSeat, type BaseState, type Rng } from "./types.js";

type Actor = { id: string; role: "admin" | "member"; username: string; fullName: string };
type Row = typeof games.$inferSelect;

/** Unpredictable dice: browsers never roll. */
export const secureRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export const MAX_OPEN_TABLES = 3; // waiting tables one person may have opened
const WAITING_TTL_MS = 24 * 3600_000;
const IDLE_TTL_MS = 7 * 24 * 3600_000;
const KEEP_FINISHED_MS = 30 * 24 * 3600_000;

export const createGameSchema = z.object({ kind: z.enum(GAME_KINDS) });

const engine = (kind: string) => {
  const e = engineFor(kind);
  if (!e) throw new GameError("unknown_game");
  return e;
};
const seatOf = (g: Row, userId: string) => g.players.findIndex((p) => p.id === userId);

function summary(g: Row) {
  const s = g.state as BaseState | null;
  return {
    id: g.id,
    kind: g.kind,
    name: engine(g.kind).name,
    status: g.status,
    players: g.players.map((p) => ({ id: p.id, username: p.username, fullName: p.fullName })),
    minPlayers: engine(g.kind).minPlayers,
    maxPlayers: engine(g.kind).maxPlayers,
    turn: s?.turn ?? null,
    winners: s?.outcome?.winners ?? null,
    out: s?.out ?? [],
    version: g.version,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

/** One game as `viewer` may see it: hidden choices stay hidden from opponents and spectators. */
export function gameView(g: Row, viewerId: string) {
  const seat = seatOf(g, viewerId);
  const e = engine(g.kind);
  const s = g.state as BaseState | null;
  return { ...summary(g), seat: seat >= 0 ? seat : null, simultaneous: Boolean(e.simultaneous), state: s ? (e.view ? e.view(s, seat >= 0 ? seat : null) : s) : null };
}

export async function listGames(db: Db, now: Date) {
  const rows = await db
    .select()
    .from(games)
    .where(or(inArray(games.status, ["waiting", "active"]), and(eq(games.status, "finished"), gt(games.finishedAt, new Date(now.getTime() - 24 * 3600_000)))))
    .orderBy(desc(games.updatedAt))
    .limit(60);
  return rows.map(summary);
}

export async function getGame(db: Db, id: string) {
  const [g] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!g) throw new GameError("not_found", 404);
  return g;
}

export async function createGame(db: Db, me: Actor, kind: string, now: Date) {
  const open = await db.select({ id: games.id }).from(games).where(and(eq(games.createdBy, me.id), eq(games.status, "waiting")));
  if (open.length >= MAX_OPEN_TABLES) throw new GameError("too_many_tables", 429);
  const [g] = await db
    .insert(games)
    .values({ kind, players: [{ id: me.id, username: me.username, fullName: me.fullName }], createdBy: me.id, createdAt: now, updatedAt: now })
    .returning();
  return g!;
}

/** Runs `fn` on the locked row and saves what it returns; the version counter lets browsers spot stale copies. */
async function mutate(db: Db, id: string, now: Date, fn: (g: Row) => Partial<Row>) {
  return db.transaction(async (tx) => {
    const [g] = await tx.select().from(games).where(eq(games.id, id)).for("update").limit(1);
    if (!g) throw new GameError("not_found", 404);
    const patch = fn(g);
    const [saved] = await tx
      .update(games)
      .set({ ...patch, version: g.version + 1, updatedAt: now })
      .where(eq(games.id, id))
      .returning();
    return { before: g, after: saved! };
  });
}

function begin(g: Row, rng: Rng): Partial<Row> {
  return { status: "active", state: engine(g.kind).init(g.players.length, rng) };
}

export function joinGame(db: Db, me: Actor, id: string, now: Date, rng: Rng = secureRng) {
  return mutate(db, id, now, (g) => {
    if (g.status !== "waiting") throw new GameError("game_started", 409);
    if (seatOf(g, me.id) >= 0) throw new GameError("already_joined", 409);
    const e = engine(g.kind);
    if (g.players.length >= e.maxPlayers) throw new GameError("table_full", 409);
    const players = [...g.players, { id: me.id, username: me.username, fullName: me.fullName }];
    // Two-player games start as soon as the second player sits down.
    return players.length === e.maxPlayers && e.minPlayers === e.maxPlayers ? { players, ...begin({ ...g, players }, rng) } : { players };
  });
}

export function startGame(db: Db, me: Actor, id: string, now: Date, rng: Rng = secureRng) {
  return mutate(db, id, now, (g) => {
    if (g.status !== "waiting") throw new GameError("game_started", 409);
    if (g.players[0]?.id !== me.id && me.role !== "admin") throw new GameError("forbidden", 403);
    if (g.players.length < engine(g.kind).minPlayers) throw new GameError("need_more_players", 409);
    return begin(g, rng);
  });
}

export function leaveGame(db: Db, me: Actor, id: string, now: Date) {
  return mutate(db, id, now, (g) => {
    if (g.status !== "waiting") throw new GameError("game_started", 409);
    if (seatOf(g, me.id) < 0) throw new GameError("not_a_player", 403);
    const players = g.players.filter((p) => p.id !== me.id);
    return players.length ? { players } : { players, status: "abandoned", finishedAt: now };
  });
}

export function playMove(db: Db, me: Actor, id: string, input: unknown, now: Date, rng: Rng = secureRng) {
  return mutate(db, id, now, (g) => {
    if (g.status !== "active" || !g.state) throw new GameError("game_not_active", 409);
    const seat = seatOf(g, me.id);
    if (seat < 0) throw new GameError("not_a_player", 403);
    const e = engine(g.kind);
    const s = g.state as BaseState;
    if (s.out[seat]) throw new GameError("not_a_player", 403);
    if (!e.simultaneous && s.turn !== seat) throw new GameError("not_your_turn", 409);
    const next = e.move(s, seat, input, rng);
    return next.outcome ? { state: next, status: "finished", finishedAt: now } : { state: next };
  });
}

export function resignGame(db: Db, me: Actor, id: string, now: Date) {
  return mutate(db, id, now, (g) => {
    if (g.status !== "active" || !g.state) throw new GameError("game_not_active", 409);
    const seat = seatOf(g, me.id);
    const s = structuredClone(g.state as BaseState);
    if (seat < 0 || s.out[seat]) throw new GameError("not_a_player", 403);
    s.out[seat] = true;
    const left = s.out.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
    if (left.length < 2) {
      s.outcome = { winners: left };
      s.turn = null;
      return { state: s, status: "finished", finishedAt: now };
    }
    const e = engine(g.kind);
    const next = e.afterResign ? e.afterResign(s, seat) : s.turn === seat ? { ...s, turn: nextSeat(s, seat) } : s;
    return { state: next };
  });
}

/** Housekeeping: tables nobody joined within a day and games idle for a week are closed; old results are deleted. */
export async function cleanupGames(db: Db, now: Date) {
  const t = now.getTime();
  await db
    .update(games)
    .set({ status: "abandoned", finishedAt: now })
    .where(or(and(eq(games.status, "waiting"), lt(games.updatedAt, new Date(t - WAITING_TTL_MS))), and(eq(games.status, "active"), lt(games.updatedAt, new Date(t - IDLE_TTL_MS)))));
  await db.delete(games).where(and(inArray(games.status, ["finished", "abandoned"]), lt(games.updatedAt, new Date(t - KEEP_FINISHED_MS))));
}
