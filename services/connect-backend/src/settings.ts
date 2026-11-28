import { z } from "zod";
import type { Db } from "./db/client.js";
import { appSettings } from "./db/schema.js";

const MB = 1024 * 1024;
const GB = 1024 * MB;
/** Supabase Free rejects any single object above 50 MB, whatever the settings say. */
export const HARD_MAX_FILE_BYTES = 50 * MB;

const bytes = (max: number) => z.number().int().min(0).max(max);

export const settingsSchema = z.object({
  registrationEnabled: z.boolean(),
  requireApproval: z.boolean(),
  maintenanceMode: z.boolean(),
  /* Phase 4: per-kind upload limits and storage quotas sized for Supabase Free (1 GB storage, 5 GB egress). */
  maxImageBytes: bytes(HARD_MAX_FILE_BYTES),
  maxDocumentBytes: bytes(HARD_MAX_FILE_BYTES),
  maxAudioBytes: bytes(HARD_MAX_FILE_BYTES),
  maxVideoBytes: bytes(HARD_MAX_FILE_BYTES),
  maxArchiveBytes: bytes(HARD_MAX_FILE_BYTES),
  storageTotalBytes: bytes(100 * GB),
  storagePerUserBytes: bytes(100 * GB),
  egressMonthlyBytes: bytes(1000 * GB),
  uploadsEnabled: z.boolean(),
  /* Phase 5: LiveKit Cloud Build plan is 5,000 participant-minutes a month. */
  meetingsEnabled: z.boolean(),
  meetingMinutesMonthly: z.number().int().min(0).max(1_000_000),
  maxMeetingParticipants: z.number().int().min(2).max(10),
  membersCanCreateMeetings: z.boolean(),
  /* Phase 6 */
  musicRequestsEnabled: z.boolean(),
  followHostMode: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  registrationEnabled: true,
  requireApproval: true,
  maintenanceMode: false,
  maxImageBytes: 10 * MB,
  maxDocumentBytes: 25 * MB,
  maxAudioBytes: 25 * MB,
  maxVideoBytes: 50 * MB,
  maxArchiveBytes: 25 * MB,
  storageTotalBytes: 900 * MB,
  storagePerUserBytes: 150 * MB,
  egressMonthlyBytes: 4 * GB,
  uploadsEnabled: true,
  meetingsEnabled: true,
  meetingMinutesMonthly: 4500,
  maxMeetingParticipants: 10,
  membersCanCreateMeetings: true,
  musicRequestsEnabled: true,
  followHostMode: false,
};

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...stored });
}

export async function updateSettings(db: Db, patch: Partial<Settings>) {
  for (const [key, value] of Object.entries(patch)) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }
  return getSettings(db);
}
