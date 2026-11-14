import type { IndexedProgram } from "../programs";
import type { AccountHandler } from "./types";
import { hex, lowerFirst, num, parseSkills, pubkeyOrNull, str, time } from "./util";

/**
 * Account snapshot handlers keyed by `${program}.${AccountName}` (IDL names).
 * Used by the `getProgramAccounts` backfill: each decoded account overwrites
 * every column it carries, stamped with the RPC context slot, so reputation
 * and other state are read from accounts rather than replayed from events.
 * Accounts with no entry (EscrowVault, AchievementConfig) are skipped.
 */
export const ACCOUNT_HANDLERS: Partial<Record<`${IndexedProgram}.${string}`, AccountHandler>> = {
  "gig.Gig": (d, { address }) => [
    {
      table: "gigs",
      key: address,
      set: {
        id: num(d.id),
        client: str(d.client),
        freelancer: pubkeyOrNull(d.freelancer),
        mint: pubkeyOrNull(d.mint),
        status: lowerFirst(d.status),
        created_at: num(d.created_at),
        updated_at: num(d.updated_at),
        title: str(d.title),
        description: str(d.description),
        skills_raw: str(d.skills),
        skills: parseSkills(str(d.skills)),
        category: str(d.category),
        budget: num(d.budget),
        deadline: num(d.deadline),
      },
    },
  ],
  "escrow.Milestone": (d, { address }) => [
    {
      table: "milestones",
      key: address,
      set: {
        gig: str(d.gig),
        index: num(d.index),
        amount: num(d.amount),
        released: num(d.released),
        status: lowerFirst(d.status),
        submitted_at: time(d.submitted_at),
        approved_at: time(d.approved_at),
        // Fields the extended program adds; absent (left untouched) on v1 accounts.
        ...("spec_hash" in d ? { spec_hash: hex(d.spec_hash) } : {}),
        ...("delivery_hash" in d ? { delivery_hash: hex(d.delivery_hash) } : {}),
        ...("report_hash" in d ? { report_hash: hex(d.report_hash) } : {}),
        ...("terms_accepted" in d ? { terms_accepted: Boolean(d.terms_accepted) } : {}),
        ...("submitted_slot" in d ? { submitted_slot: num(d.submitted_slot) || null } : {}),
        ...("fees_paid" in d ? { fees_paid: num(d.fees_paid) } : {}),
        ...("refunded" in d ? { refunded: num(d.refunded) } : {}),
      },
    },
  ],
  "reputation.UserProfile": (d, { address }) => [
    {
      table: "profiles",
      key: address,
      set: {
        authority: str(d.authority),
        completed_jobs: num(d.completed_jobs),
        successful_jobs: num(d.successful_jobs),
        cancelled_jobs: num(d.cancelled_jobs),
        total_earnings: num(d.total_earnings),
        rating_sum: num(d.rating_sum),
        rating_count: num(d.rating_count),
        average_rating: num(d.average_rating),
        reputation_score: num(d.reputation_score),
        badges_earned: num(d.badges_earned),
        created_at: num(d.created_at),
        updated_at: num(d.updated_at),
        ...("on_time_jobs" in d ? { on_time_jobs: num(d.on_time_jobs) } : {}),
        ...("disputes_won" in d ? { disputes_won: num(d.disputes_won) } : {}),
        ...("disputes_lost" in d ? { disputes_lost: num(d.disputes_lost) } : {}),
      },
    },
  ],
  "reputation.Rating": (d, { address }) => [
    {
      table: "ratings",
      key: address,
      set: {
        job_id: num(d.job_id),
        client: str(d.client),
        freelancer: str(d.freelancer),
        score: num(d.score),
        review_hash: hex(d.review_hash),
        submitted_at: num(d.submitted_at),
        ...("gig" in d ? { gig: str(d.gig) } : {}),
      },
    },
  ],
  "reputation.Badge": (d, { address }) => [
    {
      table: "badges",
      key: address,
      set: { profile: str(d.profile), badge_type: str(d.badge_type), issuer: str(d.issuer), issued_at: num(d.issued_at), metadata: str(d.metadata) },
    },
  ],
  "achievement.Achievement": (d, { address }) => [
    {
      table: "achievements",
      key: address,
      set: { owner: str(d.owner), badge_type: str(d.badge_type), mint: str(d.mint), claimed: Boolean(d.claimed), claimed_at: time(d.claimed_at) },
    },
  ],
};
