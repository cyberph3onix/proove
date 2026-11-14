// Simulate-then-send for one instruction per transaction, with bounded
// retries. Idempotency comes from the programs: every action flips on-chain
// state, so a duplicate (from a retry or another keeper) fails simulation with
// InvalidStatus and is reported as a no-op.
import {
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
  type Connection,
  type Keypair,
  type TransactionInstruction,
} from "@solana/web3.js";
import { classifyThrown, classifyTxError, type ErrorClass } from "./errors";
import type { Logger } from "./log";

export type SendRpc = Pick<
  Connection,
  "getLatestBlockhash" | "simulateTransaction" | "sendRawTransaction" | "confirmTransaction" | "getSignatureStatus"
>;

export interface SendOptions {
  dryRun: boolean;
  maxAttempts: number;
  /** First backoff delay; doubles each attempt. */
  backoffMs: number;
  priorityFeeMicroLamports: number;
  commitment: Commitment;
  sleep?: (ms: number) => Promise<void>;
}

export type SendResult =
  | { status: "sent"; signature: string; attempts: number }
  | { status: "dry-run"; unitsConsumed?: number; attempts: number }
  | { status: "noop"; reason: string; attempts: number }
  | { status: "skipped"; reason: string; logs?: string[]; attempts: number }
  | { status: "failed"; reason: string; attempts: number };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function simulateAndSend(
  rpc: SendRpc,
  payer: Keypair,
  ix: TransactionInstruction,
  opts: SendOptions,
  log: Logger,
): Promise<SendResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const instructions = opts.priorityFeeMicroLamports > 0
    ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFeeMicroLamports }), ix]
    : [ix];
  let lastSignature: string | null = null;
  let last: ErrorClass = { kind: "transient", reason: "no attempt made" };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (attempt > 1) await sleep(opts.backoffMs * 2 ** (attempt - 2));
    try {
      // A previous attempt may have landed even though confirmation timed out.
      if (lastSignature) {
        const st = await rpc.getSignatureStatus(lastSignature, { searchTransactionHistory: true });
        const v = st.value;
        if (v && !v.err && (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized")) {
          return { status: "sent", signature: lastSignature, attempts: attempt };
        }
      }

      const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash(opts.commitment);
      const message = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions }).compileToV0Message();
      const tx = new VersionedTransaction(message);

      const sim = await rpc.simulateTransaction(tx, { sigVerify: false, commitment: opts.commitment });
      if (sim.value.err) {
        const c = classifyTxError(sim.value.err);
        if (c.kind === "noop") return { status: "noop", reason: c.reason, attempts: attempt };
        if (c.kind === "skip") return { status: "skipped", reason: c.reason, logs: sim.value.logs ?? undefined, attempts: attempt };
        last = c;
        log.debug("simulation transient error", { attempt, reason: c.reason });
        continue;
      }
      if (opts.dryRun) return { status: "dry-run", unitsConsumed: sim.value.unitsConsumed, attempts: attempt };

      tx.sign([payer]);
      // Already simulated; preflight would only repeat it.
      const signature = await rpc.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 0 });
      lastSignature = signature;
      const conf = await rpc.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, opts.commitment);
      if (conf.value.err) {
        const c = classifyTxError(conf.value.err);
        if (c.kind === "noop") return { status: "noop", reason: c.reason, attempts: attempt };
        if (c.kind === "skip") return { status: "skipped", reason: c.reason, attempts: attempt };
        last = c;
        continue;
      }
      return { status: "sent", signature, attempts: attempt };
    } catch (e) {
      last = classifyThrown(e);
      log.debug("rpc error", { attempt, reason: last.reason });
    }
  }
  return { status: "failed", reason: last.reason, attempts: opts.maxAttempts };
}
