import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { classifyTxError } from "../src/errors";
import { silentLogger } from "../src/log";
import { simulateAndSend, type SendOptions } from "../src/send";
import { partialTimeoutReleaseIx } from "../src/instructions";
import { protocolConfigPda, vaultPda, vaultTokenPda } from "../src/accounts";
import { FakeRpc } from "./fake-rpc";
import { key } from "./fixtures";

const payer = Keypair.generate();
const gig = key();
const ix = partialTimeoutReleaseIx({
  gig,
  milestone: key(),
  vault: vaultPda(gig),
  vaultTokenAccount: vaultTokenPda(gig),
  freelancerTokenAccount: key(),
  mint: key(),
  config: protocolConfigPda(),
  treasuryTokenAccount: key(),
});
const sleeps: number[] = [];
const opts = (over: Partial<SendOptions> = {}): SendOptions => ({
  dryRun: false,
  maxAttempts: 3,
  backoffMs: 100,
  priorityFeeMicroLamports: 0,
  commitment: "confirmed",
  sleep: async (ms) => void sleeps.push(ms),
  ...over,
});
const custom = (code: number) => ({ InstructionError: [0, { Custom: code }] });

describe("classifyTxError", () => {
  it("treats InvalidStatus, TimeoutNotReached and InsufficientFunds as no-ops", () => {
    expect(classifyTxError(custom(6001))).toEqual({ kind: "noop", reason: "InvalidStatus" });
    expect(classifyTxError(custom(6006))).toEqual({ kind: "noop", reason: "TimeoutNotReached" });
    expect(classifyTxError(custom(6003))).toEqual({ kind: "noop", reason: "InsufficientFunds" });
  });
  it("skips account mismatches and retries blockhash errors", () => {
    expect(classifyTxError(custom(6017))).toEqual({ kind: "skip", reason: "InvalidTreasury" });
    expect(classifyTxError(custom(3012))).toEqual({ kind: "skip", reason: "AccountNotInitialized" });
    expect(classifyTxError("BlockhashNotFound").kind).toBe("transient");
    expect(classifyTxError("InsufficientFundsForFee").kind).toBe("skip");
  });
});

describe("simulateAndSend", () => {
  it("simulates, signs and sends exactly one transaction", async () => {
    const rpc = new FakeRpc();
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r).toEqual({ status: "sent", signature: "sig1", attempts: 1 });
    expect(rpc.simulations).toHaveLength(1);
    expect(rpc.sent).toHaveLength(1);
    const msg = rpc.sent[0]!.message;
    expect(msg.staticAccountKeys[0]!.equals(payer.publicKey)).toBe(true);
    expect(msg.compiledInstructions).toHaveLength(1);
  });

  it("adds a compute-unit price when configured", async () => {
    const rpc = new FakeRpc();
    await simulateAndSend(rpc.asRpc(), payer, ix, opts({ priorityFeeMicroLamports: 5000 }), silentLogger);
    expect(rpc.sent[0]!.message.compiledInstructions).toHaveLength(2);
  });

  it("never sends in dry-run", async () => {
    const rpc = new FakeRpc();
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts({ dryRun: true }), silentLogger);
    expect(r).toEqual({ status: "dry-run", unitsConsumed: 1234, attempts: 1 });
    expect(rpc.sent).toHaveLength(0);
  });

  it("treats a lost race (InvalidStatus in simulation) as a no-op without sending", async () => {
    const rpc = new FakeRpc();
    rpc.simulate = () => custom(6001);
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r).toEqual({ status: "noop", reason: "InvalidStatus", attempts: 1 });
    expect(rpc.sent).toHaveLength(0);
  });

  it("treats a race lost between simulation and landing as a no-op", async () => {
    const rpc = new FakeRpc();
    rpc.confirm = () => custom(6001);
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r.status).toBe("noop");
    expect(rpc.sent).toHaveLength(1);
  });

  it("skips permanent errors without retrying", async () => {
    const rpc = new FakeRpc();
    rpc.simulate = () => custom(6017);
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r.status).toBe("skipped");
    expect(rpc.simulations).toHaveLength(1);
  });

  it("retries transient errors with exponential backoff, then gives up", async () => {
    sleeps.length = 0;
    const rpc = new FakeRpc();
    rpc.simulate = () => new Error("fetch failed");
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts({ maxAttempts: 4 }), silentLogger);
    expect(r).toEqual({ status: "failed", reason: "fetch failed", attempts: 4 });
    expect(sleeps).toEqual([100, 200, 400]);
    expect(rpc.sent).toHaveLength(0);
  });

  it("recovers after a transient failure", async () => {
    const rpc = new FakeRpc();
    let n = 0;
    rpc.simulate = () => (++n === 1 ? "BlockhashNotFound" : null);
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r).toMatchObject({ status: "sent", attempts: 2 });
    expect(rpc.sent).toHaveLength(1);
  });

  it("does not resend when a timed-out transaction actually landed", async () => {
    const rpc = new FakeRpc();
    rpc.confirm = () => new Error("block height exceeded");
    rpc.signatureStatus = () => ({ err: null, confirmationStatus: "confirmed" });
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r).toEqual({ status: "sent", signature: "sig1", attempts: 2 });
    expect(rpc.sent).toHaveLength(1);
  });

  it("resends after a timeout only once the re-simulation still passes", async () => {
    const rpc = new FakeRpc();
    let sends = 0;
    rpc.confirm = () => (++sends === 1 ? new Error("block height exceeded") : null);
    const r = await simulateAndSend(rpc.asRpc(), payer, ix, opts(), silentLogger);
    expect(r).toMatchObject({ status: "sent", signature: "sig2", attempts: 2 });
    expect(rpc.simulations).toHaveLength(2);
  });
});
