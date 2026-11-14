/**
 * Acceptance flows from the PRD, run against the mock chain. These are the
 * executable spec the Anchor programs are ported against in Phase 1–3.
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { buildSeed, P } from "./seed";
import { instructions as ix, ProgramError, type Ctx } from "./instructions";
import { keeperTick } from "./keeper";
import type { ChainState } from "./state";
import { DAY, HOUR, USDC } from "@/lib/domain/format";
import { hashDocument } from "@/lib/domain/hash";
import { lockedRemaining, splitRuling } from "@/lib/domain/dispute";
import { computeReputationScore } from "@/lib/domain/reputation";
import type { MilestoneSpec } from "@/lib/domain/types";

const T0 = 1_800_000_000;

function fresh() {
  return structuredClone(buildSeed(T0)) as ChainState;
}
const ctx = (actor: string, now: number): Ctx => ({ actor, now });
function runKeeper(s: ChainState, now: number) {
  for (let i = 0; i < 20; i++) if (!keeperTick(s, now)) break;
}
const gigByTitle = (s: ChainState, t: string) => Object.values(s.gigs).find((g) => g.title.startsWith(t))!;
const msOf = (s: ChainState, gig: string) => Object.values(s.milestones).filter((m) => m.gig === gig).sort((a, b) => a.index - b.index);

/** Invariant: released + refunded + fees + still-locked = amount, for every funded milestone. */
function checkAccounting(s: ChainState) {
  for (const m of Object.values(s.milestones)) {
    if (m.status === "pendingFunding") continue;
    expect(m.released + m.refunded + m.feesPaid + lockedRemaining(m)).toBe(m.amount);
    expect(lockedRemaining(m)).toBeGreaterThanOrEqual(0);
  }
}

function spec(gig: string, index: number, amount: number): MilestoneSpec {
  return { schema: "proove.milestone-spec.v1", gig, index, title: "Work", amount: String(amount), mint: "m", deliverables: [], criteria: [{ id: "c1", text: "It works", check: "manual" }], deadline: T0 + 10 * DAY, generated_by: null, edited_by_client: true };
}

function newFundedDelivered(s: ChainState, now: number, amount = 100 * USDC) {
  const gig = ix.createGig(s, ctx(P.ava, now), { title: "Test gig", description: "d", category: "AI Services", skills: [], budget: amount, deadline: now + 10 * DAY });
  ix.assignFreelancer(s, ctx(P.ava, now), { gig, freelancer: P.kai });
  const sp = spec(gig, 0, amount);
  const m = ix.createMilestone(s, ctx(P.ava, now), { gig, title: "Work", amount, spec: sp, specHash: hashDocument(sp) });
  ix.acceptTerms(s, ctx(P.kai, now), { milestone: m, specHash: hashDocument(sp) });
  ix.fundMilestone(s, ctx(P.ava, now), { milestone: m });
  ix.submitDelivery(s, ctx(P.kai, now + HOUR), { milestone: m, files: [], note: "", deliveryHash: "a".repeat(64), reportHash: "b".repeat(64) });
  return { gig, m };
}

describe("seed", () => {
  it("builds a consistent world", () => {
    const s = fresh();
    expect(Object.keys(s.gigs).length).toBeGreaterThanOrEqual(9);
    const c1 = Object.values(s.cases).find((c) => c.status === "arbitration")!;
    expect(c1.seats.every((x) => x.status === "posted")).toBe(true);
    expect(c1.requiredArbitrators).toBe(2); // 630 USDC ≥ 500 threshold
    expect(c1.arbitrators).toContain(P.mira);
    expect(Object.values(s.cases).some((c) => c.status === "settled" && c.finalRuling === 7500)).toBe(true);
    for (const p of Object.values(s.profiles)) expect(p.reputationScore).toBe(computeReputationScore(p));
    checkAccounting(s);
  });
});

