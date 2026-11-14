import type { Address } from "@proove/types/types";
import type { ProgramIds } from "@proove/config";
import type { PlainRecord } from "../decode";

/** Entity tables and their primary-key column. Columns are listed so writes are checked against them. */
export const TABLES = {
  gigs: {
    key: "address",
    columns: [
      "id", "client", "freelancer", "mint", "status", "created_at", "updated_at", "title", "description",
      "skills_raw", "skills", "category", "budget", "deadline",
    ],
  },
  milestones: {
    key: "address",
    columns: [
      "gig", "index", "title", "amount", "released", "fees_paid", "refunded", "status", "spec_hash", "delivery_hash",
      "report_hash", "terms_accepted", "created_at", "funded_at", "submitted_at", "submitted_slot", "approved_at",
      "partial_timeout", "full_timeout", "partial_bps", "fee_bps",
    ],
  },
  profiles: {
    key: "account",
    columns: [
      "authority", "completed_jobs", "successful_jobs", "cancelled_jobs", "on_time_jobs", "total_earnings", "rating_sum",
      "rating_count", "average_rating", "reputation_score", "badges_earned", "disputes_won", "disputes_lost",
      "created_at", "updated_at",
    ],
  },
  ratings: {
    key: "account",
    columns: ["job_id", "gig", "client", "freelancer", "score", "review_hash", "submitted_at"],
  },
  badges: {
    key: "account",
    columns: ["profile", "badge_type", "issuer", "issued_at", "metadata"],
  },
  achievements: {
    key: "account",
    columns: ["owner", "badge_type", "mint", "claimed", "claimed_at"],
  },
} as const;

export type EntityTable = keyof typeof TABLES;
export type ColumnValue = string | number | boolean | null | string[];

/**
 * A write to one entity row, applied at a slot. `set` overwrites columns
 * whose stored slot is <= the write's slot; `inc` adds to columns whose
 * stored slot is < the write's slot (an account snapshot at or after the
 * event's slot already includes it); `remove` deletes the row (account closed).
 */
export interface Mutation {
  table: EntityTable;
  key: Address;
  set?: Record<string, ColumnValue>;
  inc?: Record<string, number>;
  remove?: boolean;
}

export interface EventContext {
  signature: string;
  slot: number;
  blockTime: number | null;
  programIds: ProgramIds;
}

/** What one event contributes to the activity feed (`ChainEvent` minus tx metadata). */
export interface ActivityInfo {
  actors: Address[];
  gig?: Address;
  milestone?: Address;
  case?: Address;
  amount?: number;
  receipt: string;
}

export interface EventHandler {
  activity(data: PlainRecord, ctx: EventContext): ActivityInfo;
  mutations(data: PlainRecord, ctx: EventContext): Mutation[];
}

export interface AccountContext {
  address: Address;
  slot: number;
  programIds: ProgramIds;
}

export type AccountHandler = (data: PlainRecord, ctx: AccountContext) => Mutation[];
