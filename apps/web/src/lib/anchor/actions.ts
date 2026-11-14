/**
 * Write-side calls into the deployed programs. Account lists mirror
 * e2e-test/{gig,escrow,achievement}.test.ts exactly -- these are the accounts
 * the Rust constraints actually check, not a guess.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
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
  deriveVault,
  deriveVaultTokenAccount,
  type BADGE_TYPE,
} from "./pdas";

const GIG_PROGRAM_ID = new PublicKey("ALa1EKfsHHMefH139SYuSNxd2XbUPj9EN3xRTbPHQNwA");
const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

export interface CreateGigParams {
  client: PublicKey;
  mint: PublicKey;
  title: string;
  description: string;
  category: string;
  budget: bigint;
  /** Unix seconds. */
  deadline: bigint;
}

/** Creates a gig in Draft status. Returns its PDA. */
export async function createGig(programs: AnchorPrograms, params: CreateGigParams): Promise<PublicKey> {
  const id = new BN(Date.now());
  const gig = deriveGig(params.client, id);

  await programs.gig.methods
    .initializeGig(id, params.title, params.description, params.category, new BN(params.budget.toString()), new BN(params.deadline.toString()))
    .accountsPartial({
      client: params.client,
      mint: params.mint,
      gig,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return gig;
}

export async function publishGig(programs: AnchorPrograms, client: PublicKey, gig: PublicKey): Promise<void> {
  await programs.gig.methods.publishGig().accountsPartial({ client, gig }).rpc();
}

export async function assignFreelancer(
  programs: AnchorPrograms,
  client: PublicKey,
  gig: PublicKey,
  freelancer: PublicKey,
): Promise<void> {
  await programs.gig.methods.assignFreelancer().accountsPartial({ client, freelancer, gig }).rpc();
}

/** Creates the next milestone (sequenced by the vault's on-chain milestone_count) and funds it in one flow. */
export async function createAndFundMilestone(
  programs: AnchorPrograms,
  params: { client: PublicKey; gig: PublicKey; mint: PublicKey; amount: bigint },
): Promise<PublicKey> {
  const { client, gig, mint, amount } = params;
  const vault = deriveVault(gig);

  const vaultAccount = await programs.escrow.account.escrowVault.fetchNullable(vault);
  const index = vaultAccount ? vaultAccount.milestoneCount : 0;
  const milestone = deriveMilestone(gig, index);

  await programs.escrow.methods
    .createMilestone(new BN(amount.toString()))
    .accountsPartial({ client, gig, vault, milestone, systemProgram: SystemProgram.programId })
    .rpc();

  const vaultTokenAccount = deriveVaultTokenAccount(gig);
  const clientTokenAccount = getAssociatedTokenAddressSync(mint, client);
  const escrowAuthority = deriveEscrowAuthority();

  await programs.escrow.methods
    .fundMilestone()
    .accountsPartial({
      client,
      gig,
      milestone,
      vault,
      vaultTokenAccount,
      clientTokenAccount,
      mint,
      escrowAuthority,
      gigProgram: GIG_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return milestone;
}

export async function submitDelivery(
  programs: AnchorPrograms,
  freelancer: PublicKey,
  gig: PublicKey,
  milestone: PublicKey,
): Promise<void> {
  await programs.escrow.methods.submitDelivery().accountsPartial({ freelancer, gig, milestone }).rpc();
}

export async function approveMilestone(
  programs: AnchorPrograms,
  params: { client: PublicKey; gig: PublicKey; milestone: PublicKey; mint: PublicKey; freelancer: PublicKey },
): Promise<void> {
  const { client, gig, milestone, mint, freelancer } = params;
  const vault = deriveVault(gig);
  const vaultTokenAccount = deriveVaultTokenAccount(gig);
  const freelancerTokenAccount = getAssociatedTokenAddressSync(mint, freelancer);
  const escrowAuthority = deriveEscrowAuthority();

  await programs.escrow.methods
    .approveMilestone()
    .accountsPartial({
      client,
      gig,
      milestone,
      vault,
      vaultTokenAccount,
      freelancer,
      freelancerTokenAccount,
      mint,
      escrowAuthority,
      gigProgram: GIG_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

/** Mints the NFT for a badge the reputation program has already awarded. */
export async function claimAchievement(
  programs: AnchorPrograms,
  claimer: PublicKey,
  badgeType: (typeof BADGE_TYPE)[keyof typeof BADGE_TYPE],
  badgeVariantKey: string,
): Promise<PublicKey> {
  const profile = deriveProfile(claimer);
  const badge = deriveBadge(claimer, badgeType);
  const config = deriveAchievementConfig();
  const achievement = deriveAchievement(claimer, badgeType);
  const asset = Keypair.generate();

  const configAccount = await programs.achievement.account.achievementConfig.fetch(config);

  await programs.achievement.methods
    .claimAchievement({ [badgeVariantKey]: {} })
    .accountsPartial({
      claimer,
      profile,
      badge,
      config,
      achievement,
      asset: asset.publicKey,
      collection: configAccount.collection,
      mplCoreProgram: MPL_CORE_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([asset])
    .rpc();

  return asset.publicKey;
}
