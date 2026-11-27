import { EventEmitter } from "node:events";
import type { Redis } from "ioredis";
import type { RateLimitStore } from "./services.js";

/* Presence: how many live sockets each user has. Redis in production, memory in tests. */
export interface PresenceStore {
  /** Returns the user's connection count after the change. */
  connect(userId: string): Promise<number>;
  disconnect(userId: string): Promise<number>;
  online(): Promise<string[]>;
}

export class MemoryPresenceStore implements PresenceStore {
  private counts = new Map<string, number>();
  async connect(userId: string) {
    const n = (this.counts.get(userId) ?? 0) + 1;
    this.counts.set(userId, n);
    return n;
  }
  async disconnect(userId: string) {
    const n = Math.max((this.counts.get(userId) ?? 1) - 1, 0);
    if (n === 0) this.counts.delete(userId);
    else this.counts.set(userId, n);
    return n;
  }
  async online() {
    return [...this.counts.keys()];
  }
}

const PRESENCE_KEY = "connect:presence";

export class RedisPresenceStore implements PresenceStore {
  constructor(private redis: Redis) {}
  async connect(userId: string) {
    return this.redis.hincrby(PRESENCE_KEY, userId, 1);
  }
  async disconnect(userId: string) {
    const n = await this.redis.hincrby(PRESENCE_KEY, userId, -1);
    if (n <= 0) await this.redis.hdel(PRESENCE_KEY, userId);
    return Math.max(n, 0);
  }
  async online() {
    return Object.keys(await this.redis.hgetall(PRESENCE_KEY));
  }
}

/** Fixed-window counter shared by every backend instance. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: Redis) {}
  async hit(key: string, windowMs: number) {
    const k = `connect:rl:${key}`;
    const n = await this.redis.incr(k);
    if (n === 1) await this.redis.pexpire(k, windowMs);
    return n;
  }
  async reset(key: string) {
    await this.redis.del(`connect:rl:${key}`);
  }
}

/** In-process signals from HTTP handlers to the socket gateway. */
export type AppEvents = EventEmitter<{
  "user:revoked": [userId: string];
  "session:revoked": [sessionId: string];
}>;

export const createEvents = (): AppEvents => new EventEmitter() as AppEvents;
