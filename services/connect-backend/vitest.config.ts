import { defineConfig } from "vitest/config";

// Against a real PostgreSQL (TEST_DATABASE_URL) the files share one database, so they run one at a time.
const realDb = Boolean(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: { testTimeout: realDb ? 120000 : 30000, hookTimeout: realDb ? 180000 : 60000, pool: "forks", fileParallelism: !realDb },
});
