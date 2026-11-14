import pg from "pg";
import { migrate } from "../src/db/migrate";
import { createPool, type Pool } from "../src/db/pool";
import { DEFAULT_DATABASE_URL } from "../src/env";

/**
 * Fresh schema in the docker Postgres (infrastructure/docker-compose.yml),
 * or null when it is not reachable so DB suites can skip.
 */
export async function setupTestDb(): Promise<{ pool: Pool; teardown: () => Promise<void> } | null> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const probe = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await probe.connect();
  } catch {
    return null;
  }
  const schema = `test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await probe.query(`CREATE SCHEMA ${schema}`);
  await probe.end();
  const pool = createPool(url, { options: `-c search_path=${schema}` });
  await migrate(pool);
  return {
    pool,
    teardown: async () => {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    },
  };
}

export const dbAvailable = await (async () => {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1500 });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    console.warn(
      `[indexer tests] Postgres not reachable at ${url}; skipping DB/API tests. Start it with: docker compose -f infrastructure/docker-compose.yml up -d`,
    );
    return false;
  }
})();
