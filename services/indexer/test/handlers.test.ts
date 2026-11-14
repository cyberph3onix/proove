import { describe, expect, it } from "vitest";
import { ACCOUNT_HANDLERS } from "../src/handlers/accounts";
import { EVENT_HANDLERS } from "../src/handlers/events";
import type { EventContext } from "../src/handlers/types";
import { DEFAULT_PUBKEY, profilePda, protocolConfigPda } from "../src/handlers/util";
import { decodeAccount, decodeEventsFromLogs } from "../src/decode";
import { programById } from "../src/programs";
import { bn, encodeAccount, eventLine, invocation, pk, program, programIds, programs } from "./helpers";

const byId = programById(programs);
const bytes = (b: number) => Array<number>(32).fill(b);
/** Decode a real Anchor-encoded event, as the ingester would. */
const decodeOne = (prog: Parameters<typeof eventLine>[0], name: string, data: Record<string, unknown>) =>
  decodeEventsFromLogs(invocation(prog, [eventLine(prog, name, data)]), byId)[0]!.data;

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

  it("release events increment released (net) and fees increment fees_paid", () => {
    const d = { gig: "G", milestone: "M", amount_released: 300, approved_at: 9 };
    expect(EVENT_HANDLERS["escrow.MilestoneApproved"]!.mutations(d, ctx)).toEqual([
      { table: "milestones", key: "M", set: { gig: "G", status: "completed", approved_at: 9 }, inc: { released: 300 } },
    ]);
    const gig = pk();
    const milestone = pk();
    const fee = decodeOne("escrow", "ProtocolFeeCollected", { gig, milestone, amount: bn(3) });
    expect(EVENT_HANDLERS["escrow.ProtocolFeeCollected"]!.mutations(fee, ctx)).toEqual([
      { table: "milestones", key: milestone.toBase58(), set: { gig: gig.toBase58() }, inc: { fees_paid: 3 } },
    ]);
    expect(EVENT_HANDLERS["escrow.ProtocolFeeCollected"]!.activity(fee, ctx)).toMatchObject({ amount: 3, receipt: expect.stringContaining("treasury") });
  });

  it("MilestoneCreated commits the spec hash and zeroes the agreement fields", () => {
    const d = decodeOne("escrow", "MilestoneCreated", { gig: pk(), milestone: pk(), index: 0, amount: bn(1_000_000), spec_hash: bytes(0xab) });
    const [m] = EVENT_HANDLERS["escrow.MilestoneCreated"]!.mutations(d, ctx);
    expect(m!.set).toMatchObject({
      status: "pendingFunding",
      spec_hash: "ab".repeat(32),
      delivery_hash: "0".repeat(64),
      report_hash: "0".repeat(64),
      terms_accepted: false,
      fees_paid: 0,
      refunded: 0,
    });
    expect(EVENT_HANDLERS["escrow.MilestoneCreated"]!.activity(d, ctx).receipt).toContain("with a committed spec");
  });

  it("TermsAccepted, DeliverySubmitted and RefundedAfterDeadline decode and map", () => {
    const gig = pk();
    const milestone = pk();
    const freelancer = pk();
    const terms = decodeOne("escrow", "TermsAccepted", { gig, milestone, freelancer, spec_hash: bytes(0x11) });
    expect(EVENT_HANDLERS["escrow.TermsAccepted"]!.mutations(terms, ctx)[0]!.set).toEqual({ gig: gig.toBase58(), terms_accepted: true, spec_hash: "11".repeat(32) });
    expect(EVENT_HANDLERS["escrow.TermsAccepted"]!.activity(terms, ctx).actors).toEqual([freelancer.toBase58()]);

    const sub = decodeOne("escrow", "DeliverySubmitted", {
      gig,
      milestone,
      submitted_at: bn(7),
      submitted_slot: bn(498),
      delivery_hash: bytes(0x22),
      report_hash: bytes(0),
    });
    expect(EVENT_HANDLERS["escrow.DeliverySubmitted"]!.mutations(sub, ctx)[0]!.set).toMatchObject({
      status: "submitted",
      submitted_at: 7,
      submitted_slot: 498, // from the event, not the transaction slot
      delivery_hash: "22".repeat(32),
      report_hash: "0".repeat(64),
    });

    const refund = decodeOne("escrow", "RefundedAfterDeadline", { gig, milestone, amount: bn(5_000_000) });
    expect(EVENT_HANDLERS["escrow.RefundedAfterDeadline"]!.mutations(refund, ctx)).toEqual([
      { table: "milestones", key: milestone.toBase58(), set: { gig: gig.toBase58(), status: "refunded" }, inc: { refunded: 5_000_000 } },
    ]);
    expect(EVENT_HANDLERS["escrow.RefundedAfterDeadline"]!.activity(refund, ctx).receipt).toContain("5.00");
  });

  it("MilestoneFunded copies the terms in force from the protocol config", () => {
    const [m] = EVENT_HANDLERS["escrow.MilestoneFunded"]!.mutations({ gig: "G", milestone: "M", amount: 10 }, ctx);
    expect(m).toMatchObject({
      set: { status: "funded", funded_at: ctx.blockTime },
      copy: { table: "protocol_config", key: protocolConfigPda(programIds.escrow), columns: { partial_bps: "partial_bps", fee_bps: "fee_bps" } },
    });
  });

  it("ProtocolConfigUpdated writes the config singleton with a readable receipt", () => {
    const admin = pk();
    const d = decodeOne("escrow", "ProtocolConfigUpdated", {
      admin,
      treasury: pk(),
      partial_timeout: bn(259_200),
      full_timeout: bn(604_800),
      partial_bps: 2_500,
      fee_bps: 150,
      min_milestone: bn(1_000_000),
      no_delivery_grace: bn(86_400),
    });
    const [m] = EVENT_HANDLERS["escrow.ProtocolConfigUpdated"]!.mutations(d, ctx);
    expect(m).toMatchObject({ table: "protocol_config", key: protocolConfigPda(programIds.escrow), set: { fee_bps: 150, partial_timeout: 259_200, updated_at: ctx.blockTime } });
    expect(EVENT_HANDLERS["escrow.ProtocolConfigUpdated"]!.activity(d, ctx)).toMatchObject({
      actors: [admin.toBase58()],
      receipt: expect.stringMatching(/1\.50% fee, 25% released after 3d/),
    });
  });

  it("ProfileCreated starts the extended counters at 0 and CompletionUpdated writes them", () => {
    const profile = pk();
    const created = decodeOne("reputation", "ProfileCreated", { profile, authority: pk(), created_at: bn(1) });
    expect(EVENT_HANDLERS["reputation.ProfileCreated"]!.mutations(created, ctx)[0]!.set).toMatchObject({ on_time_jobs: 0, disputes_won: 0, disputes_lost: 0 });
    const done = decodeOne("reputation", "CompletionUpdated", {
      profile,
      completed_jobs: bn(4),
      successful_jobs: bn(3),
      total_earnings: bn(900),
      reputation_score: bn(610),
      on_time_jobs: bn(2),
      disputes_won: bn(1),
      disputes_lost: bn(0),
    });
    expect(EVENT_HANDLERS["reputation.CompletionUpdated"]!.mutations(done, ctx)[0]!.set).toMatchObject({
      completed_jobs: 4,
      on_time_jobs: 2,
      disputes_won: 1,
      disputes_lost: 0,
    });
  });

  it("CompletionUpdated leaves extended counters alone when the event lacks them", () => {
    const set = EVENT_HANDLERS["reputation.CompletionUpdated"]!.mutations(
      { profile: "P", completed_jobs: 1, successful_jobs: 1, total_earnings: 1, reputation_score: 1 },
      ctx,
    )[0]!.set!;
    expect(Object.keys(set)).not.toContain("on_time_jobs");
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

const milestoneAccount = (over: Record<string, unknown> = {}) => ({
  gig: pk(),
  index: 1,
  amount: bn(100),
  released: bn(0),
  status: { PendingFunding: {} },
  submitted_at: bn(0),
  approved_at: bn(0),
  bump: 1,
  spec_hash: bytes(0),
  delivery_hash: bytes(0),
  report_hash: bytes(0),
  terms_accepted: false,
  submitted_slot: bn(0),
  funded_at: bn(0),
  partial_timeout: bn(0),
  full_timeout: bn(0),
  partial_bps: 0,
  fee_bps: 0,
  fees_paid: bn(0),
  refunded: bn(0),
  ...over,
});

const decodedAccount = async (prog: Parameters<typeof encodeAccount>[0], name: string, data: Record<string, unknown>) =>
  decodeAccount(program(prog), await encodeAccount(prog, name, data))!.data;

describe("account handlers", () => {
  it("Milestone maps zero timestamps/slots to null, leaves terms null before funding, lower-cases the status", async () => {
    const d = await decodedAccount("escrow", "Milestone", milestoneAccount());
    const [m] = ACCOUNT_HANDLERS["escrow.Milestone"]!(d, { address: "M", slot: 9, programIds });
    expect(m!.set).toMatchObject({
      index: 1,
      amount: 100,
      status: "pendingFunding",
      submitted_at: null,
      submitted_slot: null,
      approved_at: null,
      funded_at: null,
      partial_timeout: null,
      fee_bps: null,
      fees_paid: 0,
      refunded: 0,
      spec_hash: "0".repeat(64),
      terms_accepted: false,
    });
  });

  it("Milestone carries hashes, snapshotted terms and accounting once funded", async () => {
    const d = await decodedAccount(
      "escrow",
      "Milestone",
      milestoneAccount({
        status: { Disputed: {} },
        spec_hash: bytes(0xab),
        delivery_hash: bytes(0xcd),
        terms_accepted: true,
        submitted_slot: bn(1234),
        funded_at: bn(50),
        partial_timeout: bn(10),
        full_timeout: bn(20),
        partial_bps: 2_500,
        fee_bps: 100,
        fees_paid: bn(2),
        refunded: bn(7),
      }),
    );
    const [m] = ACCOUNT_HANDLERS["escrow.Milestone"]!(d, { address: "M", slot: 9, programIds });
    expect(m!.set).toMatchObject({
      status: "disputed",
      spec_hash: "ab".repeat(32),
      delivery_hash: "cd".repeat(32),
      terms_accepted: true,
      submitted_slot: 1234,
      funded_at: 50,
      partial_timeout: 10,
      full_timeout: 20,
      partial_bps: 2_500,
      fee_bps: 100,
      fees_paid: 2,
      refunded: 7,
    });
  });

  it("maps every new MilestoneStatus variant to the domain string", async () => {
    for (const [variant, status] of [["Refunded", "refunded"], ["Disputed", "disputed"], ["Resolved", "resolved"]] as const) {
      const d = await decodedAccount("escrow", "Milestone", milestoneAccount({ status: { [variant]: {} } }));
      expect(ACCOUNT_HANDLERS["escrow.Milestone"]!(d, { address: "M", slot: 1, programIds })[0]!.set!.status).toBe(status);
    }
  });

  it("EscrowVault writes vault totals and the gig mint; ProtocolConfig writes the singleton", async () => {
    const gig = pk();
    const mint = pk();
    const vault = await decodedAccount("escrow", "EscrowVault", {
      gig,
      token_account: pk(),
      mint,
      total_locked: bn(1_000),
      total_released: bn(500),
      milestone_count: 3,
      active_milestone: 1,
      cancelled_milestones: 0,
      reputation_synced: false,
      bump: 1,
      total_fees: bn(5),
      total_refunded: bn(300),
      refunded_milestones: 1,
      late_deliveries: 2,
    });
    const [v, g] = ACCOUNT_HANDLERS["escrow.EscrowVault"]!(vault, { address: "V", slot: 1, programIds });
    expect(v).toMatchObject({ table: "vaults", key: "V", set: { total_fees: 5, total_refunded: 300, refunded_milestones: 1, late_deliveries: 2 } });
    expect(g).toEqual({ table: "gigs", key: gig.toBase58(), set: { mint: mint.toBase58() } });

    const cfg = await decodedAccount("escrow", "ProtocolConfig", {
      admin: pk(),
      treasury: pk(),
      partial_timeout: bn(1),
      full_timeout: bn(2),
      partial_bps: 3,
      fee_bps: 4,
      min_milestone: bn(5),
      no_delivery_grace: bn(6),
      bump: 7,
    });
    expect(ACCOUNT_HANDLERS["escrow.ProtocolConfig"]!(cfg, { address: "C", slot: 1, programIds })[0]).toMatchObject({
      table: "protocol_config",
      key: "C",
      set: { partial_timeout: 1, full_timeout: 2, partial_bps: 3, fee_bps: 4, min_milestone: 5, no_delivery_grace: 6 },
    });
  });

  it("UserProfile carries the extended counters from the decoded account", async () => {
    const d = await decodedAccount("reputation", "UserProfile", {
      authority: pk(),
      completed_jobs: bn(3),
      successful_jobs: bn(2),
      cancelled_jobs: bn(1),
      total_earnings: bn(10),
      rating_sum: bn(14),
      rating_count: bn(3),
      average_rating: 466,
      reputation_score: bn(512),
      badges_earned: 1,
      created_at: bn(1),
      updated_at: bn(2),
      bump: 255,
      on_time_jobs: bn(2),
      disputes_won: bn(1),
      disputes_lost: bn(1),
    });
    const [p] = ACCOUNT_HANDLERS["reputation.UserProfile"]!(d, { address: "P", slot: 9, programIds });
    expect(p!.set).toMatchObject({ reputation_score: 512, average_rating: 466, on_time_jobs: 2, disputes_won: 1, disputes_lost: 1 });
  });

  it("UserProfile without the extended counters (older account layout) leaves them untouched", () => {
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
