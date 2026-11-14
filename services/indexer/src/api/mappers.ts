import type { ChainEvent, GigStatus, MilestoneStatus, MilestoneTerms, ProgramName } from "@proove/types/types";

/**
 * API shapes. They follow the `@proove/types` domain types so the web app's
 * `use-chain` hook can swap its mock source for this API, with two
 * differences: every row carries the `slot` it was last written at, and
 * values the indexer has not seen yet are `null` (e.g. milestone `title`,
 * which is off-chain, or `terms` before funding).
 */
export interface ApiGig {
  address: string;
  id: number | null;
  client: string | null;
  freelancer: string | null;
  /** Only known from a Gig or EscrowVault account snapshot (events do not carry it). */
  mint: string | null;
  status: GigStatus;
  createdAt: number | null;
  updatedAt: number | null;
  title: string;
  description: string;
  skills: string[];
  category: string;
  budget: number;
  deadline: number | null;
  applicants: string[];
  brief?: string;
  slot: number;
}

export interface ApiMilestone {
  address: string;
  gig: string | null;
  index: number | null;
  title: string | null;
  amount: number;
  released: number;
  feesPaid: number | null;
  refunded: number | null;
  status: MilestoneStatus;
  specHash: string | null;
  deliveryHash: string | null;
  reportHash: string | null;
  termsAccepted: boolean | null;
  createdAt: number | null;
  fundedAt: number | null;
  submittedAt: number | null;
  submittedSlot: number | null;
  approvedAt: number | null;
  terms: MilestoneTerms | null;
  slot: number;
}

export type ApiChainEvent = ChainEvent & { eventIndex: number };

/** Escrow `EscrowVault` totals for a gig (from account snapshots). */
export interface ApiVault {
  address: string;
  tokenAccount: string | null;
  mint: string | null;
  totalLocked: number;
  totalReleased: number;
  totalFees: number;
  totalRefunded: number;
  milestoneCount: number;
  activeMilestone: number;
  cancelledMilestones: number;
  refundedMilestones: number;
  lateDeliveries: number;
  reputationSynced: boolean;
  slot: number;
}

export function toVault(r: Row): ApiVault {
  return {
    address: r.address,
    tokenAccount: r.token_account,
    mint: r.mint,
    totalLocked: r.total_locked,
    totalReleased: r.total_released,
    totalFees: r.total_fees,
    totalRefunded: r.total_refunded,
    milestoneCount: r.milestone_count,
    activeMilestone: r.active_milestone,
    cancelledMilestones: r.cancelled_milestones,
    refundedMilestones: r.refunded_milestones,
    lateDeliveries: r.late_deliveries,
    reputationSynced: r.reputation_synced,
    slot: r.slot,
  };
}

type Row = Record<string, any>;

export function toGig(r: Row): ApiGig {
  return {
    address: r.address,
    id: r.id,
    client: r.client,
    freelancer: r.freelancer,
    mint: r.mint,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    title: r.title,
    description: r.description,
    skills: r.skills,
    category: r.category,
    budget: r.budget,
    deadline: r.deadline,
    applicants: r.applicants,
    ...(r.brief != null ? { brief: r.brief } : {}),
    slot: r.slot,
  };
}

export function toMilestone(r: Row): ApiMilestone {
  const hasTerms = r.partial_timeout != null && r.full_timeout != null && r.partial_bps != null && r.fee_bps != null;
  return {
    address: r.address,
    gig: r.gig,
    index: r.index,
    title: r.title,
    amount: r.amount,
    released: r.released,
    feesPaid: r.fees_paid,
    refunded: r.refunded,
    status: r.status,
    specHash: r.spec_hash,
    deliveryHash: r.delivery_hash,
    reportHash: r.report_hash,
    termsAccepted: r.terms_accepted,
    createdAt: r.created_at,
    fundedAt: r.funded_at,
    submittedAt: r.submitted_at,
    submittedSlot: r.submitted_slot,
    approvedAt: r.approved_at,
    terms: hasTerms
      ? { partialTimeout: r.partial_timeout, fullTimeout: r.full_timeout, partialBps: r.partial_bps, feeBps: r.fee_bps }
      : null,
    slot: r.slot,
  };
}

export function toChainEvent(r: Row): ApiChainEvent {
  return {
    signature: r.signature,
    eventIndex: r.event_index,
    slot: r.slot,
    blockTime: r.block_time,
    program: r.program as ProgramName,
    name: r.name,
    actors: r.actors,
    ...(r.gig ? { gig: r.gig } : {}),
    ...(r.milestone ? { milestone: r.milestone } : {}),
    ...(r.case_address ? { case: r.case_address } : {}),
    ...(r.amount != null ? { amount: r.amount } : {}),
    receipt: r.receipt,
  };
}

/** A value together with the account it was read from and the slot it was written at. */
export interface Sourced<T> {
  value: T | null;
  account: string | null;
  slot: number | null;
}

/** UserProfile counter -> profiles column. */
export const PROFILE_FIELDS = {
  completedJobs: "completed_jobs",
  successfulJobs: "successful_jobs",
  cancelledJobs: "cancelled_jobs",
  onTimeJobs: "on_time_jobs",
  totalEarnings: "total_earnings",
  ratingSum: "rating_sum",
  ratingCount: "rating_count",
  averageRating: "average_rating",
  reputationScore: "reputation_score",
  badgesEarned: "badges_earned",
  disputesWon: "disputes_won",
  disputesLost: "disputes_lost",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

/** ProtocolConfig field -> protocol_config column (the `ProtocolConfig` domain type plus admin/treasury). */
export const PROTOCOL_FIELDS = {
  admin: "admin",
  treasury: "treasury",
  partialTimeout: "partial_timeout",
  fullTimeout: "full_timeout",
  partialBps: "partial_bps",
  feeBps: "fee_bps",
  minMilestone: "min_milestone",
  noDeliveryGrace: "no_delivery_grace",
  updatedAt: "updated_at",
} as const;

export function sourced(r: Row, column: string, account: string): Sourced<any> {
  const value = r[column] ?? null;
  const slot = (r.field_slots as Record<string, number>)[column];
  if (value === null || slot === undefined) return { value: null, account: null, slot: null };
  return { value, account, slot };
}

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}

export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
