import type { AiSeat, Bps, DisputeCase, DisputeConfig, Milestone, ProtocolConfig } from "./types";

export const ALLOWED_RULINGS: Bps[] = [0, 2500, 5000, 7500, 10000];

/** Median of valid seat rulings, or null when the AI phase gives none. */
export function aiRecommendation(seats: AiSeat[]): { recommendation: Bps | null; split: boolean; failed: boolean } {
  const rulings = seats
    .filter((s) => s.status === "posted" && s.evaluation)
    .map((s) => s.evaluation!.ruling)
    .sort((a, b) => a - b);
  if (rulings.length < 2) return { recommendation: null, split: true, failed: true };
  if (rulings.length === 2) {
    // Two valid seats must agree; otherwise the case is treated as split.
    return rulings[0] === rulings[1]
      ? { recommendation: rulings[0], split: false, failed: false }
      : { recommendation: null, split: true, failed: true };
  }
  const recommendation = rulings[1];
  const split = rulings[rulings.length - 1] - rulings[0] >= 5000;
  return { recommendation, split, failed: false };
}

export function disputeBond(frozen: number, cfg: DisputeConfig): number {
  return Math.max(Math.floor((frozen * cfg.bondBps) / 10_000), cfg.bondMin);
}

export function arbitrationFee(frozen: number, cfg: DisputeConfig, humanOnlyChosen: boolean): number {
  const bps = humanOnlyChosen ? cfg.humanOnlyFeeBps : cfg.feeBps;
  return Math.max(Math.floor((frozen * bps) / 10_000), cfg.feeMin);
}

export function requiresTwoArbitrators(c: Pick<DisputeCase, "frozenAmount" | "split" | "mode" | "round" | "aiPhase">, cfg: DisputeConfig): boolean {
  return (
    c.frozenAmount >= cfg.highValueThreshold ||
    c.split ||
    c.mode === "humanOnly" ||
    c.round === 2 ||
    c.aiPhase === "failed"
  );
}

/** Tie-break fallback if the fallback arbitrator also fails to act. */
export function defaultTieBreak(a: Bps, b: Bps, recommendation: Bps | null): Bps {
  const target = recommendation ?? 5000;
  return Math.abs(a - target) <= Math.abs(b - target) ? a : b;
}

/** Remaining locked amount that a dispute would freeze. */
export function lockedRemaining(m: Pick<Milestone, "amount" | "released" | "refunded" | "feesPaid">): number {
  return m.amount - m.released - m.refunded - m.feesPaid;
}

export interface RulingSplit {
  toFreelancer: number;
  toClient: number;
  protocolFee: number;
}

/**
 * How execute_ruling splits the frozen amount. The protocol fee applies to
 * the freelancer's share only (it is a fee on releases, not refunds).
 */
export function splitRuling(frozen: number, ruling: Bps, feeBps: Bps): RulingSplit {
  const gross = Math.floor((frozen * ruling) / 10_000);
  const protocolFee = Math.floor((gross * feeBps) / 10_000);
  return { toFreelancer: gross - protocolFee, toClient: frozen - gross, protocolFee };
}

export function releaseFee(amount: number, cfg: Pick<ProtocolConfig, "feeBps">): number {
  return Math.floor((amount * cfg.feeBps) / 10_000);
}

/** Bond is returned if the verdict gives the raiser at least half. */
export function raiserKeepsBond(c: Pick<DisputeCase, "raiserRole">, ruling: Bps): boolean {
  return c.raiserRole === "freelancer" ? ruling >= 5000 : 10_000 - ruling >= 5000;
}

export const SEAT_LABELS: Record<string, string> = {
  A: "Seat A · most capable model, neutral rubric",
  B: "Seat B · different model, neutral rubric",
  C: "Seat C · skeptic prompt",
};

export const CASE_STATUS_LABEL: Record<DisputeCase["status"], string> = {
  evidence: "Evidence",
  aiEvaluation: "AI evaluation",
  arbitration: "Arbitration",
  tieBreak: "Tie-break",
  appealWindow: "Appeal window",
  appealed: "Appealed",
  settled: "Settled",
  defaulted: "Default outcome",
};
