// Cluster-level settings shared by the web app and the services.
// Program IDs come from target/deploy/*-keypair.json (kept out of git).

export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export interface ProgramIds {
  gig: string;
  escrow: string;
  reputation: string;
  achievement: string;
}

export interface ClusterConfig {
  cluster: Cluster;
  rpcUrl: string;
  wsUrl: string;
  programIds: ProgramIds;
  usdcMint: string;
}

/** Same IDs on every cluster: programs are deployed from the same keypairs. */
export const PROGRAM_IDS: ProgramIds = {
  gig: "85SttowTEpVzdLhqsVy9YKVBX2DhuwnDicpNqaG38P37",
  escrow: "ekeLPKaiGHb1vSVnCB7BjUeE4EZg5FyVCogMeTu5KQP",
  reputation: "5Tm5aXm3NRzX6fJL3R7NeRbjhZjxTUfJ4nTLurPxdPc6",
  achievement: "ACMSSsuJaZ23xezUbkqjCNBhXCcUGEqfNe2cTZBogkRo",
};

/** Circle's devnet USDC (PRD open question; Umbra's test mint is the alternative). */
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEFAULTS: Record<Cluster, Omit<ClusterConfig, "cluster" | "programIds">> = {
  localnet: { rpcUrl: "http://127.0.0.1:8899", wsUrl: "ws://127.0.0.1:8900", usdcMint: DEVNET_USDC_MINT },
  devnet: { rpcUrl: "https://api.devnet.solana.com", wsUrl: "wss://api.devnet.solana.com", usdcMint: DEVNET_USDC_MINT },
  "mainnet-beta": {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    wsUrl: "wss://api.mainnet-beta.solana.com",
    usdcMint: MAINNET_USDC_MINT,
  },
};

export function isCluster(value: string | undefined): value is Cluster {
  return value === "localnet" || value === "devnet" || value === "mainnet-beta";
}

/**
 * Resolve config for a cluster; `overrides` lets callers pass env values
 * (e.g. a Helius RPC URL) without this package reading `process.env` itself.
 */
export function getClusterConfig(
  cluster: Cluster = "devnet",
  overrides: Partial<Omit<ClusterConfig, "cluster">> = {},
): ClusterConfig {
  return {
    cluster,
    ...DEFAULTS[cluster],
    programIds: PROGRAM_IDS,
    ...overrides,
  };
}
