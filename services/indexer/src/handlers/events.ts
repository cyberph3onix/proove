import { formatBps, formatDuration, formatUsdc, isZeroHash, shortAddress, shortHash } from "@proove/types/format";
import { ZERO_HASH } from "@proove/types/types";
import type { PlainRecord } from "../decode";
import { IDL_BY_PROGRAM, idlAccountHasField, type IndexedProgram } from "../programs";
import type { ColumnValue, EventHandler, Mutation } from "./types";
import { hash32, num, parseSkills, profilePda, protocolConfigPda, pubkeyOrNull, str } from "./util";

/**
 * Event handlers keyed by `${program}.${EventName}` (names as in the IDL).
 *
 * Adding an event: regenerate `@proove/idl`, then add an entry here that
 * says which feed row it produces (`activity`) and which entity columns it
 * writes (`mutations`). Unknown events are still stored in `events` with
 * their decoded data; they just do not touch entity tables.
 */
export type HandlerKey = `${IndexedProgram}.${string}`;

const gigStatus =
  (status: string, verb: string): EventHandler => ({
    activity: (d) => ({ actors: [], gig: str(d.gig), receipt: `Gig #${num(d.id)} ${verb}.` }),
    mutations: (d, ctx) => [{ table: "gigs", key: str(d.gig), set: { id: num(d.id), status, ...(ctx.blockTime ? { updated_at: ctx.blockTime } : {}) } }],
  });

const gigHandlers: Record<string, EventHandler> = {
  GigCreated: {
    activity: (d) => ({ actors: [str(d.client)], gig: str(d.gig), receipt: `${shortAddress(str(d.client))} drafted gig #${num(d.id)}.` }),
    mutations: (d) => [
      {
        table: "gigs",
        key: str(d.gig),
        set: {
          id: num(d.id),
          client: str(d.client),
          freelancer: pubkeyOrNull(d.freelancer),
          status: "draft",
          created_at: num(d.created_at),
          updated_at: num(d.created_at),
        },
      },
    ],
  },
  GigUpdated: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      amount: num(d.budget),
      receipt: `Gig “${str(d.title)}” updated with a ${formatUsdc(num(d.budget))} budget.`,
    }),
    mutations: (d, ctx) => [
      {
        table: "gigs",
        key: str(d.gig),
        set: {
          id: num(d.id),
          title: str(d.title),
          description: str(d.description),
          skills_raw: str(d.skills),
          skills: parseSkills(str(d.skills)),
          category: str(d.category),
          budget: num(d.budget),
          deadline: num(d.deadline),
          ...(ctx.blockTime ? { updated_at: ctx.blockTime } : {}),
        },
      },
    ],
  },
  GigPublished: gigStatus("published", "was published"),
  FreelancerAssigned: {
    activity: (d) => ({
      actors: [str(d.freelancer)],
      gig: str(d.gig),
      receipt: `${shortAddress(str(d.freelancer))} was assigned to gig #${num(d.id)}.`,
    }),
    mutations: (d) => [{ table: "gigs", key: str(d.gig), set: { id: num(d.id), freelancer: str(d.freelancer), status: "assigned" } }],
  },
  GigInProgress: gigStatus("inProgress", "is in progress: its first milestone was funded"),
  GigCompleted: gigStatus("completed", "is complete: every milestone has settled"),
  GigArchived: gigStatus("archived", "was archived"),
  GigCancelled: gigStatus("cancelled", "was cancelled before any funds were locked"),
};

const milestone = (d: PlainRecord, set: Mutation["set"], inc?: Mutation["inc"]): Mutation => ({
  table: "milestones",
  key: str(d.milestone),
  set: { gig: str(d.gig), ...set },
  ...(inc ? { inc } : {}),
});

/** Terms a milestone snapshots from `ProtocolConfig` when it is funded (milestone column -> config column). */
const SNAPSHOT_TERMS = { partial_timeout: "partial_timeout", full_timeout: "full_timeout", partial_bps: "partial_bps", fee_bps: "fee_bps" };

