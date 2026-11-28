import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireUser } from "../auth/session.js";
import { activity } from "../db/schema.js";
import type { Realtime } from "../realtime/gateway.js";
import { createGame, createGameSchema, gameView, getGame, joinGame, leaveGame, listGames, playMove, resignGame, secureRng, startGame } from "./service.js";

const idParam = z.object({ id: z.uuid() });

export async function gameRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const { db } = deps;
  const guard = { preHandler: requireUser(deps) };
  type Req = { auth?: { user: { id: string; role: "admin" | "member"; username: string; fullName: string } } };
  const me = (r: Req) => r.auth!.user;
  const now = () => deps.now();
  const rng = deps.random ?? secureRng;
  const limited = async (key: string, windowMs: number, max: number) => (await deps.rateLimit.hit(key, windowMs, now().getTime())) > max;

  // Content-free signals: clients refetch, so hidden choices never ride on a broadcast.
  const changed = (id: string, version: number) => {
    rt.emit("workspace", "games:changed", { id, version });
  };

  type Result = Awaited<ReturnType<typeof playMove>>;
  const done = async (request: Req, r: Result) => {
    changed(r.after.id, r.after.version);
    if (r.before.status === "active" && r.after.status === "finished") {
      const winners = ((r.after.state as { outcome?: { winners: number[] } }).outcome?.winners ?? []).map((i) => r.after.players[i]?.username);
      await db.insert(activity).values({ actorId: me(request).id, kind: "game.finished", payload: { game: r.after.kind, winners: winners.join(", ") }, createdAt: now() });
      rt.emit("admins", "activity:new", { kind: "game.finished" });
    }
    return gameView(r.after, me(request).id);
  };

  app.get("/api/v1/games", guard, async () => listGames(db, now()));

  app.get("/api/v1/games/:id", guard, async (request) => gameView(await getGame(db, idParam.parse(request.params).id), me(request).id));

  app.post("/api/v1/games", guard, async (request, reply) => {
    if (await limited(`games:new:${me(request).id}`, 60_000, 10)) return reply.code(429).send({ error: "rate_limited" });
    const g = await createGame(db, me(request), createGameSchema.parse(request.body).kind, now());
    changed(g.id, g.version);
    return reply.code(201).send(gameView(g, me(request).id));
  });

  const action = (path: string, run: (id: string, request: Req & { body: unknown }) => Promise<Result>) =>
    app.post(`/api/v1/games/:id/${path}`, guard, async (request, reply) => {
      if (await limited(`games:act:${me(request).id}`, 60_000, 150)) return reply.code(429).send({ error: "rate_limited" });
      return done(request, await run(idParam.parse(request.params).id, request));
    });

  action("join", (id, r) => joinGame(db, me(r), id, now(), rng));
  action("start", (id, r) => startGame(db, me(r), id, now(), rng));
  action("leave", (id, r) => leaveGame(db, me(r), id, now()));
  action("resign", (id, r) => resignGame(db, me(r), id, now()));
  action("move", (id, r) => playMove(db, me(r), id, r.body, now(), rng));
}
