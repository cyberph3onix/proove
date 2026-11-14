/**
 * Chain-mode instruction builders.
 *
 * Each builder returns a plan of transactions to send in order, so callers can
 * keep the same `idle -> signing -> sent -> confirmed -> finalized | failed`
 * lifecycle the mock uses. Account lists mirror the Rust constraints.
 */
import { BN, type AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { AnchorPrograms } from "./client";
import {
  deriveAchievement,
  deriveAchievementConfig,
  deriveBadge,
  deriveEscrowAuthority,
  deriveGig,
  deriveMilestone,
  deriveProfile,
  deriveProtocolConfig,
  deriveRating,
  deriveVault,
  deriveVaultTokenAccount,
  BADGE_TYPE,
} from "./pdas";
import { USDC_MINT } from "@/lib/chain/mode";
import { ZERO_HASH, type MilestoneSpec } from "@proove/types/types";
import { queueMilestone, readPending, takePending } from "@/lib/chain/pending";
import { saveSpec } from "@/lib/chain/specs";
import { saveGigMeta } from "@/lib/chain/meta";

const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

export interface ChainStep {
  tx: Transaction;
  signers?: Keypair[];
  lastValidBlockHeight: number;
}

export interface ChainPlan {
  steps: ChainStep[];
  result?: unknown;
}

// Builders are called from a name-keyed registry, so args are validated per builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChainBuilder = (programs: AnchorPrograms, args: any) => Promise<ChainPlan>;

type Program = AnchorPrograms[keyof AnchorPrograms];

function providerOf(program: Program): AnchorProvider {
  return program.provider as AnchorProvider;
}

async function makeStep(program: Program, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<ChainStep> {
  const provider = providerOf(program);
  const tx = new Transaction().add(...ixs);
  tx.feePayer = provider.wallet.publicKey;
  const latest = await provider.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  return { tx, signers, lastValidBlockHeight: latest.lastValidBlockHeight };
}

/** Anchor unit enums decode as `{ Variant: {} }`; normalise to the variant name. */
function variantName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const key = Object.keys(value as Record<string, unknown>)[0];
    if (key) return key;
  }
  return "";
}

function isStatus(value: unknown, ...names: string[]): boolean {
  const v = variantName(value).toLowerCase();
  return names.some((n) => n.toLowerCase() === v);
}

function hashBytes(hash: string | undefined): number[] {
  if (!hash || hash === ZERO_HASH) return Array.from({ length: 32 }, () => 0);
  try {
    const bytes = Buffer.from(hash, "hex");
    return bytes.length === 32 ? Array.from(bytes) : Array.from({ length: 32 }, () => 0);
  } catch {
    return Array.from({ length: 32 }, () => 0);
  }
}

function usdc(): PublicKey {
  return new PublicKey(USDC_MINT);
}

// ─── Pending milestones ─────────────────────────────────────────────────────

async function nextMilestoneIndex(programs: AnchorPrograms, gig: PublicKey): Promise<number> {
  const vault = await programs.escrow.account.escrowVault.fetchNullable(deriveVault(gig));
  return vault ? Number(vault.milestoneCount) : 0;
}

