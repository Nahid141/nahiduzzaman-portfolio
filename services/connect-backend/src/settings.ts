import { z } from "zod";
import type { Db } from "./db/client.js";
import { appSettings } from "./db/schema.js";

export const settingsSchema = z.object({
  registrationEnabled: z.boolean(),
  requireApproval: z.boolean(),
  maintenanceMode: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = { registrationEnabled: true, requireApproval: true, maintenanceMode: false };

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
