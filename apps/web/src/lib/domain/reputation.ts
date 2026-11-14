import type { BadgeType, UserProfile } from "./types";

/**
 * TypeScript port of the reputation program's `compute_reputation_score`.
 * Keep in lockstep with programs/reputation/src/utils.rs: anyone must be
 * able to recompute the on-chain score from the stored counters.
 */
export const RATING_SCALE = 100;
export const VOLUME_SCORE_CAP = 100;
export const EARNINGS_SCORE_CAP = 1_000_000_000;
export const CANCELLATION_PENALTY_PER_JOB = 5;
export const MAX_REPUTATION_SCORE = 1000;

export interface ScoreBreakdown {
  successRate: number;
  ratingScore: number;
  volumeScore: number;
  earningsScore: number;
  cancellationPenalty: number;
  total: number;
}

export function scoreBreakdown(p: Pick<UserProfile, "completedJobs" | "successfulJobs" | "cancelledJobs" | "totalEarnings" | "averageRating">): ScoreBreakdown {
  const successRate = p.completedJobs === 0 ? 0 : Math.floor((p.successfulJobs * 100) / p.completedJobs);
  const ratingScore = Math.min(100, Math.floor(p.averageRating / 5));
  const volumeScore = Math.min(p.completedJobs, VOLUME_SCORE_CAP);
  const earningsScore = Math.floor((Math.min(p.totalEarnings, EARNINGS_SCORE_CAP) * 100) / EARNINGS_SCORE_CAP);
  const cancellationPenalty = Math.min(p.cancelledJobs * CANCELLATION_PENALTY_PER_JOB, 200);
  const weighted = successRate * 3 + ratingScore * 3 + volumeScore * 2 + earningsScore * 2;
  const total = Math.min(Math.max(0, weighted - cancellationPenalty * 2), MAX_REPUTATION_SCORE);
  return { successRate, ratingScore, volumeScore, earningsScore, cancellationPenalty, total };
}

export function computeReputationScore(p: Parameters<typeof scoreBreakdown>[0]): number {
  return scoreBreakdown(p).total;
}

export function averageRating(ratingSum: number, ratingCount: number): number {
  return ratingCount === 0 ? 0 : Math.floor((ratingSum * RATING_SCALE) / ratingCount);
}

/**
 * v2 eligibility: FastDeliverer and TrustedFreelancer become awardable now
 * that escrow reports on-time delivery and dispute outcomes.
 */
export function isEligibleForBadge(p: UserProfile, badge: BadgeType): boolean {
  switch (badge) {
    case "FirstGig":
      return p.completedJobs >= 1;
    case "TenCompletedJobs":
      return p.completedJobs >= 10;
    case "HundredCompletedJobs":
      return p.completedJobs >= 100;
    case "FiveStarPerformer":
      return p.ratingCount >= 5 && p.averageRating >= 500;
    case "TopRated":
      return p.ratingCount >= 10 && p.averageRating >= 450;
    case "FastDeliverer":
      return p.completedJobs >= 5 && p.onTimeJobs * 100 >= p.completedJobs * 90;
    case "TrustedFreelancer":
      return p.completedJobs >= 10 && p.disputesLost * 20 <= p.completedJobs && p.averageRating >= 450;
  }
}

export const BADGE_META: Record<BadgeType, { label: string; description: string }> = {
  FirstGig: { label: "First Gig", description: "Completed a first paid job" },
  TenCompletedJobs: { label: "Ten Jobs", description: "10 completed jobs" },
  HundredCompletedJobs: { label: "Hundred Jobs", description: "100 completed jobs" },
  FiveStarPerformer: { label: "Five-Star Performer", description: "5.0★ across 5+ ratings" },
  TrustedFreelancer: { label: "Trusted Freelancer", description: "10+ jobs, ≤5% disputes lost, 4.5★+" },
  FastDeliverer: { label: "Fast Deliverer", description: "90%+ of 5+ jobs delivered on time" },
  TopRated: { label: "Top Rated", description: "4.5★+ across 10+ ratings" },
};

export const ALL_BADGES = Object.keys(BADGE_META) as BadgeType[];

/** Phase-3 voter weight: floor(sqrt(score)) × min(jobs, 50) / 50. */
export function voterWeight(p: Pick<UserProfile, "reputationScore" | "completedJobs">): number {
  return Math.floor((Math.floor(Math.sqrt(p.reputationScore)) * Math.min(p.completedJobs, 50)) / 50);
}