async function createMilestoneIx(
  programs: AnchorPrograms,
  client: PublicKey,
  gig: PublicKey,
  index: number,
  amount: bigint,
  specHash: string,
): Promise<TransactionInstruction> {
  const milestone = deriveMilestone(gig, index);
  const vault = deriveVault(gig);
  return programs.escrow.methods
    .createMilestone(new BN(amount.toString()), hashBytes(specHash))
    .accountsPartial({
      client,
      gig,
      vault,
      milestone,
      config: deriveProtocolConfig(),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

// ─── Gig program ────────────────────────────────────────────────────────────

export async function createGig(
  programs: AnchorPrograms,
  args: { title: string; description: string; category: string; skills?: string[]; budget: number; deadline: number; brief?: string },
): Promise<ChainPlan> {
  const provider = providerOf(programs.gig);
  const client = provider.wallet.publicKey;
  const id = new BN(Date.now());
  const gig = deriveGig(client, id);
  const initIx = await programs.gig.methods
    .initializeGig(id, args.title, args.description, args.category, new BN(args.budget), new BN(args.deadline))
    .accountsPartial({ client, mint: usdc(), gig, systemProgram: SystemProgram.programId })
    .instruction();
  const publishIx = await programs.gig.methods.publishGig().accountsPartial({ client, gig }).instruction();
  saveGigMeta(gig.toBase58(), { skills: args.skills ?? [], ...(args.brief ? { brief: args.brief } : {}) });
  return { steps: [await makeStep(programs.gig, [initIx, publishIx])], result: gig.toBase58() };
}

export async function publishGig(programs: AnchorPrograms, args: { gig: string }): Promise<ChainPlan> {
  const client = providerOf(programs.gig).wallet.publicKey;
  const gig = new PublicKey(args.gig);
  const ix = await programs.gig.methods.publishGig().accountsPartial({ client, gig }).instruction();
  return { steps: [await makeStep(programs.gig, [ix])] };
}

export async function assignFreelancer(
  programs: AnchorPrograms,
  args: { gig: string; freelancer: string },
): Promise<ChainPlan> {
  const provider = providerOf(programs.gig);
  const client = provider.wallet.publicKey;
  const gig = new PublicKey(args.gig);
  const freelancer = new PublicKey(args.freelancer);
  const assignIx = await programs.gig.methods
    .assignFreelancer()
    .accountsPartial({ client, freelancer, gig })
    .instruction();
  const steps: ChainStep[] = [await makeStep(programs.gig, [assignIx])];

  // Specs committed before assignment become real milestones now.
  const pending = takePending(args.gig);
  for (const item of pending) {
    const ix = await createMilestoneIx(programs, client, gig, item.index, BigInt(item.amount), item.specHash);
    steps.push(await makeStep(programs.escrow, [ix]));
  }

  return { steps };
}

export async function cancelGig(programs: AnchorPrograms, args: { gig: string }): Promise<ChainPlan> {
  const client = providerOf(programs.gig).wallet.publicKey;
  const gig = new PublicKey(args.gig);
  const ix = await programs.gig.methods.cancelGig().accountsPartial({ client, gig }).instruction();
  return { steps: [await makeStep(programs.gig, [ix])] };
}

// ─── Escrow program ─────────────────────────────────────────────────────────

export async function createMilestone(
  programs: AnchorPrograms,
  args: { gig: string; title: string; amount: number; spec?: MilestoneSpec; specHash: string },
): Promise<ChainPlan> {
  const provider = providerOf(programs.escrow);
  saveSpec(args.specHash, { title: args.title, ...(args.spec ? { spec: args.spec } : {}) });
  const client = provider.wallet.publicKey;
  const gig = new PublicKey(args.gig);
  const gigAccount = await programs.gig.account.gig.fetch(gig);

  if (!isStatus(gigAccount.status, "assigned", "inProgress")) {
    const queued = readPending()[args.gig]?.length ?? 0;
    const index = (await nextMilestoneIndex(programs, gig)) + queued;
    queueMilestone(args.gig, { amount: String(args.amount), specHash: args.specHash, index, title: args.title });
    return { steps: [], result: deriveMilestone(gig, index).toBase58() };
  }

  const index = await nextMilestoneIndex(programs, gig);
  const ix = await createMilestoneIx(programs, client, gig, index, BigInt(args.amount), args.specHash);
  return { steps: [await makeStep(programs.escrow, [ix])], result: deriveMilestone(gig, index).toBase58() };
}

export async function acceptTerms(
  programs: AnchorPrograms,
  args: { milestone: string; specHash: string },
): Promise<ChainPlan> {
  const freelancer = providerOf(programs.escrow).wallet.publicKey;
  const milestone = new PublicKey(args.milestone);
  const account = await programs.escrow.account.milestone.fetch(milestone);
  const gig = account.gig as PublicKey;
  const ix = await programs.escrow.methods
    .acceptTerms(hashBytes(args.specHash))
    .accountsPartial({ freelancer, gig, milestone })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function fundMilestone(programs: AnchorPrograms, args: { milestone: string }): Promise<ChainPlan> {
  const provider = providerOf(programs.escrow);
  const client = provider.wallet.publicKey;
  const milestone = new PublicKey(args.milestone);
  const account = await programs.escrow.account.milestone.fetch(milestone);
  const gig = account.gig as PublicKey;
  const gigAccount = await programs.gig.account.gig.fetch(gig);
  const mint = gigAccount.mint as PublicKey;
  const ix = await programs.escrow.methods
    .fundMilestone()
    .accountsPartial({
      client,
      gig,
      milestone,
      vault: deriveVault(gig),
      vaultTokenAccount: deriveVaultTokenAccount(gig),
      clientTokenAccount: getAssociatedTokenAddressSync(mint, client),
      mint,
      config: deriveProtocolConfig(),
      escrowAuthority: deriveEscrowAuthority(),
      gigProgram: programs.gig.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function submitDelivery(
  programs: AnchorPrograms,
  args: { milestone: string; deliveryHash: string; reportHash: string },
): Promise<ChainPlan> {
  const freelancer = providerOf(programs.escrow).wallet.publicKey;
  const milestone = new PublicKey(args.milestone);
  const account = await programs.escrow.account.milestone.fetch(milestone);
  const gig = account.gig as PublicKey;
  const ix = await programs.escrow.methods
    .submitDelivery(hashBytes(args.deliveryHash), hashBytes(args.reportHash))
    .accountsPartial({ freelancer, gig, milestone, vault: deriveVault(gig) })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

async function releaseAccounts(programs: AnchorPrograms, milestone: PublicKey) {
  const account = await programs.escrow.account.milestone.fetch(milestone);
  const gig = account.gig as PublicKey;
  const gigAccount = await programs.gig.account.gig.fetch(gig);
  const mint = gigAccount.mint as PublicKey;
  const config = await programs.escrow.account.protocolConfig.fetch(deriveProtocolConfig());
  return {
    gig,
    mint,
    freelancer: gigAccount.freelancer as PublicKey,
    config,
    vault: deriveVault(gig),
    vaultTokenAccount: deriveVaultTokenAccount(gig),
    treasuryTokenAccount: getAssociatedTokenAddressSync(mint, config.treasury as PublicKey),
    escrowAuthority: deriveEscrowAuthority(),
    gigProgram: programs.gig.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export async function approveMilestone(programs: AnchorPrograms, args: { milestone: string }): Promise<ChainPlan> {
  const client = providerOf(programs.escrow).wallet.publicKey;
  const milestone = new PublicKey(args.milestone);
  const a = await releaseAccounts(programs, milestone);
  const ix = await programs.escrow.methods
    .approveMilestone()
    .accountsPartial({
      client,
      gig: a.gig,
      milestone,
      vault: a.vault,
      vaultTokenAccount: a.vaultTokenAccount,
      freelancer: a.freelancer,
      freelancerTokenAccount: getAssociatedTokenAddressSync(a.mint, a.freelancer),
      mint: a.mint,
      config: deriveProtocolConfig(),
      treasuryTokenAccount: a.treasuryTokenAccount,
      escrowAuthority: a.escrowAuthority,
      gigProgram: a.gigProgram,
      tokenProgram: a.tokenProgram,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function partialTimeoutRelease(programs: AnchorPrograms, args: { milestone: string }): Promise<ChainPlan> {
  const milestone = new PublicKey(args.milestone);
  const a = await releaseAccounts(programs, milestone);
  const ix = await programs.escrow.methods
    .partialTimeoutRelease()
    .accountsPartial({
      gig: a.gig,
      milestone,
      vault: a.vault,
      vaultTokenAccount: a.vaultTokenAccount,
      freelancerTokenAccount: getAssociatedTokenAddressSync(a.mint, a.freelancer),
      mint: a.mint,
      config: deriveProtocolConfig(),
      treasuryTokenAccount: a.treasuryTokenAccount,
      tokenProgram: a.tokenProgram,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function fullTimeoutRelease(programs: AnchorPrograms, args: { milestone: string }): Promise<ChainPlan> {
  const milestone = new PublicKey(args.milestone);
  const a = await releaseAccounts(programs, milestone);
  const ix = await programs.escrow.methods
    .fullTimeoutRelease()
    .accountsPartial({
      gig: a.gig,
      milestone,
      vault: a.vault,
      vaultTokenAccount: a.vaultTokenAccount,
      freelancerTokenAccount: getAssociatedTokenAddressSync(a.mint, a.freelancer),
      mint: a.mint,
      config: deriveProtocolConfig(),
      treasuryTokenAccount: a.treasuryTokenAccount,
      escrowAuthority: a.escrowAuthority,
      gigProgram: a.gigProgram,
      tokenProgram: a.tokenProgram,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function refundAfterDeadline(programs: AnchorPrograms, args: { milestone: string }): Promise<ChainPlan> {
  const client = providerOf(programs.escrow).wallet.publicKey;
  const milestone = new PublicKey(args.milestone);
  const a = await releaseAccounts(programs, milestone);
  const ix = await programs.escrow.methods
    .refundAfterDeadline()
    .accountsPartial({
      client,
      gig: a.gig,
      milestone,
      vault: a.vault,
      vaultTokenAccount: a.vaultTokenAccount,
      clientTokenAccount: getAssociatedTokenAddressSync(a.mint, client),
      mint: a.mint,
      config: deriveProtocolConfig(),
      escrowAuthority: a.escrowAuthority,
      gigProgram: a.gigProgram,
      tokenProgram: a.tokenProgram,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function rateFreelancer(
  programs: AnchorPrograms,
  args: { gig: string; score: number; review: string; reviewHash: string },
): Promise<ChainPlan> {
  const client = providerOf(programs.escrow).wallet.publicKey;
  const gig = new PublicKey(args.gig);
  const gigAccount = await programs.gig.account.gig.fetch(gig);
  const freelancer = gigAccount.freelancer as PublicKey;
  const jobId = new BN(gigAccount.id.toString());
  const ix = await programs.escrow.methods
    .rateFreelancer(args.score, hashBytes(args.reviewHash))
    .accountsPartial({
      client,
      gig,
      vault: deriveVault(gig),
      freelancer,
      freelancerProfile: deriveProfile(freelancer),
      rating: deriveRating(client, jobId),
      escrowAuthority: deriveEscrowAuthority(),
      reputationProgram: programs.reputation.programId,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

export async function settleReputation(programs: AnchorPrograms, args: { gig: string }): Promise<ChainPlan> {
  const gig = new PublicKey(args.gig);
  const gigAccount = await programs.gig.account.gig.fetch(gig);
  const freelancer = gigAccount.freelancer as PublicKey;
  const ix = await programs.escrow.methods
    .settleReputation()
    .accountsPartial({
      gig,
      vault: deriveVault(gig),
      escrowAuthority: deriveEscrowAuthority(),
      freelancerProfile: deriveProfile(freelancer),
      reputationProgram: programs.reputation.programId,
    })
    .instruction();
  return { steps: [await makeStep(programs.escrow, [ix])] };
}

// ─── Achievement ────────────────────────────────────────────────────────────

export async function claimAchievement(programs: AnchorPrograms, args: { type: string }): Promise<ChainPlan> {
  const claimer = providerOf(programs.achievement).wallet.publicKey;
  const badgeType = BADGE_TYPE[args.type as keyof typeof BADGE_TYPE];
  if (badgeType === undefined) throw new Error(`Unknown badge type: ${args.type}`);
  const variantKey = args.type.charAt(0).toLowerCase() + args.type.slice(1);
  const config = deriveAchievementConfig();
  const configAccount = await programs.achievement.account.achievementConfig.fetch(config);
  const asset = Keypair.generate();
  const ix = await programs.achievement.methods
    .claimAchievement({ [variantKey]: {} })
    .accountsPartial({
      claimer,
      profile: deriveProfile(claimer),
      badge: deriveBadge(claimer, badgeType),
      config,
      achievement: deriveAchievement(claimer, badgeType),
      asset: asset.publicKey,
      collection: configAccount.collection as PublicKey,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { steps: [await makeStep(programs.achievement, [ix], [asset])], result: asset.publicKey.toBase58() };
}

// ─── Registry ───────────────────────────────────────────────────────────────

/** Instructions that exist on-chain in Phase 1. Everything else is mock-only. */
export const chainBuilders: Record<string, ChainBuilder> = {
  createGig,
  publishGig,
  assignFreelancer,
  cancelGig,
  createMilestone,
  acceptTerms,
  fundMilestone,
  submitDelivery,
  approveMilestone,
  partialTimeoutRelease,
  fullTimeoutRelease,
  refundAfterDeadline,
  rateFreelancer,
  settleReputation,
  claimBadge: claimAchievement,
};

export function chainBuilder(name: string): ChainBuilder | undefined {
  return chainBuilders[name];
}
