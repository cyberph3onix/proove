// Pure "what's due" rules. They mirror the on-chain checks in
// programs/escrow/src/instructions/{partial_timeout_release,full_timeout_release,settle_reputation}.rs
// and the mock keeper (apps/web/src/lib/mock/keeper.ts). No I/O here.

export const MILESTONE_STATUSES = [
  "PendingFunding",
  "Funded",
  "Submitted",
  "PartialReleased",
  "Completed",
  "Refunded",
  "Disputed",
  "Resolved",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface MilestoneSnap {
  address: string;
  gig: string;
  index: number;
  status: MilestoneStatus;
  amount: bigint;
  released: bigint;
  refunded: bigint;
  feesPaid: bigint;
  submittedAt: bigint;
  partialTimeout: bigint;
  fullTimeout: bigint;
  partialBps: number;
}

export interface VaultSnap {
  address: string;
  gig: string;
  mint: string;
  tokenAccount: string;
  milestoneCount: number;
  activeMilestone: number;
  cancelledMilestones: number;
  refundedMilestones: number;
  reputationSynced: boolean;
}

export type ActionKind = "partial_timeout_release" | "full_timeout_release" | "settle_reputation";

export type DueAction =
  | { kind: "partial_timeout_release" | "full_timeout_release"; gig: string; milestone: string; dueAt: bigint }
  | { kind: "settle_reputation"; gig: string; vault: string };

const I64_MAX = (1n << 63n) - 1n;
const I64_MIN = -(1n << 63n);

/** Rust's `i64::saturating_add`. */
export function saturatingAddI64(a: bigint, b: bigint): bigint {
  const sum = a + b;
  return sum > I64_MAX ? I64_MAX : sum < I64_MIN ? I64_MIN : sum;
}

/** `amount * bps / 10_000`, rounded down (escrow `bps_of`). */
export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}

/** Amount still held in the vault for a milestone (`Milestone::locked`); null on underflow. */
export function locked(m: MilestoneSnap): bigint | null {
  const rest = m.amount - m.released - m.refunded - m.feesPaid;
  return rest < 0n ? null : rest;
}

export function partialDueAt(m: MilestoneSnap): bigint {
  return saturatingAddI64(m.submittedAt, m.partialTimeout);
}

export function fullDueAt(m: MilestoneSnap): bigint {
  return saturatingAddI64(m.submittedAt, m.fullTimeout);
}

/**
 * Full release: Submitted or PartialReleased, `now >= submitted_at + full_timeout`,
 * and something still locked (otherwise the program rejects with InsufficientFunds).
 */
export function isFullDue(m: MilestoneSnap, now: bigint): boolean {
  if (m.status !== "Submitted" && m.status !== "PartialReleased") return false;
  if (now < fullDueAt(m)) return false;
  const rest = locked(m);
  return rest !== null && rest > 0n;
}

/**
 * Partial release: Submitted, `now >= submitted_at + partial_timeout`, and a
 * non-zero `partial_bps` share (a share that rounds to zero is rejected
 * on-chain; the full release covers that milestone at its own timeout).
 */
export function isPartialDue(m: MilestoneSnap, now: bigint): boolean {
  if (m.status !== "Submitted") return false;
  if (now < partialDueAt(m)) return false;
  return bpsOf(m.amount, m.partialBps) > 0n;
}

/** Released + cancelled + refunded milestones (`EscrowVault::accounted_milestones`). */
export function accountedMilestones(v: VaultSnap): number {
  return v.activeMilestone + v.cancelledMilestones + v.refundedMilestones;
}

export function isSettleDue(v: VaultSnap): boolean {
  return !v.reputationSynced && v.milestoneCount > 0 && accountedMilestones(v) >= v.milestoneCount;
}

/**
 * Everything due at cluster time `now`, at most one action per milestone and
 * per vault. When both releases are due (the keeper was down past the full
 * timeout), only the full release is sent: it pays out everything still
 * locked, so the partial would be a redundant extra transaction.
 *
 * A vault whose last milestone is released in this tick is settled on the
 * next tick, once its counters show the release.
 */
export function dueActions(milestones: readonly MilestoneSnap[], vaults: readonly VaultSnap[], now: bigint): DueAction[] {
  const out: DueAction[] = [];
  const seen = new Set<string>();
  const sorted = [...milestones].sort((a, b) => (a.gig === b.gig ? a.index - b.index : a.gig < b.gig ? -1 : 1));
  for (const m of sorted) {
    if (seen.has(m.address)) continue;
    if (isFullDue(m, now)) {
      out.push({ kind: "full_timeout_release", gig: m.gig, milestone: m.address, dueAt: fullDueAt(m) });
      seen.add(m.address);
    } else if (isPartialDue(m, now)) {
      out.push({ kind: "partial_timeout_release", gig: m.gig, milestone: m.address, dueAt: partialDueAt(m) });
      seen.add(m.address);
    }
  }
  for (const v of vaults) {
    if (seen.has(v.address)) continue;
    if (isSettleDue(v)) {
      out.push({ kind: "settle_reputation", gig: v.gig, vault: v.address });
      seen.add(v.address);
    }
  }
  return out;
}

/** Stable key for logs and de-duplication. */
export function actionKey(a: DueAction): string {
  return a.kind === "settle_reputation" ? `${a.kind}:${a.vault}` : `${a.kind}:${a.milestone}`;
}
