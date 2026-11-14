import { describe, expect, it } from "vitest";
import { ACCOUNT_HANDLERS } from "../src/handlers/accounts";
import { EVENT_HANDLERS } from "../src/handlers/events";
import type { EventContext } from "../src/handlers/types";
import { DEFAULT_PUBKEY, profilePda } from "../src/handlers/util";
import { pk, programIds } from "./helpers";

const ctx: EventContext = { signature: "sig", slot: 500, blockTime: 1_700_000_500, programIds };

describe("event handlers", () => {
  it("GigCreated drafts a gig with no freelancer", () => {
    const d = { gig: "G", id: 1, client: "C", freelancer: DEFAULT_PUBKEY, created_at: 100 };
    const h = EVENT_HANDLERS["gig.GigCreated"]!;
    expect(h.mutations(d, ctx)).toEqual([
      { table: "gigs", key: "G", set: { id: 1, client: "C", freelancer: null, status: "draft", created_at: 100, updated_at: 100 } },
    ]);
    expect(h.activity(d, ctx).actors).toEqual(["C"]);
  });

  it("GigUpdated parses the comma-separated skills string", () => {
    const d = { gig: "G", id: 1, title: "T", description: "D", skills: "rust, anchor ,, solana", category: "Dev", budget: 10, deadline: 5 };
    const [m] = EVENT_HANDLERS["gig.GigUpdated"]!.mutations(d, ctx);
    expect(m!.set).toMatchObject({ skills_raw: "rust, anchor ,, solana", skills: ["rust", "anchor", "solana"], budget: 10, updated_at: ctx.blockTime });
  });

  it("status events map to domain statuses", () => {
    const d = { gig: "G", id: 1 };
    expect(EVENT_HANDLERS["gig.GigInProgress"]!.mutations(d, ctx)[0]!.set!.status).toBe("inProgress");
    expect(EVENT_HANDLERS["gig.GigCancelled"]!.mutations(d, ctx)[0]!.set!.status).toBe("cancelled");
  });

  it("release events increment released and DeliverySubmitted records the slot", () => {
    const d = { gig: "G", milestone: "M", amount_released: 300, approved_at: 9 };
    expect(EVENT_HANDLERS["escrow.MilestoneApproved"]!.mutations(d, ctx)).toEqual([
      { table: "milestones", key: "M", set: { gig: "G", status: "completed", approved_at: 9 }, inc: { released: 300 } },
    ]);
    const sub = EVENT_HANDLERS["escrow.DeliverySubmitted"]!.mutations({ gig: "G", milestone: "M", submitted_at: 7 }, ctx);
    expect(sub[0]!.set).toMatchObject({ status: "submitted", submitted_at: 7, submitted_slot: 500 });
  });

  it("MilestoneCancelledBeforeFunding removes the closed milestone", () => {
    expect(EVENT_HANDLERS["escrow.MilestoneCancelledBeforeFunding"]!.mutations({ gig: "G", milestone: "M", index: 0 }, ctx)).toEqual([
      { table: "milestones", key: "M", remove: true },
    ]);
  });

  it("RatingSubmitted writes the rating and updates the freelancer's profile PDA", () => {
    const freelancer = pk().toBase58();
    const d = { rating: "R", job_id: 4, client: "C", freelancer, score: 5, new_average_rating: 480 };
    const [rating, profile] = EVENT_HANDLERS["reputation.RatingSubmitted"]!.mutations(d, ctx);
    expect(rating).toMatchObject({ table: "ratings", key: "R", set: { score: 5, job_id: 4 } });
    expect(profile).toEqual({
      table: "profiles",
      key: profilePda(freelancer, programIds.reputation),
      set: { authority: freelancer, average_rating: 480 },
      inc: { rating_sum: 5, rating_count: 1 },
    });
  });

  it("receipts are plain language with formatted amounts", () => {
    const a = EVENT_HANDLERS["escrow.MilestoneFunded"]!.activity({ gig: "G", milestone: "M", amount: 1_500_000 }, ctx);
    expect(a).toMatchObject({ gig: "G", milestone: "M", amount: 1_500_000 });
    expect(a.receipt).toContain("1.50");
  });
});

describe("account handlers", () => {
  it("Milestone maps zero timestamps to null and lower-cases the status", () => {
    const [m] = ACCOUNT_HANDLERS["escrow.Milestone"]!(
      { gig: "G", index: 1, amount: 100, released: 0, status: "PendingFunding", submitted_at: 0, approved_at: 0, bump: 1 },
      { address: "M", slot: 9, programIds },
    );
    expect(m).toEqual({
      table: "milestones",
      key: "M",
      set: { gig: "G", index: 1, amount: 100, released: 0, status: "pendingFunding", submitted_at: null, approved_at: null },
    });
  });

  it("Milestone picks up extended-program fields when the account has them", () => {
    const [m] = ACCOUNT_HANDLERS["escrow.Milestone"]!(
      { gig: "G", index: 0, amount: 1, released: 0, status: "Funded", submitted_at: 0, approved_at: 0, spec_hash: [0xab, 0xcd], terms_accepted: true },
      { address: "M", slot: 9, programIds },
    );
    expect(m!.set).toMatchObject({ spec_hash: "abcd", terms_accepted: true });
  });

  it("UserProfile carries every v1 counter", () => {
    const [p] = ACCOUNT_HANDLERS["reputation.UserProfile"]!(
      {
        authority: "A",
        completed_jobs: 3,
        successful_jobs: 2,
        cancelled_jobs: 1,
        total_earnings: 10,
        rating_sum: 14,
        rating_count: 3,
        average_rating: 466,
        reputation_score: 512,
        badges_earned: 1,
        created_at: 1,
        updated_at: 2,
        bump: 255,
      },
      { address: "P", slot: 9, programIds },
    );
    expect(Object.keys(p!.set!)).not.toContain("on_time_jobs");
    expect(p!.set).toMatchObject({ authority: "A", reputation_score: 512, average_rating: 466 });
  });
});
