import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
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
} from "../src/accounts";
import type { DueAction } from "../src/due";
import {
  fullTimeoutReleaseIx,
  partialTimeoutReleaseIx,
  resolve,
  settleReputationIx,
  type ReleaseAccounts,
  type ResolveContext,
} from "../src/instructions";
import { key, vault } from "./fixtures";

type IdlAccount = { name: string; writable?: boolean; signer?: boolean; address?: string; pda?: { seeds: { kind: string; value?: number[] }[] } };
const idlIx = (name: string) => {
  const ix = escrowIdl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(name);
  return ix as unknown as { discriminator: number[]; accounts: IdlAccount[]; args: unknown[] };
};

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function releaseAccounts(): ReleaseAccounts {
  const gig = key();
  return {
    gig,
    milestone: key(),
    vault: vaultPda(gig),
    vaultTokenAccount: vaultTokenPda(gig),
    freelancerTokenAccount: key(),
    mint: key(),
    config: protocolConfigPda(),
    treasuryTokenAccount: key(),
  };
}

/** Map an instruction's keys back to IDL account names for comparison. */
function checkAgainstIdl(name: string, ix: ReturnType<typeof partialTimeoutReleaseIx>, byName: Record<string, PublicKey>) {
  const spec = idlIx(name);
  expect(ix.programId.equals(ESCROW_PROGRAM_ID)).toBe(true);
  expect([...ix.data]).toEqual(spec.discriminator);
  expect(spec.args).toEqual([]);
  expect(ix.keys).toHaveLength(spec.accounts.length);
  spec.accounts.forEach((acc, i) => {
    const k = ix.keys[i]!;
    expect({ name: acc.name, writable: k.isWritable, signer: k.isSigner }).toEqual({ name: acc.name, writable: !!acc.writable, signer: !!acc.signer });
    if (acc.address) expect(k.pubkey.toBase58()).toBe(acc.address);
    const expected = byName[acc.name];
    if (expected) expect(k.pubkey.toBase58()).toBe(expected.toBase58());
  });
}

describe("instruction building", () => {
  it("partial_timeout_release matches the IDL", () => {
    const a = releaseAccounts();
    const byName = Object.fromEntries(Object.entries(a).map(([k, v]) => [toSnake(k), v]));
    checkAgainstIdl("partial_timeout_release", partialTimeoutReleaseIx(a), { ...byName, token_program: TOKEN_PROGRAM_ID });
  });

  it("full_timeout_release matches the IDL", () => {
    const a = releaseAccounts();
    const byName = Object.fromEntries(Object.entries(a).map(([k, v]) => [toSnake(k), v]));
    checkAgainstIdl("full_timeout_release", fullTimeoutReleaseIx(a), {
      ...byName,
      escrow_authority: escrowAuthorityPda(),
      gig_program: GIG_PROGRAM_ID,
      token_program: TOKEN_PROGRAM_ID,
    });
  });

  it("settle_reputation matches the IDL", () => {
    const gig = key();
    const freelancer = key();
    const a = { gig, vault: vaultPda(gig), freelancerProfile: profilePda(freelancer) };
    checkAgainstIdl("settle_reputation", settleReputationIx(a), {
      gig,
      vault: a.vault,
      escrow_authority: escrowAuthorityPda(),
      freelancer_profile: a.freelancerProfile,
      reputation_program: REPUTATION_PROGRAM_ID,
    });
  });

  it("derives PDAs with the seeds the IDL declares", () => {
    const seed = (ix: string, acc: string) =>
      Buffer.from(idlIx(ix).accounts.find((a) => a.name === acc)!.pda!.seeds[0]!.value!).toString();
    expect(seed("partial_timeout_release", "vault")).toBe("vault");
    expect(seed("partial_timeout_release", "config")).toBe("protocol_config");
    expect(seed("full_timeout_release", "escrow_authority")).toBe("escrow_authority");
    expect(seed("settle_reputation", "freelancer_profile")).toBe("profile");
  });
});

describe("resolve", () => {
  const freelancer = key();
  const v = vault();
  const gig = v.gig;
  const ata = associatedTokenAddress(freelancer, new PublicKey(v.mint)).toBase58();
  const treasury = key().toBase58();
  const profile = profilePda(freelancer).toBase58();
  const base = (): ResolveContext => ({
    gigs: new Map([[gig, { address: gig, freelancer: freelancer.toBase58(), status: "InProgress" }]]),
    vaults: new Map([[gig, v]]),
    config: { treasury },
    tokenAccounts: new Set([ata, treasury]),
    profiles: new Set([profile]),
  });
  const partial: DueAction = { kind: "partial_timeout_release", gig, milestone: key().toBase58(), dueAt: 0n };
  const settle: DueAction = { kind: "settle_reputation", gig, vault: v.address };

  it("builds a release with the freelancer ATA, vault token PDA and treasury", () => {
    const p = resolve(partial, base());
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const keys = p.instruction.keys.map((k) => k.pubkey.toBase58());
    expect(keys[3]).toBe(vaultTokenPda(new PublicKey(gig)).toBase58());
    expect(keys[4]).toBe(ata);
    expect(keys[5]).toBe(v.mint);
    expect(keys[6]).toBe(protocolConfigPda().toBase58());
    expect(keys[7]).toBe(treasury);
  });

  it("builds a settlement with the freelancer profile", () => {
    const p = resolve(settle, base());
    expect(p.ok && p.instruction.keys[3]!.pubkey.toBase58()).toBe(profile);
  });

  it.each([
    ["gig account not found", (c: ResolveContext) => ({ ...c, gigs: new Map() })],
    ["gig has no freelancer", (c: ResolveContext) => ({ ...c, gigs: new Map([[gig, { address: gig, freelancer: PublicKey.default.toBase58(), status: "Assigned" }]]) })],
    ["escrow vault not found", (c: ResolveContext) => ({ ...c, vaults: new Map() })],
    ["protocol config not initialised", (c: ResolveContext) => ({ ...c, config: null })],
    ["freelancer has no USDC associated token account", (c: ResolveContext) => ({ ...c, tokenAccounts: new Set([treasury]) })],
    ["treasury token account", (c: ResolveContext) => ({ ...c, tokenAccounts: new Set([ata]) })],
    ["vault.token_account is not the vault token PDA", (c: ResolveContext) => ({ ...c, vaults: new Map([[gig, { ...v, tokenAccount: key().toBase58() }]]) })],
  ])("skips a release when: %s", (reason, mutate) => {
    const p = resolve(partial, mutate(base()));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toContain(reason);
  });

  it("skips settlement when the profile is missing", () => {
    const p = resolve(settle, { ...base(), profiles: new Set() });
    expect(!p.ok && p.reason).toContain("reputation profile");
  });
});
