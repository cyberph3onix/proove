import { getClusterConfig, isCluster, type ClusterConfig } from "@proove/config";

export interface IndexerEnv {
  databaseUrl: string;
  cluster: ClusterConfig;
  host: string;
  port: number;
  /** Poll interval for `getSignaturesForAddress`, ms. */
  pollIntervalMs: number;
  /** Upper bound on signatures fetched per program per poll (first run included). */
  maxSignaturesPerPoll: number;
  /** "all" = API + poller, "api" = API only, "ingest" = poller only. */
  mode: "all" | "api" | "ingest";
}

export const DEFAULT_DATABASE_URL = "postgres://proove:proove@localhost:5433/proove_indexer";

export function loadEnv(env: NodeJS.ProcessEnv = process.env): IndexerEnv {
  const clusterName = isCluster(env.SOLANA_CLUSTER) ? env.SOLANA_CLUSTER : "devnet";
  const mode = env.INDEXER_MODE === "api" || env.INDEXER_MODE === "ingest" ? env.INDEXER_MODE : "all";
  return {
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    cluster: getClusterConfig(clusterName, env.RPC_URL ? { rpcUrl: env.RPC_URL } : {}),
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 4100),
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 10_000),
    maxSignaturesPerPoll: Number(env.MAX_SIGNATURES_PER_POLL ?? 1000),
    mode,
  };
}
