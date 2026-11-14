import type { IndexedProgram } from "../programs";
import type { AccountHandler, Mutation } from "./types";
import { hash32, hex, lowerFirst, num, parseSkills, pubkeyOrNull, str, time } from "./util";

/**
 * Account snapshot handlers keyed by `${program}.${AccountName}` (IDL names).
 * Used by the `getProgramAccounts` backfill: each decoded account overwrites
 * every column it carries, stamped with the RPC context slot, so reputation
 * and other state are read from accounts rather than replayed from events.
 * Accounts with no entry (AchievementConfig) are skipped.
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
  "escrow.Milestone": (d, { address }) => {
    const funded = num(d.funded_at) !== 0;
    return [
      {
        table: "milestones",
        key: address,
        set: {
          gig: str(d.gig),
          index: num(d.index),
          amount: num(d.amount),
          released: num(d.released),
          fees_paid: num(d.fees_paid),
          refunded: num(d.refunded),
          status: lowerFirst(d.status),
          spec_hash: hash32(d.spec_hash),
          delivery_hash: hash32(d.delivery_hash),
          report_hash: hash32(d.report_hash),
          terms_accepted: Boolean(d.terms_accepted),
          funded_at: time(d.funded_at),
          submitted_at: time(d.submitted_at),
          submitted_slot: num(d.submitted_slot) || null,
          approved_at: time(d.approved_at),
          // Terms are snapshotted at funding; before that the fields are zero.
          partial_timeout: funded ? num(d.partial_timeout) : null,
          full_timeout: funded ? num(d.full_timeout) : null,
          partial_bps: funded ? num(d.partial_bps) : null,
          fee_bps: funded ? num(d.fee_bps) : null,
        },
      },
    ];
  },
  "escrow.EscrowVault": (d, { address }): Mutation[] => [
    {
      table: "vaults",
      key: address,
      set: {
        gig: str(d.gig),
        token_account: pubkeyOrNull(d.token_account),
        mint: pubkeyOrNull(d.mint),
        total_locked: num(d.total_locked),
        total_released: num(d.total_released),
        total_fees: num(d.total_fees),
        total_refunded: num(d.total_refunded),
        milestone_count: num(d.milestone_count),
        active_milestone: num(d.active_milestone),
        cancelled_milestones: num(d.cancelled_milestones),
        refunded_milestones: num(d.refunded_milestones),
        late_deliveries: num(d.late_deliveries),
        reputation_synced: Boolean(d.reputation_synced),
      },
    },
    // The vault learns the mint at first funding; the gig row needs it too.
    ...(pubkeyOrNull(d.mint) ? [{ table: "gigs" as const, key: str(d.gig), set: { mint: pubkeyOrNull(d.mint) } }] : []),
  ],
  "escrow.ProtocolConfig": (d, { address }) => [
    {
      table: "protocol_config",
      key: address,
      set: {
        admin: str(d.admin),
        treasury: str(d.treasury),
        partial_timeout: num(d.partial_timeout),
        full_timeout: num(d.full_timeout),
        partial_bps: num(d.partial_bps),
        fee_bps: num(d.fee_bps),
        min_milestone: num(d.min_milestone),
        no_delivery_grace: num(d.no_delivery_grace),
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
        // Extended reputation counters: written once the IDL (so the decoded account) carries them.
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
