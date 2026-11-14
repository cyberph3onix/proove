import { formatUsdc, shortAddress } from "@proove/types/format";
import type { PlainRecord } from "../decode";
import type { IndexedProgram } from "../programs";
import type { EventHandler, Mutation } from "./types";
import { num, parseSkills, profilePda, pubkeyOrNull, str } from "./util";

/**
 * Event handlers keyed by `${program}.${EventName}` (names as in the IDL).
 *
 * Adding an event: copy the new IDL into src/idl, then add an entry here that
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

const escrowHandlers: Record<string, EventHandler> = {
  MilestoneCreated: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `Milestone ${num(d.index) + 1} created for ${formatUsdc(num(d.amount))}.`,
    }),
    mutations: (d, ctx) => [milestone(d, { index: num(d.index), amount: num(d.amount), status: "pendingFunding", created_at: ctx.blockTime })],
  },
  MilestoneFunded: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      amount: num(d.amount),
      receipt: `${formatUsdc(num(d.amount))} locked in escrow for a milestone.`,
    }),
    mutations: (d, ctx) => [milestone(d, { amount: num(d.amount), status: "funded", funded_at: ctx.blockTime })],
  },
  DeliverySubmitted: {
    activity: (d) => ({
      actors: [],
      gig: str(d.gig),
      milestone: str(d.milestone),
      receipt: "Delivery committed on-chain. The partial-release clock started.",
    }),
    // submitted_slot is not in the v1 event; the transaction's slot is the same value.
    mutations: (d, ctx) => [milestone(d, { status: "submitted", submitted_at: num(d.submitted_at), submitted_slot: ctx.slot })],
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
    mutations: (d) => [milestone(d, { status: "completed" }, { released: num(d.amount_released) })],
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
};

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

