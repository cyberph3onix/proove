import { migrate } from "../db/migrate";
import { createPool } from "../db/pool";
import { loadEnv } from "../env";

const pool = createPool(loadEnv().databaseUrl);
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "schema up to date");
} finally {
  await pool.end();
}
