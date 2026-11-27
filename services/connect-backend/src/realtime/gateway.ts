import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { cookieName, loadAuthByToken } from "../auth/session.js";
import {
  accessibleRooms,
  canAccess,
  ChatError,
  deleteMessage,
  editMessage,
  markRead,
  pin,
  react,
  roomOf,
  sendMessage,
  sendSchema,
  targetSchema,
  type MessageDto,
  type Target,
} from "../chat/service.js";
import { messages, sessions, users } from "../db/schema.js";

type SocketData = { userId: string; sessionId: string; role: "admin" | "member"; username: string; rooms?: string[] };
type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: string }) => void;

export type Realtime = {
  io: Server;
  /** Make every live socket of these users join a room (after a channel/conversation is created). */
  join(userIds: string[], room: string): void;
  emit(room: string, event: string, payload: unknown): void;
};

const EVENTS_PER_WINDOW = 40;
const EVENT_WINDOW_MS = 10_000;
const MESSAGES_PER_WINDOW = 15;

export function attachGateway(app: FastifyInstance, deps: AppDeps): Realtime {
  const io = new Server(app.server, {
    path: "/api/v1/socket",
    cors: { origin: deps.config.allowedOrigins, credentials: true },
    maxHttpBufferSize: 32 * 1024,
    serveClient: false,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: false },
  });

  const realtime: Realtime = {
    io,
    join: (userIds, room) => userIds.forEach((id) => io.in(`user:${id}`).socketsJoin(room)),
    emit: (room, event, payload) => io.to(room).emit(event, payload),
  };

  // Handshake: allowed origin + valid session cookie. Admins must have passed MFA.
  io.use(async (socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (!origin || !deps.config.allowedOrigins.includes(origin)) return next(new Error("forbidden_origin"));
    const cookies = app.parseCookie(socket.handshake.headers.cookie ?? "");
    const auth = await loadAuthByToken(deps, cookies[cookieName(deps)]);
    if (!auth) return next(new Error("unauthenticated"));
    if (auth.user.role === "admin" && !auth.session.mfaPassed) return next(new Error("mfa_enrollment_required"));
    const data: SocketData = { userId: auth.user.id, sessionId: auth.session.id, role: auth.user.role, username: auth.user.username };
    // Rooms are resolved here, before the client sees "connect", so nothing sent right after connecting is missed.
    data.rooms = [`user:${data.userId}`, `session:${data.sessionId}`, "workspace", ...(await accessibleRooms(deps.db, actor(data)))];
    socket.data = data;
    next();
  });

  /** Re-checks on every event that the session and account are still valid. */
  const stillValid = async (d: SocketData) => {
    const [row] = await deps.db
      .select({ status: users.status, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, d.sessionId), isNull(sessions.revokedAt)))
      .limit(1);
    return Boolean(row && row.status === "active" && row.expiresAt > deps.now());
  };

  function on<S extends z.ZodType>(
    socket: Socket,
    event: string,
    schema: S,
    handler: (d: SocketData, payload: z.infer<S>) => Promise<unknown>,
    opts: { messageLimit?: boolean } = {}
  ) {
    socket.on(event, async (payload: unknown, ack?: Ack) => {
      const reply: Ack = typeof ack === "function" ? ack : () => undefined;
      const d = socket.data as SocketData;
      try {
        const t = deps.now().getTime();
        if ((await deps.rateLimit.hit(`ws:${d.userId}`, EVENT_WINDOW_MS, t)) > EVENTS_PER_WINDOW) throw new ChatError("rate_limited", 429);
        if (opts.messageLimit && (await deps.rateLimit.hit(`ws-msg:${d.userId}`, EVENT_WINDOW_MS, t)) > MESSAGES_PER_WINDOW) {
          throw new ChatError("rate_limited", 429);
        }
        if (!(await stillValid(d))) {
          reply({ ok: false, error: "unauthenticated" });
          socket.disconnect(true);
          return;
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) throw new ChatError("invalid_input");
        reply({ ok: true, data: await handler(d, parsed.data) });
      } catch (err) {
        reply({ ok: false, error: err instanceof ChatError ? err.code : "server_error" });
        if (!(err instanceof ChatError)) app.log.error(err);
      }
    });
  }

  const actor = (d: SocketData) => ({ id: d.userId, role: d.role });
  const broadcastUpdate = (m: MessageDto) => io.to(roomOf(m.target)).emit("chat:updated", m);

  io.on("connection", (socket) => {
    const d = socket.data as SocketData;
    // Join and register every handler synchronously: an await here would drop events the client sends at once.
    void socket.join(d.rooms ?? []);
    delete d.rooms;
    const joined = deps.presence.connect(d.userId).then(async (count) => {
      if (count === 1) io.to("workspace").emit("presence:update", { userId: d.userId, online: true });
      socket.emit("presence:snapshot", await deps.presence.online());
    });

    socket.on("disconnect", async () => {
      await joined.catch(() => undefined);
      if ((await deps.presence.disconnect(d.userId)) === 0) {
        io.to("workspace").emit("presence:update", { userId: d.userId, online: false });
      }
    });

    on(
      socket,
      "chat:send",
      sendSchema,
      async (d, input) => {
        const { message, duplicate } = await sendMessage(deps.db, actor(d), input);
        if (!duplicate) {
          io.to(roomOf(input.target)).emit("chat:message", message);
          for (const uid of message.mentions) io.to(`user:${uid}`).emit("notification:new", { kind: "mention", message });
        }
        return message;
      },
      { messageLimit: true }
    );

    on(socket, "chat:edit", z.object({ id: z.uuid(), body: z.string() }), async (d, p) => {
      const m = await editMessage(deps.db, actor(d), p.id, p.body);
      broadcastUpdate(m);
      return m;
    });

    on(socket, "chat:delete", z.object({ id: z.uuid() }), async (d, p) => {
      const m = await deleteMessage(deps.db, actor(d), p.id);
      broadcastUpdate(m);
      return m;
    });

    on(socket, "chat:react", z.object({ id: z.uuid(), emoji: z.string().max(16), on: z.boolean() }), async (d, p) => {
      const m = await react(deps.db, actor(d), p.id, p.emoji, p.on);
      broadcastUpdate(m);
      return m;
    });

    on(socket, "chat:pin", z.object({ id: z.uuid(), on: z.boolean() }), async (d, p) => {
      const m = await pin(deps.db, actor(d), p.id, p.on);
      broadcastUpdate(m);
      return m;
    });

    // Typing and read events only go to rooms the user may access.
    on(socket, "chat:typing", z.object({ target: targetSchema, typing: z.boolean() }), async (d, p) => {
      if (!(await canAccess(deps.db, actor(d), p.target))) throw new ChatError("not_found", 404);
      socket.to(roomOf(p.target)).emit("chat:typing", { target: p.target, userId: d.userId, username: d.username, typing: p.typing });
    });

    // "Read up to this message": the server's own timestamp avoids client clock and rounding issues.
    on(socket, "chat:read", z.object({ target: targetSchema, messageId: z.uuid() }), async (d, p) => {
      if (!(await canAccess(deps.db, actor(d), p.target))) throw new ChatError("not_found", 404);
      const [m] = await deps.db.select().from(messages).where(eq(messages.id, p.messageId)).limit(1);
      const col = p.target.kind === "channel" ? m?.channelId : m?.conversationId;
      if (!m || col !== p.target.id) throw new ChatError("not_found", 404);
      await markRead(deps.db, actor(d), p.target, m.createdAt);
      socket.to(roomOf(p.target)).emit("chat:read", { target: p.target, userId: d.userId, lastReadAt: m.createdAt, messageId: m.id });
    });

    // Explicit subscribe (e.g. after being added somewhere): authorized like everything else.
    on(socket, "subscribe", z.object({ target: targetSchema }), async (d, p: { target: Target }) => {
      if (!(await canAccess(deps.db, actor(d), p.target))) throw new ChatError("not_found", 404);
      await socket.join(roomOf(p.target));
    });
  });

  // Suspensions, bans, password resets and sign-outs cut live connections at once.
  deps.events.on("user:revoked", (userId) => io.in(`user:${userId}`).disconnectSockets(true));
  deps.events.on("session:revoked", (sessionId) => io.in(`session:${sessionId}`).disconnectSockets(true));

  app.addHook("onClose", async () => {
    io.close();
  });

  return realtime;
}
