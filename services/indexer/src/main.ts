import { buildApi } from "./api/server";
import { migrate } from "./db/migrate";
import { createPool } from "./db/pool";
import { loadEnv } from "./env";
import { pollAll, type Indexer } from "./ingest";
import { buildPrograms } from "./programs";
import { RpcChainSource } from "./rpc/source";

const env = loadEnv();
const pool = createPool(env.databaseUrl);
await migrate(pool);

const app = buildApi({ pool, programIds: env.cluster.programIds, logger: true });
const log = (msg: string, extra: Record<string, unknown> = {}) => app.log.info(extra, msg);

let stopped = false;
let timer: NodeJS.Timeout | undefined;

if (env.mode !== "ingest") {
  await app.listen({ host: env.host, port: env.port });
}

if (env.mode !== "api") {
  const ix: Indexer = {
    pool,
    source: new RpcChainSource(env.cluster.rpcUrl),
    programs: buildPrograms(env.cluster.programIds),
    programIds: env.cluster.programIds,
    log,
  };
  log("polling", { cluster: env.cluster.cluster, rpc: env.cluster.rpcUrl, intervalMs: env.pollIntervalMs });
  const tick = async () => {
    try {
      const result = await pollAll(ix, env.maxSignaturesPerPoll);
      const busy = Object.values(result).some((r) => r.signatures > 0);
      if (busy) log("poll", result);
    } catch (err) {
      app.log.error(err, "poll failed");
    }
    if (!stopped) timer = setTimeout(tick, env.pollIntervalMs);
  };
  void tick();
}

async function shutdown() {
  stopped = true;
  clearTimeout(timer);
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
