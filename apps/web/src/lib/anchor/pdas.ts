/**
 * PDA derivation mirrored from e2e-test/shared.ts — seeds must match the Rust
 * `seeds = [...]` constraints exactly, or these throw opaque ConstraintSeeds
 * errors on-chain.
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_IDS } from "./idls";

export { BN };

export function deriveGig(client: PublicKey, id: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("gig"), client.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    PROGRAM_IDS.gig,
  )[0];
}

export function deriveVault(gig: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), gig.toBuffer()],
    PROGRAM_IDS.escrow,
  )[0];
}

export function deriveVaultTokenAccount(gig: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), gig.toBuffer(), Buffer.from("token")],
    PROGRAM_IDS.escrow,
  )[0];
}

export function deriveMilestone(gig: PublicKey, index: number): PublicKey {
  const idx = Buffer.alloc(4);
  idx.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("milestone"), gig.toBuffer(), idx],
    PROGRAM_IDS.escrow,
  )[0];
}

/** The singleton escrow `ProtocolConfig` PDA (governed settings + treasury). */
export function deriveProtocolConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_IDS.escrow,
  )[0];
}

/** Escrow's CPI-signer PDA. Off-curve, so no keypair can ever produce it. */
export function deriveEscrowAuthority(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_authority")],
    PROGRAM_IDS.escrow,
  )[0];
}

export function deriveProfile(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), authority.toBuffer()],
    PROGRAM_IDS.reputation,
  )[0];
}

export function deriveRating(client: PublicKey, jobId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rating"), client.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_IDS.reputation,
  )[0];
}

/** Badge types, in the discriminant order the Rust enum declares. */
export const BADGE_TYPE = {
  FirstGig: 0,
  TenCompletedJobs: 1,
  HundredCompletedJobs: 2,
  FiveStarPerformer: 3,
  TrustedFreelancer: 4,
  FastDeliverer: 5,
  TopRated: 6,
} as const;

export function deriveBadge(authority: PublicKey, badgeType: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("badge"), authority.toBuffer(), Buffer.from([badgeType])],
    PROGRAM_IDS.reputation,
  )[0];
}

export function deriveAchievementConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_IDS.achievement,
  )[0];
}

export function deriveAchievement(owner: PublicKey, badgeType: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("achievement"), owner.toBuffer(), Buffer.from([badgeType])],
    PROGRAM_IDS.achievement,
  )[0];
}
