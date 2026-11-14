// Protocol-level end-to-end run of the Phase 1 happy path against a live
// cluster where the programs are deployed and `setup` has run:
//
//   brief/spec hash -> create milestone -> accept terms -> fund -> deliver
//   with report -> approve (fee to treasury) -> settle reputation -> rate
//   -> award FirstGig -> claim the soulbound badge
//
//   pnpm --filter @proove/deploy run e2e --cluster localnet
//
// On localnet it creates fresh client/freelancer wallets and mints test USDC.
// It asserts balances and reputation counters along the way and exits non-zero
// on any mismatch, so CI can run it after `localnet.sh` + deploy + setup.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { achievementIdl, escrowIdl, gigIdl, reputationIdl, type Achievement, type Escrow, type Gig, type Reputation } from "@proove/idl";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const sha = (s: string) => Array.from(createHash("sha256").update(s).digest());
const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];
const u64 = (n: number | bigint) => new BN(n.toString()).toArrayLike(Buffer, "le", 8);
const u32 = (n: number) => new BN(n).toArrayLike(Buffer, "le", 4);

function expect(cond: boolean, what: string) {
  if (!cond) throw new Error(`e2e check failed: ${what}`);
  console.log(`  ok  ${what}`);
}

async function main() {
  const cluster = arg("cluster", "localnet")!;
  if (cluster !== "localnet") throw new Error("e2e mints test USDC, so it only runs on localnet");
  const d = JSON.parse(readFileSync(resolve(repoRoot, "deployments", `${cluster}.json`), "utf8"));
  const connection = new Connection(d.rpcUrl, "confirmed");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(resolve(homedir(), ".config/solana/id.json"), "utf8"))),
  );
  const mint = new PublicKey(d.usdcMint);
  const treasury = new PublicKey(d.treasury);
  const collection = new PublicKey(d.badgeCollection);

  const client = Keypair.generate();
  const freelancer = Keypair.generate();
  for (const kp of [client, freelancer]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }
  const programs = (kp: Keypair) => {
    const provider = new AnchorProvider(connection, new Wallet(kp), { commitment: "confirmed" });
    return {
      gig: new Program<Gig>(gigIdl as Gig, provider),
      escrow: new Program<Escrow>(escrowIdl as Escrow, provider),
      reputation: new Program<Reputation>(reputationIdl as Reputation, provider),
      achievement: new Program<Achievement>(achievementIdl as Achievement, provider),
    };
  };
  const C = programs(client);
  const F = programs(freelancer);

  const AMOUNT = 50_000_000; // 50 USDC
  const clientUsdc = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, client.publicKey);
  const freelancerUsdc = await getOrCreateAssociatedTokenAccount(connection, deployer, mint, freelancer.publicKey);
  await mintTo(connection, deployer, mint, clientUsdc.address, deployer, AMOUNT);

  const feeBps = (await C.escrow.account.protocolConfig.fetch(new PublicKey(d.protocolConfig))).feeBps;
  const treasuryBefore = (await getAccount(connection, treasury)).amount;

  console.log("1. gig: create, publish, assign");
  const id = BigInt(Date.now());
  const now = Math.floor(Date.now() / 1000);
  const gig = pda([Buffer.from("gig"), client.publicKey.toBuffer(), u64(id)], C.gig.programId);
  await C.gig.methods
    .initializeGig(new BN(id.toString()), "E2E logo design", "Three logo concepts in SVG", "Design", new BN(AMOUNT), new BN(now + 14 * 86_400))
    .accountsPartial({ client: client.publicKey, mint })
    .rpc();
  await C.gig.methods.publishGig().accountsPartial({ client: client.publicKey, gig }).rpc();
  await C.gig.methods.assignFreelancer().accountsPartial({ client: client.publicKey, freelancer: freelancer.publicKey, gig }).rpc();

  console.log("2. milestone with committed spec, freelancer accepts terms");
  const specHash = sha(JSON.stringify({ schema: "proove.milestone-spec.v1", gig: gig.toBase58(), index: 0 }));
  const vault = pda([Buffer.from("vault"), gig.toBuffer()], C.escrow.programId);
  const milestone = pda([Buffer.from("milestone"), gig.toBuffer(), u32(0)], C.escrow.programId);
  await C.escrow.methods.createMilestone(new BN(AMOUNT), specHash).accountsPartial({ client: client.publicKey, gig, milestone }).rpc();
  await F.escrow.methods.acceptTerms(specHash).accountsPartial({ freelancer: freelancer.publicKey, gig, milestone }).rpc();

  console.log("3. fund");
  await C.escrow.methods
    .fundMilestone()
    .accountsPartial({ client: client.publicKey, gig, milestone, clientTokenAccount: clientUsdc.address, mint })
    .rpc();
  const vaultToken = pda([Buffer.from("vault"), gig.toBuffer(), Buffer.from("token")], C.escrow.programId);
  expect((await getAccount(connection, vaultToken)).amount === BigInt(AMOUNT), "vault holds the milestone amount");

  console.log("4. deliver with manifest + report hashes");
  const deliveryHash = sha("manifest:e2e");
  const reportHash = sha("report:e2e");
  await F.escrow.methods.submitDelivery(deliveryHash, reportHash).accountsPartial({ freelancer: freelancer.publicKey, gig, milestone }).rpc();
  const m = await C.escrow.account.milestone.fetch(milestone);
  expect(Buffer.from(m.deliveryHash).equals(Buffer.from(deliveryHash)), "delivery hash recorded");
  expect(Number(m.submittedSlot) > 0, "submitted slot recorded");

  console.log("5. approve: net to freelancer, fee to treasury");
  await C.escrow.methods
    .approveMilestone()
    .accountsPartial({
      client: client.publicKey,
      gig,
      milestone,
      vaultTokenAccount: vaultToken,
      freelancer: freelancer.publicKey,
      freelancerTokenAccount: freelancerUsdc.address,
      mint,
      treasuryTokenAccount: treasury,
    })
    .rpc();
  const fee = Math.floor((AMOUNT * feeBps) / 10_000);
  expect((await getAccount(connection, freelancerUsdc.address)).amount === BigInt(AMOUNT - fee), `freelancer received ${AMOUNT - fee}`);
  expect((await getAccount(connection, treasury)).amount - treasuryBefore === BigInt(fee), `treasury received fee ${fee}`);
  expect(Object.keys((await C.gig.account.gig.fetch(gig)).status)[0] === "completed", "gig completed");

  console.log("6. settle reputation, rate");
  const profile = pda([Buffer.from("profile"), freelancer.publicKey.toBuffer()], C.reputation.programId);
  await F.reputation.methods.initializeProfile().accountsPartial({ authority: freelancer.publicKey }).rpc();
  await C.escrow.methods.settleReputation().accountsPartial({ gig, freelancerProfile: profile }).rpc();
  const rating = pda([Buffer.from("rating"), client.publicKey.toBuffer(), u64(id)], C.reputation.programId);
  await C.escrow.methods
    .rateFreelancer(5, sha("Great work"))
    .accountsPartial({ client: client.publicKey, gig, freelancer: freelancer.publicKey, rating })
    .rpc();
  const p = await C.reputation.account.userProfile.fetch(profile);
  expect(Number(p.completedJobs) === 1 && Number(p.successfulJobs) === 1, "one successful job");
  expect(Number(p.onTimeJobs) === 1, "delivered on time");
  expect(Number(p.ratingCount) === 1 && p.averageRating === 500, "rated 5.0");

  console.log("7. award FirstGig and claim the soulbound badge");
  const badge = pda([Buffer.from("badge"), freelancer.publicKey.toBuffer(), Buffer.from([0])], C.reputation.programId);
  await F.reputation.methods.awardBadge({ firstGig: {} }, "").accountsPartial({ payer: freelancer.publicKey, profile, badge }).rpc();
  const asset = Keypair.generate();
  const achievement = pda([Buffer.from("achievement"), freelancer.publicKey.toBuffer(), Buffer.from([0])], C.achievement.programId);
  await F.achievement.methods
    .claimAchievement({ firstGig: {} })
    .accountsPartial({ claimer: freelancer.publicKey, profile, badge, achievement, asset: asset.publicKey, collection })
    .signers([asset])
    .rpc();
  const assetInfo = await connection.getAccountInfo(asset.publicKey);
  expect(!!assetInfo && assetInfo.data.subarray(1, 33).equals(freelancer.publicKey.toBuffer()), "badge NFT owned by the freelancer");

  console.log("\nhappy path passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