describe("agreement layer", () => {
  it("fund requires accepted terms when a spec is committed", () => {
    const s = fresh();
    const gig = ix.createGig(s, ctx(P.ava, T0), { title: "x", description: "", category: "c", skills: [], budget: 50 * USDC, deadline: T0 + 5 * DAY });
    ix.assignFreelancer(s, ctx(P.ava, T0), { gig, freelancer: P.kai });
    const sp = spec(gig, 0, 50 * USDC);
    const m = ix.createMilestone(s, ctx(P.ava, T0), { gig, title: "Work", amount: 50 * USDC, spec: sp, specHash: hashDocument(sp) });
    expect(() => ix.fundMilestone(s, ctx(P.ava, T0), { milestone: m })).toThrow(/accepted/);
    expect(() => ix.acceptTerms(s, ctx(P.kai, T0), { milestone: m, specHash: "f".repeat(64) })).toThrow(ProgramError);
    ix.acceptTerms(s, ctx(P.kai, T0), { milestone: m, specHash: hashDocument(sp) });
    ix.fundMilestone(s, ctx(P.ava, T0), { milestone: m });
    expect(s.milestones[m].status).toBe("funded");
  });

  it("rejects milestones under the governed minimum", () => {
    const s = fresh();
    const gig = ix.createGig(s, ctx(P.ava, T0), { title: "x", description: "", category: "c", skills: [], budget: 50 * USDC, deadline: T0 + 5 * DAY });
    expect(() => ix.createMilestone(s, ctx(P.ava, T0), { gig, title: "tiny", amount: 1 * USDC, specHash: "0".repeat(64) })).toThrow(/at least/);
  });
});

describe("silent client: timeouts", () => {
  it("keeper releases 20% at 72 h and the rest at 7 days, with the fee", () => {
    const s = fresh();
    const { m } = newFundedDelivered(s, T0);
    runKeeper(s, T0 + HOUR + 72 * HOUR - 1);
    expect(s.milestones[m].status).toBe("submitted");
    runKeeper(s, T0 + HOUR + 72 * HOUR);
    expect(s.milestones[m].status).toBe("partialReleased");
    expect(s.milestones[m].released).toBe(20 * USDC - 20 * USDC * 0.005);
    runKeeper(s, T0 + HOUR + 7 * DAY);
    expect(s.milestones[m].status).toBe("completed");
    expect(s.milestones[m].released).toBe(100 * USDC - 100 * USDC * 0.005);
    expect(s.milestones[m].feesPaid).toBe(100 * USDC * 0.005);
    checkAccounting(s);
  });
});

describe("no delivery", () => {
  it("client is refunded after deadline + grace", () => {
    const s = fresh();
    const g9 = gigByTitle(s, "Clean and dedupe");
    const m = msOf(s, g9.address)[0];
    const before = s.balances[P.priya];
    ix.refundAfterDeadline(s, ctx(P.priya, T0), { milestone: m.address });
    expect(s.balances[P.priya] - before).toBe(150 * USDC);
    expect(s.milestones[m.address].status).toBe("refunded");
    checkAccounting(s);
  });
});

