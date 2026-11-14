import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { coders, vaultPda, vaultTokenPda } from "../src/accounts";
import type { MilestoneSnap, MilestoneStatus, VaultSnap } from "../src/due";

export const HOUR = 3600n;
export const DAY = 86_400n;

export const key = () => Keypair.generate().publicKey;

export function milestone(over: Partial<MilestoneSnap> = {}): MilestoneSnap {
  return {
    address: key().toBase58(),
    gig: key().toBase58(),
    index: 0,
    status: "Submitted",
    amount: 100_000_000n,
    released: 0n,
    refunded: 0n,
    feesPaid: 0n,
    submittedAt: 1_000_000n,
    partialTimeout: 72n * HOUR,
    fullTimeout: 7n * DAY,
    partialBps: 2000,
    ...over,
  };
}

export function vault(over: Partial<VaultSnap> = {}): VaultSnap {
  const gig = over.gig ? new PublicKey(over.gig) : key();
  return {
    address: vaultPda(gig).toBase58(),
    gig: gig.toBase58(),
    mint: key().toBase58(),
    tokenAccount: vaultTokenPda(gig).toBase58(),
    milestoneCount: 1,
    activeMilestone: 1,
    cancelledMilestones: 0,
    refundedMilestones: 0,
    reputationSynced: false,
    ...over,
  };
}

const variant = (name: string) => ({ [name]: {} });

export async function encodeMilestone(m: MilestoneSnap): Promise<Buffer> {
  return coders.escrow.encode("Milestone", {
    gig: new PublicKey(m.gig),
    index: m.index,
    amount: new BN(m.amount.toString()),
    released: new BN(m.released.toString()),
    status: variant(m.status as MilestoneStatus),
    submitted_at: new BN(m.submittedAt.toString()),
    approved_at: new BN(0),
    bump: 254,
    spec_hash: Array(32).fill(0),
    delivery_hash: Array(32).fill(7),
    report_hash: Array(32).fill(0),
    terms_accepted: true,
    submitted_slot: new BN(42),
    funded_at: new BN(1),
    partial_timeout: new BN(m.partialTimeout.toString()),
    full_timeout: new BN(m.fullTimeout.toString()),
    partial_bps: m.partialBps,
    fee_bps: 100,
    fees_paid: new BN(m.feesPaid.toString()),
    refunded: new BN(m.refunded.toString()),
  });
}

export async function encodeVault(v: VaultSnap): Promise<Buffer> {
  return coders.escrow.encode("EscrowVault", {
    gig: new PublicKey(v.gig),
    token_account: new PublicKey(v.tokenAccount),
    mint: new PublicKey(v.mint),
    total_locked: new BN(0),
    total_released: new BN(5),
    milestone_count: v.milestoneCount,
    active_milestone: v.activeMilestone,
    cancelled_milestones: v.cancelledMilestones,
    reputation_synced: v.reputationSynced,
    bump: 253,
    total_fees: new BN(0),
    total_refunded: new BN(0),
    refunded_milestones: v.refundedMilestones,
  });
}

export async function encodeGig(freelancer: PublicKey, status = "InProgress"): Promise<Buffer> {
  return coders.gig.encode("Gig", {
    id: new BN(1),
    client: key(),
    freelancer,
    mint: key(),
    status: variant(status),
    created_at: new BN(0),
    updated_at: new BN(0),
    title: "Logo",
    description: "A logo",
    skills: "design",
    category: "design",
    budget: new BN(100),
    deadline: new BN(0),
    bump: 255,
  });
}

export async function encodeConfig(treasury: PublicKey): Promise<Buffer> {
  return coders.escrow.encode("ProtocolConfig", {
    admin: key(),
    treasury,
    partial_timeout: new BN(72 * 3600),
    full_timeout: new BN(7 * 86400),
    partial_bps: 2000,
    fee_bps: 100,
    min_milestone: new BN(5_000_000),
    no_delivery_grace: new BN(3 * 86400),
    bump: 250,
  });
}

export function clockData(unixTimestamp: bigint): Buffer {
  const b = Buffer.alloc(40);
  b.writeBigUInt64LE(123n, 0);
  b.writeBigInt64LE(0n, 8);
  b.writeBigUInt64LE(1n, 16);
  b.writeBigUInt64LE(2n, 24);
  b.writeBigInt64LE(unixTimestamp, 32);
  return b;
}
