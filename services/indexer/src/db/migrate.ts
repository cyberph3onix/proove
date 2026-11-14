import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withTransaction, type Pool } from "./pool";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

/**
 * Apply `migrations/NNNN_name.sql` files in filename order, each in its own
 * transaction, recording applied names in `schema_migrations`. Migrations are
 * forward-only; never edit one that has shipped, add a new file instead.
 */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    });
    applied.push(file);
  }
  return applied;
}
