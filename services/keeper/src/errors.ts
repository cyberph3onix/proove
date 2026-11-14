// Classify simulation / confirmation errors so a keeper that lost a race to
// another keeper treats it as a no-op instead of a failure.
import { escrowIdl } from "@proove/idl";

const ESCROW_ERRORS = new Map<number, string>(escrowIdl.errors.map((e) => [e.code, e.name]));

/** Anchor framework errors we can see from these instructions. */
const ANCHOR_ERRORS: Record<number, string> = {
  2000: "ConstraintMut",
  2003: "ConstraintRaw",
  2006: "ConstraintSeeds",
  2012: "ConstraintAddress",
  2014: "ConstraintTokenMint",
  2015: "ConstraintTokenOwner",
  3007: "AccountOwnedByWrongProgram",
  3012: "AccountNotInitialized",
};

/**
 * - `noop`: the action is no longer due (another keeper won, or the cluster
 *   clock hasn't reached the timeout yet). Nothing to do this tick.
 * - `skip`: the action can't succeed with these accounts; log and move on.
 * - `transient`: retry with backoff.
 */
export type ErrorClass = { kind: "noop" | "skip" | "transient"; reason: string };

/** Escrow errors meaning "already done / not due": InvalidStatus, TimeoutNotReached, InsufficientFunds. */
const NOOP_CODES = new Set([6001, 6006, 6003]);

const TRANSIENT_TX_ERRORS = new Set(["BlockhashNotFound", "AccountInUse", "WouldExceedMaxBlockCostLimit", "WouldExceedMaxAccountCostLimit", "WouldExceedAccountDataBlockLimit", "TooManyAccountLocks", "ClusterMaintenance"]);

export function customCode(err: unknown): number | null {
  if (err && typeof err === "object" && "InstructionError" in err) {
    const [, inner] = (err as { InstructionError: [number, unknown] }).InstructionError;
    if (inner && typeof inner === "object" && "Custom" in inner) return Number((inner as { Custom: number }).Custom);
  }
  return null;
}

export function errorName(code: number): string {
  return ESCROW_ERRORS.get(code) ?? ANCHOR_ERRORS[code] ?? `Custom(${code})`;
}

/** Classify a `TransactionError` from simulateTransaction or a confirmed status. */
export function classifyTxError(err: unknown): ErrorClass {
  const code = customCode(err);
  if (code !== null) {
    const name = errorName(code);
    return NOOP_CODES.has(code) ? { kind: "noop", reason: name } : { kind: "skip", reason: name };
  }
  if (typeof err === "string") {
    return TRANSIENT_TX_ERRORS.has(err) ? { kind: "transient", reason: err } : { kind: "skip", reason: err };
  }
  return { kind: "skip", reason: JSON.stringify(err) };
}

/** Classify a thrown error (RPC/network). Everything here is retried. */
export function classifyThrown(e: unknown): ErrorClass {
  const msg = e instanceof Error ? e.message : String(e);
  return { kind: "transient", reason: msg.slice(0, 300) };
}
