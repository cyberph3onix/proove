import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  associatedTokenAddress,
  ESCROW_PROGRAM_ID,
  GIG_PROGRAM_ID,
  profilePda,
  protocolConfigPda,
  REPUTATION_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../src/accounts";
import { tick } from "../src/keeper";
import { silentLogger } from "../src/log";
import type { SendOptions } from "../src/send";
import { FakeRpc } from "./fake-rpc";
import { DAY, encodeConfig, encodeGig, encodeMilestone, encodeVault, HOUR, key, milestone, vault } from "./fixtures";

const T0 = 1_000_000n;
const opts: SendOptions = { dryRun: false, maxAttempts: 2, backoffMs: 0, priorityFeeMicroLamports: 0, commitment: "confirmed" };
const payer = Keypair.generate();

/** One gig with `n` milestones, all accounts present. */
async function world(rpc: FakeRpc, ms: Parameters<typeof milestone>[0][], vaultOver: Parameters<typeof vault>[0] = {}) {
  const freelancer = key();
  const v = vault({ milestoneCount: ms.length, activeMilestone: 0, ...vaultOver });
  rpc.put(v.gig, await encodeGig(freelancer), GIG_PROGRAM_ID);
  rpc.put(v.address, await encodeVault(v), ESCROW_PROGRAM_ID);
  rpc.put(associatedTokenAddress(freelancer, new PublicKey(v.mint)), Buffer.alloc(165), TOKEN_PROGRAM_ID);
  rpc.put(profilePda(freelancer), Buffer.alloc(8), REPUTATION_PROGRAM_ID);
  const milestones = ms.map((o, index) => milestone({ gig: v.gig, index, submittedAt: T0, ...o }));
  for (const m of milestones) rpc.put(m.address, await encodeMilestone(m), ESCROW_PROGRAM_ID);
  return { v, milestones, freelancer };
}

async function withConfig(rpc: FakeRpc) {
  const treasury = key();
  rpc.put(protocolConfigPda(), await encodeConfig(treasury), ESCROW_PROGRAM_ID);
  rpc.put(treasury, Buffer.alloc(165), TOKEN_PROGRAM_ID);
}

describe("tick", () => {
  it("uses the cluster clock and sends nothing before the timeout", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    await world(rpc, [{}]);
    rpc.setClock(T0 + 72n * HOUR - 1n);
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    expect(r.now).toBe(T0 + 72n * HOUR - 1n);
    expect(r.milestonesScanned).toBe(1);
    expect(r.results).toEqual([]);
    expect(rpc.sent).toHaveLength(0);
  });

  it("sends one partial and one full release, one transaction each", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    const a = await world(rpc, [{}]);
    const b = await world(rpc, [{ submittedAt: T0 - 5n * DAY, status: "PartialReleased", released: 20_000_000n }]);
    rpc.setClock(T0 + 72n * HOUR);
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    expect(r.results.map((x) => [x.kind, x.result.status]).sort()).toEqual([
      ["full_timeout_release", "sent"],
      ["partial_timeout_release", "sent"],
    ]);
    expect(rpc.sent).toHaveLength(2);
    const targets = rpc.sent.map((tx) => {
      const ix = tx.message.compiledInstructions[0]!;
      return tx.message.staticAccountKeys[ix.accountKeyIndexes[1]!]!.toBase58();
    });
    expect(targets.sort()).toEqual([a.milestones[0]!.address, b.milestones[0]!.address].sort());
  });

  it("ignores milestones that are not Submitted/PartialReleased and settled vaults", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    await world(rpc, [{ status: "Completed" }, { status: "Disputed" }, { status: "Funded" }], { activeMilestone: 1, reputationSynced: true });
    rpc.setClock(T0 + 30n * DAY);
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    expect(r.milestonesScanned).toBe(0);
    expect(r.vaultsScanned).toBe(0);
    expect(rpc.sent).toHaveLength(0);
  });

  it("settles reputation for a fully accounted vault (refunds and cancels count)", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    await world(rpc, [{ status: "Completed" }, { status: "Refunded" }, { status: "Completed" }], {
      activeMilestone: 1,
      refundedMilestones: 1,
      cancelledMilestones: 1,
    });
    rpc.setClock(T0);
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    expect(r.results.map((x) => [x.kind, x.result.status])).toEqual([["settle_reputation", "sent"]]);
  });

  it("skips with a reason when the freelancer has no USDC account, and keeps going", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    const a = await world(rpc, [{}]);
    rpc.accounts.delete(associatedTokenAddress(a.freelancer, new PublicKey(a.v.mint)).toBase58());
    await world(rpc, [{}]);
    rpc.setClock(T0 + 72n * HOUR);
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    const statuses = r.results.map((x) => x.result.status).sort();
    expect(statuses).toEqual(["sent", "skipped"]);
    const skipped = r.results.find((x) => x.result.status === "skipped")!.result;
    expect(skipped.status === "skipped" && skipped.reason).toContain("associated token account");
  });

  it("is idempotent across keepers: a second keeper's simulation fails with InvalidStatus and nothing is sent", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    await world(rpc, [{}]);
    rpc.setClock(T0 + 72n * HOUR);
    rpc.simulate = () => ({ InstructionError: [0, { Custom: 6001 }] });
    const r = await tick(rpc.asRpc(), payer, opts, silentLogger);
    expect(r.results.map((x) => x.result.status)).toEqual(["noop"]);
    expect(rpc.sent).toHaveLength(0);
  });

  it("dry-run simulates without sending", async () => {
    const rpc = new FakeRpc();
    await withConfig(rpc);
    await world(rpc, [{}]);
    rpc.setClock(T0 + 7n * DAY);
    const r = await tick(rpc.asRpc(), payer, { ...opts, dryRun: true }, silentLogger);
    expect(r.results.map((x) => [x.kind, x.result.status])).toEqual([["full_timeout_release", "dry-run"]]);
    expect(rpc.simulations).toHaveLength(1);
    expect(rpc.sent).toHaveLength(0);
  });
});