describe("disputes", () => {
  it("freezes timeouts while open", () => {
    const s = fresh();
    const { m } = newFundedDelivered(s, T0);
    ix.raiseDispute(s, ctx(P.ava, T0 + 2 * HOUR), { milestone: m, reason: "bad", humanOnly: false });
    expect(() => ix.partialTimeoutRelease(s, ctx(P.kai, T0 + 5 * DAY), { milestone: m })).toThrow(/frozen/);
    expect(() => ix.approveMilestone(s, ctx(P.ava, T0 + 5 * DAY), { milestone: m })).toThrow(/frozen/);
  });

  it("seeded case: Mira signs the same ruling → appeal window → both waive → settled split", () => {
    const s = fresh();
    const c = Object.values(s.cases).find((x) => x.status === "arbitration")!;
    const m = s.milestones[c.milestone];
    const kai0 = s.balances[P.kai];
    const ava0 = s.balances[P.ava];
    ix.submitVerdict(s, ctx(P.mira, T0), { case: c.address, ruling: 7500, reasons: m.spec!.criteria.map((cr) => ({ criterion: cr.id, text: "ok" })), seatAnswers: { A: "a", B: "b", C: "c" }, reasonHash: "c".repeat(64) });
    expect(s.cases[c.address].status).toBe("appealWindow");
    ix.waiveAppeal(s, ctx(P.ava, T0), { case: c.address });
    ix.waiveAppeal(s, ctx(P.kai, T0), { case: c.address });
    runKeeper(s, T0);
    expect(s.cases[c.address].status).toBe("settled");
    const split = splitRuling(c.frozenAmount, 7500, 50);
    expect(s.balances[P.kai] - kai0).toBe(split.toFreelancer);
    // Client raised and got < 50%: bond forfeited.
    expect(s.balances[P.ava] - ava0).toBe(split.toClient);
    expect(s.profiles[P.kai].disputesWon).toBeGreaterThanOrEqual(2);
    checkAccounting(s);
  });

  it("verdicts far from the AI recommendation must answer each juror", () => {
    const s = fresh();
    const c = Object.values(s.cases).find((x) => x.status === "arbitration")!;
    const m = s.milestones[c.milestone];
    expect(() => ix.submitVerdict(s, ctx(P.mira, T0), { case: c.address, ruling: 0, reasons: m.spec!.criteria.map((cr) => ({ criterion: cr.id, text: "x" })), reasonHash: "c".repeat(64) })).toThrow(/answer each AI juror/);
  });

  it("two arbitrators disagree → fallback picks one", () => {
    const s = fresh();
    const c = Object.values(s.cases).find((x) => x.status === "arbitration")!;
    const m = s.milestones[c.milestone];
    ix.submitVerdict(s, ctx(P.mira, T0), { case: c.address, ruling: 5000, reasons: m.spec!.criteria.map((cr) => ({ criterion: cr.id, text: "x" })), reasonHash: "c".repeat(64) });
    const cc = s.cases[c.address];
    expect(cc.status).toBe("tieBreak");
    expect(cc.fallback).toBeTruthy();
    ix.breakTie(s, ctx(cc.fallback!, T0 + HOUR), { case: c.address, pick: 5000 });
    expect(s.cases[c.address].status).toBe("appealWindow");
    runKeeper(s, T0 + 3 * DAY);
    expect(s.cases[c.address].status).toBe("settled");
    checkAccounting(s);
  });

  it("appeal → two fresh arbitrators → final round settles", () => {
    const s = fresh();
    const c = Object.values(s.cases).find((x) => x.status === "arbitration")!;
    const m = s.milestones[c.milestone];
    ix.submitVerdict(s, ctx(P.mira, T0), { case: c.address, ruling: 7500, reasons: m.spec!.criteria.map((cr) => ({ criterion: cr.id, text: "ok" })), seatAnswers: { A: "a", B: "b", C: "c" }, reasonHash: "c".repeat(64) });
    const r2 = ix.appeal(s, ctx(P.ava, T0 + HOUR), { case: c.address, grounds: "dark variant missing" }) as string;
    const case2 = s.cases[r2];
    expect(case2.round).toBe(2);
    expect(case2.arbitrators).toHaveLength(2);
    expect(case2.arbitrators).not.toContain(P.mira);
    for (const a of case2.arbitrators) {
      ix.submitVerdict(s, ctx(a, T0 + 2 * HOUR), { case: r2, ruling: 5000, reasons: m.spec!.criteria.map((cr) => ({ criterion: cr.id, text: "ok" })), reasonHash: "d".repeat(64) });
    }
    expect(s.cases[r2].status).toBe("settled");
    expect(s.cases[c.address].status).toBe("appealed");
    expect(s.milestones[c.milestone].status).toBe("resolved");
    checkAccounting(s);
  });

  it("no-show: missed deadline → fallback assigned → original marked no-show and slashed", () => {
    const s = fresh();
    const c = Object.values(s.cases).find((x) => x.status === "arbitration")!;
    const stake0 = s.arbitrators[P.mira].stake;
    runKeeper(s, c.deadlines.arbitration + 60);
    const cc = s.cases[c.address];
    expect(cc.noShows).toContain(P.mira);
    expect(cc.arbitrators).not.toContain(P.mira);
    expect(s.arbitrators[P.mira].stake).toBe(stake0 - stake0 / 10);
    expect(cc.reassignments).toBe(1);
  });

  function caseThroughAi(mode: ChainState["dev"]["aiFailure"]) {
    const s = fresh();
    s.dev.aiFailure = mode;
    const { m } = newFundedDelivered(s, T0, 200 * USDC);
    const id = ix.raiseDispute(s, ctx(P.ava, T0 + 2 * HOUR), { milestone: m, reason: "bad", humanOnly: false }) as string;
    ix.submitEvidence(s, ctx(P.ava, T0 + 3 * HOUR), { case: id, label: "a", text: "a", contentHash: "1".repeat(64) });
    runKeeper(s, T0 + 2 * HOUR + 72 * HOUR + 60);
    return { s, c: s.cases[id] };
  }

  it("AI failure → human-only, two arbitrators, standard 3% fee", () => {
    const { c } = caseThroughAi("twoSeats");
    expect(c.aiPhase).toBe("failed");
    expect(c.mode).toBe("humanOnly");
    expect(c.humanOnlyReason).toBe("aiFailed");
    expect(c.requiredArbitrators).toBe(2);
    expect(c.feeBps).toBe(300);
  });

  it("AI split (0/50/100) → two arbitrators required", () => {
    const { c } = caseThroughAi("split");
    expect(c.split).toBe(true);
    expect(c.recommendation).toBe(5000);
    expect(c.requiredArbitrators).toBe(2);
  });

  it("retries and backup model are recorded on the case", () => {
    const { c } = caseThroughAi("retries");
    const b = c.seats.find((x) => x.seat === "B")!;
    expect(b.attempts.length).toBe(3);
    expect(b.attempts.at(-1)!.backup).toBe(true);
    expect(b.status).toBe("posted");
  });

  it("human-only chosen: nothing reaches the AI", () => {
    const s = fresh();
    const { m } = newFundedDelivered(s, T0);
    const id = ix.raiseDispute(s, ctx(P.ava, T0 + 2 * HOUR), { milestone: m, reason: "bad", humanOnly: true }) as string;
    runKeeper(s, T0 + 4 * DAY);
    const c = s.cases[id];
    expect(c.brief).toBeUndefined();
    expect(c.seats.every((x) => x.attempts.length === 0)).toBe(true);
    expect(c.requiredArbitrators).toBe(2);
    expect(c.feeBps).toBe(500);
  });

  it("hard deadline → default outcome restores v1 terms and refunds bonds", () => {
    const s = fresh();
    const { m } = newFundedDelivered(s, T0);
    const ava0 = s.balances[P.ava];
    const id = ix.raiseDispute(s, ctx(P.ava, T0 + 2 * HOUR), { milestone: m, reason: "bad", humanOnly: true }) as string;
    // Nobody acts; let the clock run past 21 days in steps so reassignments happen.
    for (let t = T0; t <= T0 + 22 * DAY; t += 6 * HOUR) runKeeper(s, t);
    const c = s.cases[id];
    expect(c.status).toBe("defaulted");
    expect(s.balances[P.ava]).toBeGreaterThanOrEqual(ava0); // bond refunded
    // Delivered milestone resumed its schedule; the keeper eventually releases it.
    expect(["submitted", "partialReleased", "completed"]).toContain(s.milestones[m].status);
    checkAccounting(s);
  });
});

