// Account resolution (pure) and instruction building for the three
// permissionless escrow instructions. Account order and writability follow
// the IDL; test/instructions.test.ts checks them against @proove/idl.
import { BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { escrowIdl } from "@proove/idl";
import {
  associatedTokenAddress,
  escrowAuthorityPda,
  ESCROW_PROGRAM_ID,
  GIG_PROGRAM_ID,
  profilePda,
  protocolConfigPda,
  REPUTATION_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  vaultPda,
  vaultTokenPda,
  type ConfigSnap,
  type GigSnap,
} from "./accounts";
import type { DueAction, VaultSnap } from "./due";

const ixCoder = new BorshInstructionCoder(escrowIdl as Idl);

export interface ReleaseAccounts {
  gig: PublicKey;
  milestone: PublicKey;
  vault: PublicKey;
  vaultTokenAccount: PublicKey;
  freelancerTokenAccount: PublicKey;
  mint: PublicKey;
  config: PublicKey;
  treasuryTokenAccount: PublicKey;
}

export interface SettleAccounts {
  gig: PublicKey;
  vault: PublicKey;
  freelancerProfile: PublicKey;
}

export type Plan =
  | { ok: true; action: DueAction; instruction: TransactionInstruction }
  | { ok: false; action: DueAction; reason: string };

/** What the resolver needs to know about the chain, already fetched. */
export interface ResolveContext {
  gigs: ReadonlyMap<string, GigSnap>;
  /** Keyed by gig address. */
  vaults: ReadonlyMap<string, VaultSnap>;
  config: ConfigSnap | null;
  /** Token accounts that exist and are owned by the SPL Token program. */
  tokenAccounts: ReadonlySet<string>;
  /** Reputation profiles that exist. */
  profiles: ReadonlySet<string>;
}

const meta = (pubkey: PublicKey, isWritable: boolean): AccountMeta => ({ pubkey, isWritable, isSigner: false });

export function partialTimeoutReleaseIx(a: ReleaseAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    data: ixCoder.encode("partial_timeout_release", {}),
    keys: [
      meta(a.gig, false),
      meta(a.milestone, true),
      meta(a.vault, true),
      meta(a.vaultTokenAccount, true),
      meta(a.freelancerTokenAccount, true),
      meta(a.mint, false),
      meta(a.config, false),
      meta(a.treasuryTokenAccount, true),
      meta(TOKEN_PROGRAM_ID, false),
    ],
  });
}

export function fullTimeoutReleaseIx(a: ReleaseAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    data: ixCoder.encode("full_timeout_release", {}),
    keys: [
      meta(a.gig, true),
      meta(a.milestone, true),
      meta(a.vault, true),
      meta(a.vaultTokenAccount, true),
      meta(a.freelancerTokenAccount, true),
      meta(a.mint, false),
      meta(a.config, false),
      meta(a.treasuryTokenAccount, true),
      meta(escrowAuthorityPda(), false),
      meta(GIG_PROGRAM_ID, false),
      meta(TOKEN_PROGRAM_ID, false),
    ],
  });
}

export function settleReputationIx(a: SettleAccounts): TransactionInstruction {
  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    data: ixCoder.encode("settle_reputation", {}),
    keys: [
      meta(a.gig, false),
      meta(a.vault, true),
      meta(escrowAuthorityPda(), false),
      meta(a.freelancerProfile, true),
      meta(REPUTATION_PROGRAM_ID, false),
    ],
  });
}

const DEFAULT_PUBKEY = PublicKey.default.toBase58();

/** Addresses the resolver will look up, so the caller can batch-fetch them. */
export function freelancerTokenAccountFor(gig: GigSnap, vault: VaultSnap): PublicKey {
  return associatedTokenAddress(new PublicKey(gig.freelancer), new PublicKey(vault.mint));
}

/**
 * Turn a due action into an instruction, or a reason it can't be sent yet.
 * Pure: every chain fact comes from `ctx`.
 */
export function resolve(action: DueAction, ctx: ResolveContext): Plan {
  const skip = (reason: string): Plan => ({ ok: false, action, reason });
  const gig = ctx.gigs.get(action.gig);
  if (!gig) return skip("gig account not found");
  if (gig.freelancer === DEFAULT_PUBKEY) return skip("gig has no freelancer");
  const vault = ctx.vaults.get(action.gig);
  if (!vault) return skip("escrow vault not found");
  const gigKey = new PublicKey(action.gig);
  const expectedVault = vaultPda(gigKey);
  if (vault.address !== expectedVault.toBase58()) return skip("vault address is not the gig's vault PDA");

  if (action.kind === "settle_reputation") {
    const profile = profilePda(new PublicKey(gig.freelancer));
    if (!ctx.profiles.has(profile.toBase58())) return skip(`freelancer reputation profile ${profile.toBase58()} does not exist`);
    return { ok: true, action, instruction: settleReputationIx({ gig: gigKey, vault: expectedVault, freelancerProfile: profile }) };
  }

  if (!ctx.config) return skip("protocol config not initialised");
  const freelancerAta = freelancerTokenAccountFor(gig, vault);
  if (!ctx.tokenAccounts.has(freelancerAta.toBase58())) {
    return skip(`freelancer has no USDC associated token account (${freelancerAta.toBase58()})`);
  }
  if (!ctx.tokenAccounts.has(ctx.config.treasury)) return skip(`treasury token account ${ctx.config.treasury} does not exist`);
  // The program checks `address = vault.token_account`; fund_milestone creates it at this PDA.
  const vaultToken = vaultTokenPda(gigKey);
  if (vault.tokenAccount !== vaultToken.toBase58()) return skip("vault.token_account is not the vault token PDA");

  const accounts: ReleaseAccounts = {
    gig: gigKey,
    milestone: new PublicKey(action.milestone),
    vault: expectedVault,
    vaultTokenAccount: vaultToken,
    freelancerTokenAccount: freelancerAta,
    mint: new PublicKey(vault.mint),
    config: protocolConfigPda(),
    treasuryTokenAccount: new PublicKey(ctx.config.treasury),
  };
  const instruction = action.kind === "partial_timeout_release" ? partialTimeoutReleaseIx(accounts) : fullTimeoutReleaseIx(accounts);
  return { ok: true, action, instruction };
}
