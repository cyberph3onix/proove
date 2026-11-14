// Snapshot every program account (getProgramAccounts) into Postgres.
// Usage: pnpm --filter @proove/indexer backfill
import { migrate } from "../db/migrate";
import { createPool } from "../db/pool";
import { loadEnv } from "../env";
import { backfillAll } from "../ingest";
import { buildPrograms } from "../programs";
import { RpcChainSource } from "../rpc/source";

const env = loadEnv();
const pool = createPool(env.databaseUrl);
try {
  await migrate(pool);
  const result = await backfillAll({
    pool,
    source: new RpcChainSource(env.cluster.rpcUrl),
    programs: buildPrograms(env.cluster.programIds),
    programIds: env.cluster.programIds,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