const escrowHandlers: Record<string, EventHandler> = {
  MilestoneCreated: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `Milestone ${num(d.index) + 1} created for ${formatUsdc(num(d.amount))}${isZeroHash(hash32(d.spec_hash)) ? "" : ` with a committed spec (${shortHash(hash32(d.spec_hash))})`}.`,
    }),
    mutations: (d, ctx) => [
      milestone(d, {
        index: num(d.index),
        amount: num(d.amount),
        status: "pendingFunding",
        spec_hash: hash32(d.spec_hash),
        delivery_hash: ZERO_HASH,
        report_hash: ZERO_HASH,
        terms_accepted: false,
        fees_paid: 0,
        refunded: 0,
        created_at: ctx.blockTime,
      }),
    ],
  },
  TermsAccepted: {
    activity: (d) => ({
      actors: [str(d.freelancer)],
      gig: str(d.gig),
      milestone: str(d.milestone),
      receipt: `${shortAddress(str(d.freelancer))} accepted the milestone terms (spec ${shortHash(hash32(d.spec_hash))}).`,
    }),
    mutations: (d) => [milestone(d, { terms_accepted: true, spec_hash: hash32(d.spec_hash) })],
  },
  MilestoneFunded: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `${formatUsdc(num(d.amount))} locked in escrow for a milestone.`,
    }),
    // The event does not carry the snapshotted terms; they are the protocol
    // config in force at this slot (the Milestone account snapshot confirms them).
    mutations: (d, ctx) => [
      {
        ...milestone(d, { amount: num(d.amount), status: "funded", funded_at: ctx.blockTime }),
        copy: { table: "protocol_config", key: protocolConfigPda(ctx.programIds.escrow), columns: SNAPSHOT_TERMS },
      },
    ],
  },
  DeliverySubmitted: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      receipt: `Delivery ${shortHash(hash32(d.delivery_hash))} committed on-chain${isZeroHash(hash32(d.report_hash)) ? "" : " with a verification report"}. The partial-release clock started.`,
    }),
    mutations: (d) => [
      milestone(d, {
        status: "submitted",
        submitted_at: num(d.submitted_at),
        submitted_slot: num(d.submitted_slot),
        delivery_hash: hash32(d.delivery_hash),
        report_hash: hash32(d.report_hash),
      }),
    ],
  },
  MilestoneApproved: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount_released),
      receipt: `Client approved the milestone; ${formatUsdc(num(d.amount_released))} released to the freelancer.`,
    }),
    mutations: (d) => [milestone(d, { status: "completed", approved_at: num(d.approved_at) }, { released: num(d.amount_released) })],
  },
  PartialReleaseExecuted: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount_released),
      receipt: `No response from the client in time; ${formatUsdc(num(d.amount_released))} partially released.`,
    }),
    mutations: (d) => [milestone(d, { status: "partialReleased" }, { released: num(d.amount_released) })],
  },
  FullReleaseExecuted: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount_released),
      receipt: `Full timeout reached; the remaining ${formatUsdc(num(d.amount_released))} was released.`,
    }),
    mutations: (d, ctx) => [
      milestone(d, { status: "completed", ...(ctx.blockTime ? { approved_at: ctx.blockTime } : {}) }, { released: num(d.amount_released) }),
    ],
  },
  ProtocolFeeCollected: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `Protocol fee of ${formatUsdc(num(d.amount))} sent to the treasury.`,
    }),
    mutations: (d) => [milestone(d, {}, { fees_paid: num(d.amount) })],
  },
  RefundedAfterDeadline: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `Nothing was delivered by the deadline plus grace, so ${formatUsdc(num(d.amount))} went back to the client.`,
    }),
    mutations: (d) => [milestone(d, { status: "refunded" }, { refunded: num(d.amount) })],
  },
  MilestoneCancelledBeforeFunding: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      receipt: `Unfunded milestone ${num(d.index) + 1} was cancelled.`,
    }),
    // The program closes the milestone account.
    mutations: (d) => [{ table: "milestones", key: str(d.milestone), remove: true }],
  },
  ProtocolConfigUpdated: {
    activity: (d) => ({
      actors: [str(d.admin)],
      receipt:
        `Protocol terms set: ${formatBps(num(d.fee_bps))} fee, ${formatBps(num(d.partial_bps))} released after ${formatDuration(num(d.partial_timeout))} ` +
        `and the rest after ${formatDuration(num(d.full_timeout))} without a client response. Applies to milestones funded from now on.`,
    }),
    mutations: (d, ctx) => [
      {
        table: "protocol_config",
        key: protocolConfigPda(ctx.programIds.escrow),
        set: {
          admin: str(d.admin),
          treasury: str(d.treasury),
          partial_timeout: num(d.partial_timeout),
          full_timeout: num(d.full_timeout),
          partial_bps: num(d.partial_bps),
          fee_bps: num(d.fee_bps),
          min_milestone: num(d.min_milestone),
          no_delivery_grace: num(d.no_delivery_grace),
          ...(ctx.blockTime ? { updated_at: ctx.blockTime } : {}),
        },
      },
    ],
  },
};

/**
 * UserProfile counters the extended reputation program adds. Until the IDL
 * carries them they stay NULL; once it does, new profiles start them at 0 and
 * events/accounts that include them write them.
 */
export const EXTENDED_PROFILE_COUNTERS = ["on_time_jobs", "disputes_won", "disputes_lost"] as const;

