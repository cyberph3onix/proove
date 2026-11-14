// Account layouts, PDAs and decoding. Decoding goes through Anchor's
// BorshAccountsCoder with the generated IDLs from @proove/idl.
import { BorshAccountsCoder, type BN, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { escrowIdl, gigIdl } from "@proove/idl";
import { PROGRAM_IDS } from "@proove/config";
import { MILESTONE_STATUSES, type MilestoneSnap, type MilestoneStatus, type VaultSnap } from "./due";

export const ESCROW_PROGRAM_ID = new PublicKey(PROGRAM_IDS.escrow);
export const GIG_PROGRAM_ID = new PublicKey(PROGRAM_IDS.gig);
export const REPUTATION_PROGRAM_ID = new PublicKey(PROGRAM_IDS.reputation);
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSVAR_CLOCK_ID = new PublicKey("SysvarC1ock11111111111111111111111111111111");

const escrowCoder = new BorshAccountsCoder(escrowIdl as Idl);
const gigCoder = new BorshAccountsCoder(gigIdl as Idl);

function discriminator(idl: { accounts?: { name: string; discriminator: number[] }[] }, name: string): Buffer {
  const acc = idl.accounts?.find((a) => a.name === name);
  if (!acc) throw new Error(`IDL has no account ${name}`);
  return Buffer.from(acc.discriminator);
}

export const DISCRIMINATORS = {
  Milestone: discriminator(escrowIdl, "Milestone"),
  EscrowVault: discriminator(escrowIdl, "EscrowVault"),
  ProtocolConfig: discriminator(escrowIdl, "ProtocolConfig"),
  Gig: discriminator(gigIdl, "Gig"),
};

/**
 * Byte offsets used in getProgramAccounts memcmp filters, from the account
 * layouts in programs/escrow/src/state. `test/accounts.test.ts` checks them
 * against encoded accounts.
 */
export const OFFSETS = {
  /** 8 disc + gig 32 + index 4 + amount 8 + released 8 */
  milestoneStatus: 60,
  /** 8 disc + gig/token_account/mint 96 + total_locked/total_released 16 + milestone_count/active_milestone/cancelled_milestones 12 */
  vaultReputationSynced: 132,
};

// ── PDAs ──

export function vaultPda(gig: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), gig.toBuffer()], ESCROW_PROGRAM_ID)[0];
}

export function vaultTokenPda(gig: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), gig.toBuffer(), Buffer.from("token")], ESCROW_PROGRAM_ID)[0];
}

export function protocolConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("protocol_config")], ESCROW_PROGRAM_ID)[0];
}

export function escrowAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow_authority")], ESCROW_PROGRAM_ID)[0];
}

export function profilePda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("profile"), owner.toBuffer()], REPUTATION_PROGRAM_ID)[0];
}

/** Associated token account for the classic SPL Token program. */
export function associatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

// ── Decoding ──

const toBig = (v: BN): bigint => BigInt(v.toString(10));

function enumName(value: Record<string, unknown>): string {
  const [name] = Object.keys(value);
  if (!name) throw new Error("empty enum value");
  // Anchor decodes enum variants camelCased (`partialReleased`).
  return name[0]!.toUpperCase() + name.slice(1);
}

export function decodeMilestone(address: string, data: Buffer): MilestoneSnap {
  const m = escrowCoder.decode("Milestone", data);
  const status = enumName(m.status) as MilestoneStatus;
  if (!MILESTONE_STATUSES.includes(status)) throw new Error(`unknown milestone status ${status}`);
  return {
    address,
    gig: (m.gig as PublicKey).toBase58(),
    index: m.index as number,
    status,
    amount: toBig(m.amount),
    released: toBig(m.released),
    refunded: toBig(m.refunded),
    feesPaid: toBig(m.fees_paid),
    submittedAt: toBig(m.submitted_at),
    partialTimeout: toBig(m.partial_timeout),
    fullTimeout: toBig(m.full_timeout),
    partialBps: m.partial_bps as number,
  };
}

export function decodeVault(address: string, data: Buffer): VaultSnap {
  const v = escrowCoder.decode("EscrowVault", data);
  return {
    address,
    gig: (v.gig as PublicKey).toBase58(),
    mint: (v.mint as PublicKey).toBase58(),
    tokenAccount: (v.token_account as PublicKey).toBase58(),
    milestoneCount: v.milestone_count as number,
    activeMilestone: v.active_milestone as number,
    cancelledMilestones: v.cancelled_milestones as number,
    refundedMilestones: v.refunded_milestones as number,
    reputationSynced: v.reputation_synced as boolean,
  };
}

export interface GigSnap {
  address: string;
  freelancer: string;
  status: string;
}

export function decodeGig(address: string, data: Buffer): GigSnap {
  const g = gigCoder.decode("Gig", data);
  return { address, freelancer: (g.freelancer as PublicKey).toBase58(), status: enumName(g.status) };
}

export interface ConfigSnap {
  treasury: string;
}

export function decodeConfig(data: Buffer): ConfigSnap {
  const c = escrowCoder.decode("ProtocolConfig", data);
  return { treasury: (c.treasury as PublicKey).toBase58() };
}

/** Clock sysvar: slot u64, epoch_start_timestamp i64, epoch u64, leader_schedule_epoch u64, unix_timestamp i64. */
export function decodeClockUnixTimestamp(data: Buffer): bigint {
  if (data.length < 40) throw new Error(`clock sysvar too short (${data.length} bytes)`);
  return data.readBigInt64LE(32);
}

/** Raw encoders, used by tests to build fixture accounts. */
export const coders = { escrow: escrowCoder, gig: gigCoder };
