// One-time protocol setup after the programs are deployed. Idempotent: each
// step checks on-chain state first, so rerunning is safe.
//
//   pnpm --filter @proove/deploy run setup --cluster localnet|devnet
//
// 1. USDC mint: devnet uses Circle's devnet USDC; localnet creates a 6-decimal
//    test mint owned by the deployer (so e2e runs can mint test funds).
// 2. Treasury: the deployer's USDC associated token account receives
//    protocol fees until Phase 2 moves the treasury to the DAO.
// 3. escrow.init_protocol_config with the PRD defaults (first caller becomes
//    admin, which is why this runs straight after deployment).
// 4. achievement.init_collection (the Metaplex Core badge collection).
// Writes deployments/<cluster>.json with every address.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { DEVNET_USDC_MINT, getClusterConfig, isCluster } from "@proove/config";
import { achievementIdl, escrowIdl, type Achievement, type Escrow } from "@proove/idl";

const HOUR = 3_600;
const DAY = 86_400;
const USDC = 1_000_000;

/** PRD defaults; ranges are enforced by the program. */
export const DEFAULT_SETTINGS = {
  partialTimeout: 72 * HOUR,
  fullTimeout: 7 * DAY,
  partialBps: 2_000,
  feeBps: 0,
  minMilestone: 5 * USDC,
  noDeliveryGrace: 3 * DAY,
};


const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function loadKeypair(path: string): Keypair {
  const p = path.replace(/^~/, homedir());
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

async function main() {
  const cluster = arg("cluster", "localnet");
  if (!isCluster(cluster)) throw new Error(`unknown cluster ${cluster}`);
  const cfg = getClusterConfig(cluster, process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {});
  const deployer = loadKeypair(arg("keypair", process.env.DEPLOYER_KEYPAIR ?? "~/.config/solana/id.json")!);
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(deployer), { commitment: "confirmed" });
  const escrow = new Program<Escrow>(escrowIdl as Escrow, provider);
  const achievement = new Program<Achievement>(achievementIdl as Achievement, provider);
  const log = (step: string, detail: string) => console.log(`[${cluster}] ${step}: ${detail}`);

  log("deployer", `${deployer.publicKey.toBase58()} (${(await connection.getBalance(deployer.publicKey)) / 1e9} SOL)`);

  const outPath = resolve(repoRoot, "deployments", `${cluster}.json`);
  let previous: Record<string, string> = {};
  try {
    previous = JSON.parse(readFileSync(outPath, "utf8"));
  } catch {}

  // 1. USDC mint
  let mint: PublicKey;
  if (cluster === "localnet") {
    const existing = previous.usdcMint ? await connection.getAccountInfo(new PublicKey(previous.usdcMint)) : null;
    mint = existing ? new PublicKey(previous.usdcMint) : await createMint(connection, deployer, deployer.publicKey, null, 6);
    log("usdc mint", `${mint.toBase58()}${existing ? " (existing)" : " (created test mint)"}`);
  } else {
    mint = new PublicKey(cluster === "devnet" ? DEVNET_USDC_MINT : cfg.usdcMint);
    log("usdc mint", mint.toBase58());
  }

  // 2. Treasury token account
  const treasury = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, deployer.publicKey);
  log("treasury", treasury.address.toBase58());

  // 3. Protocol config
  const [protocolConfig] = PublicKey.findProgramAddressSync([Buffer.from("protocol_config")], escrow.programId);
  if (await connection.getAccountInfo(protocolConfig)) {
    const c = await escrow.account.protocolConfig.fetch(protocolConfig);
    log("protocol config", `exists, admin ${c.admin.toBase58()}, fee ${c.feeBps} bps`);
  } else {
    const s = DEFAULT_SETTINGS;
    const sig = await escrow.methods
      .initProtocolConfig({
        partialTimeout: new BN(s.partialTimeout),
        fullTimeout: new BN(s.fullTimeout),
        partialBps: s.partialBps,
        feeBps: s.feeBps,
        minMilestone: new BN(s.minMilestone),
        noDeliveryGrace: new BN(s.noDeliveryGrace),
      })
      .accounts({ admin: deployer.publicKey, treasury: treasury.address })
      .rpc();
    log("protocol config", `initialized (${sig})`);
  }

  // 4. Achievement collection
  const [achievementConfig] = PublicKey.findProgramAddressSync([Buffer.from("config")], achievement.programId);
  let collection: PublicKey;
  if (await connection.getAccountInfo(achievementConfig)) {
    collection = (await achievement.account.achievementConfig.fetch(achievementConfig)).collection;
    log("badge collection", `exists ${collection.toBase58()}`);
  } else {
    const collectionKp = Keypair.generate();
    const sig = await achievement.methods
      .initCollection("Proove Achievements", "", "")
      .accounts({ admin: deployer.publicKey, collection: collectionKp.publicKey })
      .signers([collectionKp])
      .rpc();
    collection = collectionKp.publicKey;
    log("badge collection", `created ${collection.toBase58()} (${sig})`);
  }

  const out = {
    cluster,
    rpcUrl: cfg.rpcUrl,
    programIds: cfg.programIds,
    usdcMint: mint.toBase58(),
    treasury: treasury.address.toBase58(),
    protocolConfig: protocolConfig.toBase58(),
    protocolAdmin: deployer.publicKey.toBase58(),
    achievementConfig: achievementConfig.toBase58(),
    badgeCollection: collection.toBase58(),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  log("wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