describe("receivables", () => {
  it("holder is paid on approval and the NFT burns", () => {
    const s = fresh();
    const r = Object.values(s.receivables)[0];
    const price = r.askPrice!;
    const face = r.faceValue;
    const leo0 = s.balances[P.leo];
    ix.buyReceivable(s, ctx(P.leo, T0), { receivable: r.address });
    expect(s.receivables[r.address].owner).toBe(P.leo);
    expect(() => ix.raiseDispute(s, ctx(P.kai, T0), { milestone: r.milestone, reason: "x", humanOnly: false })).toThrow(/only the client/);
    ix.approveMilestone(s, ctx(P.priya, T0 + HOUR), { milestone: r.milestone });
    expect(s.receivables[r.address].status).toBe("burned");
    expect(s.balances[P.leo] - leo0).toBe(face - price);
    checkAccounting(s);
  });
});

describe("governance", () => {
  it("enforces ranges in code and only affects milestones funded later", () => {
    const s = fresh();
    expect(() => ix.createProposal(s, ctx(P.mira, T0), { title: "0s", description: "", changes: [{ account: "ProtocolConfig", key: "partialTimeout", from: 0, to: 10 }] })).toThrow(/between/);
    const p = s.proposals.find((x) => x.status === "voting")!;
    ix.castVote(s, ctx(P.mira, T0), { proposal: p.id, choice: "for" });
    const funded = Object.values(s.milestones).find((m) => m.status === "funded")!;
    const termsBefore = { ...funded.terms! };
    runKeeper(s, p.votingEndsAt + 1);
    expect(s.proposals.find((x) => x.id === p.id)!.status).toBe("timelock");
    runKeeper(s, p.votingEndsAt + 49 * HOUR);
    expect(s.proposals.find((x) => x.id === p.id)!.status).toBe("executed");
    expect(s.protocol.partialTimeout).toBe(48 * HOUR);
    expect(s.milestones[funded.address].terms).toEqual(termsBefore);
  });
});

describe("credentials", () => {
  it("copies values from the profile at the issuing slot", () => {
    const s = fresh();
    const id = ix.issueCredential(s, ctx(P.kai, T0), { schema: "proove.work-summary.v1" }) as string;
    const c = s.credentials.find((x) => x.address === id)!;
    expect(Number(c.fields.completed_jobs)).toBe(s.profiles[P.kai].completedJobs);
    expect(c.fields).not.toHaveProperty("total_earnings");
    expect(c.expiresAt - c.issuedAt).toBe(90 * DAY);
  });
});

describe("immutability", () => {
  it("store mutations go through immer without touching the previous state", () => {
    const s = buildSeed(T0);
    const next = produce(s, (d) => {
      ix.airdrop(d as ChainState, ctx(P.kai, T0), { amount: 5 * USDC });
    });
    expect(next.balances[P.kai] - s.balances[P.kai]).toBe(5 * USDC);
  });
});
