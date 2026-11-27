import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { sharedState } from "../db/schema.js";
import { ChatError } from "../chat/service.js";

/*
 * Server-authoritative shared state. Each key has a version; a write names the version it was based
 * on and fails with 409 (returning the current state) if someone else wrote first. Clients then
 * re-apply their intent to the fresh state. Only workspace-wide, non-confidential data lives here.
 */

export const loungeStateSchema = z.object({
  requestId: z.uuid().nullable(),
  fileId: z.uuid().nullable(),
  title: z.string().max(200).default(""),
  status: z.enum(["stopped", "playing", "paused"]),
  /** Server epoch ms at which playback position 0 would have played (valid while playing). */
  anchorMs: z.number().nullable(),
  /** Position while paused. */
  positionMs: z.number().min(0),
  repeat: z.boolean(),
  shuffle: z.boolean(),
  controllerId: z.uuid().nullable(),
  /** Reported by the first client that loads the track; lets listeners advance at the end. */
  durationMs: z.number().min(0).nullable().default(null),
  history: z.array(z.uuid()).max(20),
});
export type LoungeState = z.infer<typeof loungeStateSchema>;

export const presentationStateSchema = z.object({
  active: z.boolean(),
  fileId: z.uuid().nullable(),
  kind: z.enum(["pdf", "video", "image", "audio", "whiteboard"]).nullable(),
  title: z.string().max(200).default(""),
  page: z.number().int().min(1),
  status: z.enum(["playing", "paused"]),
  anchorMs: z.number().nullable(),
  positionMs: z.number().min(0),
  presenterId: z.uuid().nullable(),
});
export type PresentationState = z.infer<typeof presentationStateSchema>;

export const followStateSchema = z.object({
  enabled: z.boolean(),
  panel: z.enum(["dashboard", "chat", "files", "meetings", "lounge", "presentation"]),
  hostId: z.uuid().nullable(),
});
export type FollowState = z.infer<typeof followStateSchema>;

export const strokeSchema = z.object({
  id: z.string().min(8).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  width: z.number().min(1).max(24),
  points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(1).max(400),
});
export const whiteboardStateSchema = z.object({
  strokes: z.array(strokeSchema.extend({ userId: z.uuid() })).max(2000),
});

export const STATE_SCHEMAS = {
  lounge: loungeStateSchema,
  presentation: presentationStateSchema,
  follow: followStateSchema,
  whiteboard: whiteboardStateSchema,
} as const;
export type StateKey = keyof typeof STATE_SCHEMAS;
export type StateOf<K extends StateKey> = z.infer<(typeof STATE_SCHEMAS)[K]>;

export const DEFAULT_STATE: { [K in StateKey]: StateOf<K> } = {
  lounge: { requestId: null, fileId: null, title: "", status: "stopped", anchorMs: null, positionMs: 0, repeat: false, shuffle: false, controllerId: null, durationMs: null, history: [] },
  presentation: { active: false, fileId: null, kind: null, title: "", page: 1, status: "paused", anchorMs: null, positionMs: 0, presenterId: null },
  follow: { enabled: false, panel: "dashboard", hostId: null },
  whiteboard: { strokes: [] },
};

export type Versioned<K extends StateKey> = { key: K; version: number; state: StateOf<K>; updatedAt: Date | null };

export async function readState<K extends StateKey>(db: Db, key: K): Promise<Versioned<K>> {
  const [row] = await db.select().from(sharedState).where(eq(sharedState.key, key)).limit(1);
  if (!row) return { key, version: 0, state: DEFAULT_STATE[key], updatedAt: null };
  return { key, version: row.version, state: STATE_SCHEMAS[key].parse(row.state) as StateOf<K>, updatedAt: row.updatedAt };
}

export class VersionConflict extends ChatError {
  constructor(public current: Versioned<StateKey>) {
    super("version_conflict", 409);
  }
}

/** Compare-and-set. `expected` undefined means "whatever is current" (server-internal writes). */
export async function writeState<K extends StateKey>(
  db: Db,
  key: K,
  update: (current: StateOf<K>) => StateOf<K>,
  opts: { by: string; expected?: number; now: Date }
): Promise<Versioned<K>> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await readState(db, key);
    if (opts.expected !== undefined && opts.expected !== cur.version) throw new VersionConflict(cur);
    const next = STATE_SCHEMAS[key].parse(update(cur.state)) as StateOf<K>;
    if (cur.version === 0) {
      const inserted = await db
        .insert(sharedState)
        .values({ key, version: 1, state: next, updatedBy: opts.by, updatedAt: opts.now })
        .onConflictDoNothing()
        .returning();
      if (inserted.length) return { key, version: 1, state: next, updatedAt: opts.now };
    } else {
      const updated = await db
        .update(sharedState)
        .set({ version: cur.version + 1, state: next, updatedBy: opts.by, updatedAt: opts.now })
        .where(and(eq(sharedState.key, key), eq(sharedState.version, cur.version)))
        .returning();
      if (updated.length) return { key, version: cur.version + 1, state: next, updatedAt: opts.now };
    }
    if (opts.expected !== undefined) throw new VersionConflict(await readState(db, key));
  }
  throw new ChatError("busy", 503);
}