function extendedCounters(d: PlainRecord | null): Record<string, ColumnValue> {
  return Object.fromEntries(
    EXTENDED_PROFILE_COUNTERS.filter((c) => (d ? c in d : idlAccountHasField(IDL_BY_PROGRAM.reputation, "UserProfile", c))).map((c) => [
      c,
      d ? num(d[c]) : 0,
    ]),
  );
}

const reputationHandlers: Record<string, EventHandler> = {
  ProfileCreated: {
    activity: (d) => ({ actors: [str(d.authority)], receipt: `${shortAddress(str(d.authority))} created a reputation profile.` }),
    mutations: (d) => [
      {
        table: "profiles",
        key: str(d.profile),
        set: {
          authority: str(d.authority),
          completed_jobs: 0,
          successful_jobs: 0,
          cancelled_jobs: 0,
          total_earnings: 0,
          rating_sum: 0,
          rating_count: 0,
          average_rating: 0,
          reputation_score: 0,
          badges_earned: 0,
          ...extendedCounters(null),
          created_at: num(d.created_at),
          updated_at: num(d.created_at),
        },
      },
    ],
  },
  RatingSubmitted: {
    activity: (d) => ({
      actors: [str(d.client), str(d.freelancer)],
      receipt: `${shortAddress(str(d.client))} rated ${shortAddress(str(d.freelancer))} ${num(d.score)}★ for job #${num(d.job_id)}.`,
    }),
    mutations: (d, ctx): Mutation[] => [
      {
        table: "ratings",
        key: str(d.rating),
        set: { job_id: num(d.job_id), client: str(d.client), freelancer: str(d.freelancer), score: num(d.score), submitted_at: ctx.blockTime },
      },
      {
        table: "profiles",
        key: profilePda(str(d.freelancer), ctx.programIds.reputation),
        set: { authority: str(d.freelancer), average_rating: num(d.new_average_rating) },
        inc: { rating_sum: num(d.score), rating_count: 1 },
      },
    ],
  },
  CompletionUpdated: {
    activity: (d) => ({
      actors: [],
      amount: num(d.total_earnings),
      receipt: `Reputation updated: ${num(d.completed_jobs)} completed jobs, score ${num(d.reputation_score)}.`,
    }),
    mutations: (d, ctx) => [
      {
        table: "profiles",
        key: str(d.profile),
        set: {
          completed_jobs: num(d.completed_jobs),
          successful_jobs: num(d.successful_jobs),
          total_earnings: num(d.total_earnings),
          reputation_score: num(d.reputation_score),
          ...extendedCounters(d),
          ...(ctx.blockTime ? { updated_at: ctx.blockTime } : {}),
        },
      },
    ],
  },
  BadgeAwarded: {
    activity: (d) => ({ actors: [], receipt: `Profile ${shortAddress(str(d.profile))} earned the ${str(d.badge_type)} badge.` }),
    mutations: (d) => [
      { table: "badges", key: str(d.badge), set: { profile: str(d.profile), badge_type: str(d.badge_type), issued_at: num(d.issued_at) } },
      { table: "profiles", key: str(d.profile), inc: { badges_earned: 1 } },
    ],
  },
  ProfileUpdated: {
    activity: (d) => ({ actors: [], receipt: `Profile ${shortAddress(str(d.profile))} reputation score is now ${num(d.reputation_score)}.` }),
    mutations: (d) => [{ table: "profiles", key: str(d.profile), set: { reputation_score: num(d.reputation_score), updated_at: num(d.updated_at) } }],
  },
};

const achievementHandlers: Record<string, EventHandler> = {
  AchievementClaimed: {
    activity: (d) => ({ actors: [str(d.owner)], receipt: `${shortAddress(str(d.owner))} minted the ${str(d.badge_type)} badge as an NFT.` }),
    mutations: (d) => [
      {
        table: "achievements",
        key: str(d.achievement),
        set: { owner: str(d.owner), badge_type: str(d.badge_type), mint: str(d.mint), claimed: true, claimed_at: num(d.claimed_at) },
      },
    ],
  },
};

function prefixed(program: IndexedProgram, handlers: Record<string, EventHandler>): Record<HandlerKey, EventHandler> {
  return Object.fromEntries(Object.entries(handlers).map(([name, h]) => [`${program}.${name}`, h]));
}

export const EVENT_HANDLERS: Record<HandlerKey, EventHandler> = {
  ...prefixed("gig", gigHandlers),
  ...prefixed("escrow", escrowHandlers),
  ...prefixed("reputation", reputationHandlers),
  ...prefixed("achievement", achievementHandlers),
};

/** Fallback for events with no handler yet: stored in the feed, no entity writes. */
export const UNKNOWN_EVENT: EventHandler = {
  activity: (d) => ({
    actors: [],
    gig: typeof d.gig === "string" ? d.gig : undefined,
    milestone: typeof d.milestone === "string" ? d.milestone : undefined,
    receipt: "",
  }),
  mutations: () => [],
};

