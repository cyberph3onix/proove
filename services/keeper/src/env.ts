import { homedir } from "node:os";
import { resolve } from "node:path";
import { getClusterConfig, isCluster, type ClusterConfig } from "@proove/config";
import type { Commitment } from "@solana/web3.js";
import type { Level } from "./log";

export interface KeeperEnv {
  cluster: ClusterConfig;
  keypairPath: string;
  intervalSec: number;
  once: boolean;
  dryRun: boolean;
  maxAttempts: number;
  backoffMs: number;
  priorityFeeMicroLamports: number;
  commitment: Commitment;
  logLevel: Level;
}

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

function positive(name: string, raw: string | undefined, fallback: number, allowZero = false): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(`${name} must be a ${allowZero ? "non-negative" : "positive"} number, got "${raw}"`);
  return n;
}

const truthy = (v: string | undefined) => v === "1" || v === "true" || v === "yes";

export function loadEnv(env: NodeJS.ProcessEnv = process.env, argv: readonly string[] = process.argv.slice(2)): KeeperEnv {
  const clusterName = isCluster(env.SOLANA_CLUSTER) ? env.SOLANA_CLUSTER : "devnet";
  const level = env.LOG_LEVEL;
  const commitment = env.KEEPER_COMMITMENT;
  return {
    cluster: getClusterConfig(clusterName, env.RPC_URL ? { rpcUrl: env.RPC_URL } : {}),
    keypairPath: expandHome(env.KEEPER_KEYPAIR ?? "~/.config/solana/id.json"),
    intervalSec: positive("KEEPER_INTERVAL_SEC", env.KEEPER_INTERVAL_SEC, 300),
    once: argv.includes("--once"),
    dryRun: argv.includes("--dry-run") || truthy(env.KEEPER_DRY_RUN),
    maxAttempts: Math.floor(positive("KEEPER_MAX_ATTEMPTS", env.KEEPER_MAX_ATTEMPTS, 4)),
    backoffMs: positive("KEEPER_BACKOFF_MS", env.KEEPER_BACKOFF_MS, 1000, true),
    priorityFeeMicroLamports: Math.floor(positive("KEEPER_PRIORITY_FEE", env.KEEPER_PRIORITY_FEE, 0, true)),
    commitment: commitment === "processed" || commitment === "finalized" ? commitment : "confirmed",
    logLevel: level === "debug" || level === "warn" || level === "error" ? level : "info",
  };
}
