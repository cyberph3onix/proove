import { getClusterConfig, isCluster, type Cluster, type ClusterConfig } from "@proove/config";

/** Where the UI reads and writes: the local mock chain, or real programs. */
export type DataMode = "mock" | "chain";

export const DATA_MODE: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === "chain" ? "chain" : "mock";
export const isChainMode = DATA_MODE === "chain";

const clusterEnv = process.env.NEXT_PUBLIC_CLUSTER;
export const CLUSTER: Cluster = isCluster(clusterEnv) ? clusterEnv : "devnet";

export const clusterConfig: ClusterConfig = getClusterConfig(CLUSTER, {
  ...(process.env.NEXT_PUBLIC_RPC_URL ? { rpcUrl: process.env.NEXT_PUBLIC_RPC_URL } : {}),
  ...(process.env.NEXT_PUBLIC_WS_URL ? { wsUrl: process.env.NEXT_PUBLIC_WS_URL } : {}),
});

export const RPC_URL = clusterConfig.rpcUrl;
export const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT ?? clusterConfig.usdcMint;
export const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL ?? "http://127.0.0.1:4100").replace(/\/$/, "");
export const AI_URL = process.env.NEXT_PUBLIC_AI_URL?.replace(/\/$/, "") ?? "";

export const ROLE_STORAGE_KEY = "proove-role";

export function storedRole(): "client" | "freelancer" {
  if (typeof window === "undefined") return "client";
  return window.localStorage.getItem(ROLE_STORAGE_KEY) === "freelancer" ? "freelancer" : "client";
}

export function storeRole(role: "client" | "freelancer") {
  if (typeof window !== "undefined") window.localStorage.setItem(ROLE_STORAGE_KEY, role);
}
