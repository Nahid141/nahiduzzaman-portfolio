import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireAdmin, requireUser } from "../auth/session.js";
import { roomOf } from "../chat/service.js";
import { audit } from "../lib/services.js";
import { getUsage } from "../lib/usage.js";
import type { Realtime } from "../realtime/gateway.js";
import { getSettings } from "../settings.js";
import { activity } from "../db/schema.js";
import {
  completeUpload,
  deleteFile,
  downloadUrl,
  getFile,
  listFiles,
  listQuery,
  requestUpload,
  storageSummary,
  storageUsed,
  uploadSchema,
  type FileDeps,
} from "./service.js";

const idParam = z.object({ id: z.uuid() });

export async function fileRoutes(app: FastifyInstance, deps: AppDeps, rt: Realtime) {
  const fd: FileDeps = { db: deps.db, files: deps.files ?? null, scanner: deps.scanner, now: deps.now };
  const guard = { preHandler: requireUser(deps) };
  const me = (r: { auth?: { user: { id: string; role: "admin" | "member" } } }) => r.auth!.user;

  // Uploads are expensive for the free tier, so they get their own per-user limit.
  const uploadLimited = async (userId: string) => {
    const n = await deps.rateLimit.hit(`upload:${userId}`, 3600_000, deps.now().getTime());
    return n <= 60;
  };

  app.post("/api/v1/files/uploads", guard, async (request, reply) => {
    if (!(await uploadLimited(me(request).id))) return reply.code(429).send({ error: "rate_limited" });
    const res = await requestUpload(fd, me(request), uploadSchema.parse(request.body));
    return reply.code(201).send(res);
  });

  app.post("/api/v1/files/:id/complete", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const file = await completeUpload(fd, me(request), id);
    rt.emit(roomOf(file.target), "file:new", file);
    if (file.target.kind === "channel") {
      await deps.db.insert(activity).values({ actorId: me(request).id, kind: "file.shared", payload: { fileId: file.id, name: file.name, channelId: file.target.id } });
      rt.emit("admins", "activity:new", { kind: "file.shared" });
    }
    return file;
  });

  app.get("/api/v1/files", guard, async (request) => listFiles(fd, me(request), listQuery.parse(request.query)));

  app.get("/api/v1/files/:id", guard, async (request) => getFile(fd, me(request), idParam.parse(request.params).id));

  app.post("/api/v1/files/:id/url", guard, async (request, reply) => {
    const { id } = idParam.parse(request.params);
    const { inline } = z.object({ inline: z.boolean().default(false) }).parse(request.body ?? {});
    const n = await deps.rateLimit.hit(`download:${me(request).id}`, 60_000, deps.now().getTime());
    if (n > 60) return reply.code(429).send({ error: "rate_limited" });
    return downloadUrl(fd, me(request), id, { inline });
  });

  app.delete("/api/v1/files/:id", guard, async (request) => {
    const { id } = idParam.parse(request.params);
    const { file, moderated } = await deleteFile(fd, me(request), id);
    if (moderated) {
      await audit(deps.db, { actorId: me(request).id, action: "file.moderated", targetType: "file", targetId: id, metadata: { kind: file.kind } });
    }
    rt.emit(roomOf(file.target), "file:deleted", { id });
    return { ok: true };
  });

  /** Quota status shown in the Files page and the admin console. */
  app.get("/api/v1/files/usage", guard, async (request) => {
    const s = await getSettings(deps.db);
    const summary = await storageSummary(deps.db);
    const mineBytes = await storageUsed(deps.db, me(request).id);
    return {
      storageConfigured: Boolean(deps.files),
      uploadsEnabled: s.uploadsEnabled,
      limits: {
        image: s.maxImageBytes,
        document: s.maxDocumentBytes,
        audio: s.maxAudioBytes,
        video: s.maxVideoBytes,
        archive: s.maxArchiveBytes,
      },
      storage: { usedBytes: summary.readyBytes + summary.pendingBytes, capBytes: s.storageTotalBytes },
      mine: { usedBytes: mineBytes, capBytes: s.storagePerUserBytes },
      egress: { usedBytes: await getUsage(deps.db, "egress_bytes", deps.now()), capBytes: s.egressMonthlyBytes },
    };
  });

  app.get("/api/v1/admin/files/summary", { preHandler: requireAdmin(deps) }, async () => storageSummary(deps.db));
}
