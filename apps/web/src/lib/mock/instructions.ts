/**
 * Mock program instructions.
 *
 * Each handler mirrors one on-chain instruction from the PRD: same signer
 * rules, same status checks, same arithmetic. Handlers mutate an immer draft
 * and throw ProgramError exactly where the real program would fail, so the
 * UI's error handling is exercised against realistic failures.
 */
import type {
  Address,
  Bps,
  ChainEvent,
  CriterionFinding,
  DeliveryFile,
  DisputeCase,
  EvidenceItem,
  Gig,
  Hash,
  Milestone,
  MilestoneSpec,
  Proposal,
  ProgramName,
  SeatId,
  SettingChange,
  UserProfile,
  VerdictReason,
  VerificationReport,
  CredentialSchema,
} from "@/lib/domain/types";
import { ZERO_HASH } from "@/lib/domain/types";
import { mockAddress, mockHash } from "@/lib/domain/hash";
import { averageRating, computeReputationScore, isEligibleForBadge, ALL_BADGES } from "@/lib/domain/reputation";
import {
  ALLOWED_RULINGS,
  arbitrationFee,
  disputeBond,
  lockedRemaining,
  raiserKeepsBond,
  releaseFee,
  requiresTwoArbitrators,
  splitRuling,
} from "@/lib/domain/dispute";
import { DAY, HOUR, formatUsdc, formatRuling, shortAddress, USDC } from "@/lib/domain/format";
import { KEEPER, TREASURY, USDC_MINT, type ChainState } from "./state";
import { SETTING_RANGES } from "./ranges";

export class ProgramError extends Error {
  constructor(public program: ProgramName, public code: string, message: string) {
    super(message);
    this.name = "ProgramError";
  }
}

export interface Ctx {
  actor: Address;
  now: number;
}

const fail = (program: ProgramName, code: string, message: string): never => {
  throw new ProgramError(program, code, message);
};

export function slotAt(t: number): number {
  return Math.floor((t - 1_600_000_000) * 2.5);
}

function nextId(s: ChainState, prefix: string): Address {
  s.counter += 1;
  return mockAddress(`${prefix}:${s.counter}`);
}

export function emit(s: ChainState, ctx: Ctx, e: Omit<ChainEvent, "signature" | "slot" | "blockTime" | "actors"> & { actors?: Address[] }) {
  s.counter += 1;
  s.events.unshift({
    signature: mockAddress(`sig:${s.counter}`, 88),
    slot: slotAt(ctx.now),
    blockTime: ctx.now,
    actors: e.actors ?? [ctx.actor],
    ...e,
  });
  if (s.events.length > 400) s.events.length = 400;
}

export function notify(s: ChainState, ctx: Ctx, to: Address | null | undefined, text: string, href?: string) {
  if (!to) return;
  s.counter += 1;
  s.notifications.unshift({ id: `n${s.counter}`, to, at: ctx.now, text, href, read: false });
}

function getGig(s: ChainState, address: Address): Gig {
  return s.gigs[address] ?? fail("gig", "AccountNotInitialized", "Gig account does not exist");
}

function getMilestone(s: ChainState, address: Address): Milestone {
  return s.milestones[address] ?? fail("escrow", "AccountNotInitialized", "Milestone account does not exist");
}

function getCase(s: ChainState, address: Address): DisputeCase {
  return s.cases[address] ?? fail("dispute", "AccountNotInitialized", "Dispute case does not exist");
}

function debit(s: ChainState, who: Address, amount: number, program: ProgramName) {
  const bal = s.balances[who] ?? 0;
  if (bal < amount) fail(program, "InsufficientFunds", `Insufficient USDC: need ${formatUsdc(amount)}, have ${formatUsdc(bal)}`);
  s.balances[who] = bal - amount;
}

function credit(s: ChainState, who: Address, amount: number) {
  s.balances[who] = (s.balances[who] ?? 0) + amount;
}

export function ensureProfile(s: ChainState, who: Address, now: number): UserProfile {
  if (!s.profiles[who]) {
    s.profiles[who] = {
      authority: who,
      completedJobs: 0,
      successfulJobs: 0,
      cancelledJobs: 0,
      onTimeJobs: 0,
      totalEarnings: 0,
      ratingSum: 0,
      ratingCount: 0,
      averageRating: 0,
      reputationScore: 0,
      badgesEarned: 0,
      disputesWon: 0,
      disputesLost: 0,
      createdAt: now,
      updatedAt: now,
      slot: slotAt(now),
    };
  }
  return s.profiles[who];
}

/** Recompute the score and award any newly eligible badges (permissionless award_badge). */
export function refreshProfile(s: ChainState, ctx: Ctx, p: UserProfile) {
  p.averageRating = averageRating(p.ratingSum, p.ratingCount);
  p.reputationScore = computeReputationScore(p);
  p.updatedAt = ctx.now;
  p.slot = slotAt(ctx.now);
  for (const type of ALL_BADGES) {
    if (s.badges.some((b) => b.profile === p.authority && b.type === type)) continue;
    if (isEligibleForBadge(p, type)) {
      s.badges.push({ type, profile: p.authority, issuedAt: ctx.now, minted: false, version: "v2" });
      p.badgesEarned += 1;
      emit(s, ctx, { program: "reputation", name: "BadgeAwarded", actors: [p.authority], receipt: `${shortAddress(p.authority)} earned the ${type} badge.` });
      notify(s, ctx, p.authority, `You earned a new badge: ${type}. Claim it as a non-transferable NFT.`, `/reputation/${p.authority}`);
    }
  }
}

/** escrow → reputation::update_completion */
function updateCompletion(s: ChainState, ctx: Ctx, m: Milestone, earned: number, disputedOutcome: Bps | null) {
  const gig = s.gigs[m.gig];
  if (!gig?.freelancer) return;
  const p = ensureProfile(s, gig.freelancer, ctx.now);
  const onTime = m.submittedAt !== null && m.submittedAt <= gig.deadline;
  p.completedJobs += 1;
  if (disputedOutcome === null || disputedOutcome >= 5000) p.successfulJobs += 1;
  if (onTime) p.onTimeJobs += 1;
  p.totalEarnings += earned;
  if (disputedOutcome !== null) {
    if (disputedOutcome >= 5000) p.disputesWon += 1;
    else p.disputesLost += 1;
  }
  refreshProfile(s, ctx, p);
}

/** Where escrow pays a release: the receivable holder if one exists, else the freelancer. */
function releaseDestination(s: ChainState, m: Milestone): Address {
  const r = m.receivable ? s.receivables[m.receivable] : undefined;
  if (r && r.status === "active") return r.owner;
  return s.gigs[m.gig].freelancer!;
}

function release(s: ChainState, ctx: Ctx, m: Milestone, gross: number, label: string) {
  const fee = releaseFee(gross, { feeBps: m.terms?.feeBps ?? s.protocol.feeBps });
  const to = releaseDestination(s, m);
  m.released += gross - fee;
  m.feesPaid += fee;
  credit(s, to, gross - fee);
  s.treasury.balance += fee;
  emit(s, ctx, {
    program: "escrow",
    name: label,
    gig: m.gig,
    milestone: m.address,
    amount: gross - fee,
    actors: [ctx.actor, to],
    receipt: `${formatUsdc(gross - fee)} released to ${shortAddress(to)}${fee ? ` (protocol fee ${formatUsdc(fee)} to the DAO treasury)` : ""}.`,
  });
  notify(s, ctx, to, `${formatUsdc(gross - fee)} released for “${m.title}”.`, `/gigs/${m.gig}`);
  return gross - fee;
}

function maybeCompleteGig(s: ChainState, ctx: Ctx, gigAddress: Address) {
  const gig = s.gigs[gigAddress];
  const ms = Object.values(s.milestones).filter((m) => m.gig === gigAddress);
  const allDone = ms.length > 0 && ms.every((m) => ["completed", "resolved", "refunded"].includes(m.status));
  const fundedTotal = ms.reduce((a, m) => a + m.amount, 0);
  if (allDone && fundedTotal >= gig.budget) {
    gig.status = "completed";
    gig.updatedAt = ctx.now;
    emit(s, ctx, { program: "gig", name: "GigCompleted", gig: gig.address, actors: [KEEPER], receipt: `“${gig.title}” is complete: every milestone has settled.` });
  } else if (gig.status === "disputed" && !ms.some((m) => m.status === "disputed")) {
    gig.status = "inProgress";
  }
}

function settleMilestoneFully(s: ChainState, ctx: Ctx, m: Milestone, name: string) {
  const remaining = lockedRemaining(m);
  const paid = release(s, ctx, m, remaining, name);
  m.status = "completed";
  m.approvedAt = ctx.now;
  if (m.receivable) {
    const r = s.receivables[m.receivable];
    if (r && r.status === "active") {
      r.status = "burned";
      r.askPrice = null;
      emit(s, ctx, { program: "receivables", name: "ReceivableBurned", milestone: m.address, receipt: `Receivable for “${m.title}” was paid out and burned.` });
    }
  }
  updateCompletion(s, ctx, m, m.released, null);
  maybeCompleteGig(s, ctx, m.gig);
  return paid;
}

// ─── Arbitrator assignment ──────────────────────────────────────────────────

function counterparties(s: ChainState, who: Address): Set<Address> {
  const set = new Set<Address>();
  for (const g of Object.values(s.gigs)) {
    if (g.client === who && g.freelancer) set.add(g.freelancer);
    if (g.freelancer === who) set.add(g.client);
  }
  return set;
}

export function eligibleArbitrators(s: ChainState, c: DisputeCase, exclude: Address[] = []): Address[] {
  const parties = [c.client, c.freelancer, c.holder].filter(Boolean) as Address[];
  return Object.values(s.arbitrators)
    .filter((a) => a.status === "active" && a.stake >= s.disputeConfig.arbitratorStake)
    .filter((a) => !parties.includes(a.authority) && !exclude.includes(a.authority))
    // indexer conflict check: skip past counterparties of either party
    .filter((a) => !parties.some((p) => counterparties(s, p).has(a.authority)))
    .map((a) => a.authority);
}

function pickArbitrators(s: ChainState, c: DisputeCase, n: number, exclude: Address[]): Address[] {
  const pool = eligibleArbitrators(s, c, exclude);
  const picked: Address[] = [];
  for (let i = 0; i < pool.length && picked.length < n; i++) {
    picked.push(pool[(s.arbitratorCursor + i) % pool.length]);
  }
  s.arbitratorCursor += picked.length;
  return picked;
}

export function assignArbitrators(s: ChainState, ctx: Ctx, c: DisputeCase, exclude: Address[] = []) {
  c.requiredArbitrators = requiresTwoArbitrators(c, s.disputeConfig) ? 2 : 1;
  c.arbitrators = pickArbitrators(s, c, c.requiredArbitrators, exclude);
  for (const a of c.arbitrators) {
    s.arbitrators[a].activeCases += 1;
    notify(s, ctx, a, `You were assigned dispute case ${shortAddress(c.address)}. Verdict due in ${c.mode === "humanOnly" ? 96 : c.requiredArbitrators === 2 ? 72 : 48} h.`, `/disputes/${c.address}`);
  }
  const window =
    c.mode === "humanOnly"
      ? s.disputeConfig.humanOnlyWindow
      : c.requiredArbitrators === 2
        ? s.disputeConfig.arbitrationWindow + 24 * HOUR
        : s.disputeConfig.arbitrationWindow;
  c.deadlines.arbitration = ctx.now + window;
  c.status = "arbitration";
  c.timeline.push({
    at: ctx.now,
    kind: "assigned",
    text: `${c.arbitrators.length} arbitrator${c.arbitrators.length === 1 ? "" : "s"} assigned (round-robin, conflicts skipped). Verdict due ${Math.round(window / HOUR)} h from now.`,
  });
  emit(s, ctx, { program: "dispute", name: "ArbitratorsAssigned", case: c.address, actors: [KEEPER, ...c.arbitrators], receipt: `Arbitrators assigned to case ${shortAddress(c.address)}.` });
}

// ─── Settlement ─────────────────────────────────────────────────────────────

function finishCase(s: ChainState, c: DisputeCase) {
  for (const a of c.arbitrators) if (s.arbitrators[a]) s.arbitrators[a].activeCases = Math.max(0, s.arbitrators[a].activeCases - 1);
  if (c.fallback && s.arbitrators[c.fallback]) s.arbitrators[c.fallback].activeCases = Math.max(0, s.arbitrators[c.fallback].activeCases - 1);
}

/** dispute::settle_case → escrow::execute_ruling */
export function executeRuling(s: ChainState, ctx: Ctx, c: DisputeCase, ruling: Bps) {
  const m = s.milestones[c.milestone];
  const gig = s.gigs[c.gig];
  const root = c.previousRound ? s.cases[c.previousRound] : c;
  const frozen = root.frozenAmount;
  const split = splitRuling(frozen, ruling, m.terms?.feeBps ?? s.protocol.feeBps);
  const freelancerDest = releaseDestination(s, m);
  credit(s, freelancerDest, split.toFreelancer);
  credit(s, gig.client, split.toClient);
  s.treasury.balance += split.protocolFee;
  m.released += split.toFreelancer;
  m.feesPaid += split.protocolFee;
  m.refunded += split.toClient;
  m.status = "resolved";
  m.approvedAt = ctx.now;
  if (m.receivable && s.receivables[m.receivable]?.status === "active") s.receivables[m.receivable].status = "burned";

  // Bonds: each round's raiser keeps the bond if the final ruling gives them ≥ half.
  for (const rc of [root, ...(c !== root ? [c] : [])]) {
    const raiser = rc.raisedBy;
    const keeps = raiserKeepsBond(rc, ruling);
    if (keeps) credit(s, raiser, rc.bond);
    else s.treasury.feePool += rc.bond;
  }

  // Arbitration fee: paid to signing arbitrators from the fee pool, topped up by the treasury.
  const signers = [...new Set(c.verdicts.map((v) => v.arbitrator).concat(c.tieBreakPick !== undefined && c.fallback ? [c.fallback] : []))];
  const fee = c.feeAmount;
  if (signers.length) {
    const fromPool = Math.min(s.treasury.feePool, fee);
    s.treasury.feePool -= fromPool;
    s.treasury.balance -= fee - fromPool;
    const each = Math.floor(fee / signers.length);
    for (const a of signers) {
      if (!s.arbitrators[a]) continue;
      s.arbitrators[a].feesEarned += each;
      s.arbitrators[a].casesDecided += 1;
    }
  }
  if (c !== root && root.finalRuling !== null && root.finalRuling !== ruling) {
    for (const v of root.verdicts) if (s.arbitrators[v.arbitrator]) s.arbitrators[v.arbitrator].overturnedOnAppeal += 1;
  }

  c.finalRuling = ruling;
  c.status = "settled";
  c.settledAt = ctx.now;
  root.status = root === c ? "settled" : root.status;
  finishCase(s, c);
  updateCompletion(s, ctx, m, split.toFreelancer, ruling);
  c.timeline.push({ at: ctx.now, kind: "settled", text: `Settled: ${formatRuling(ruling)}. ${formatUsdc(split.toFreelancer)} to the freelancer side, ${formatUsdc(split.toClient)} to the client, ${formatUsdc(split.protocolFee)} protocol fee.` });
  emit(s, ctx, {
    program: "escrow",
    name: "RulingExecuted",
    gig: c.gig,
    milestone: c.milestone,
    case: c.address,
    amount: frozen,
    actors: [ctx.actor, gig.client, freelancerDest],
    receipt: `Dispute settled at ${formatRuling(ruling)}: ${formatUsdc(split.toFreelancer)} paid out, ${formatUsdc(split.toClient)} refunded to the client.`,
  });
  for (const who of [gig.client, gig.freelancer]) notify(s, ctx, who, `Dispute on “${m.title}” settled: ${formatRuling(ruling)}.`, `/disputes/${c.address}`);
  maybeCompleteGig(s, ctx, c.gig);
}

/** dispute::apply_default_outcome at the 21-day hard deadline. */
export function applyDefault(s: ChainState, ctx: Ctx, c: DisputeCase) {
  const root = c.previousRound ? s.cases[c.previousRound] : c;
  for (const a of c.arbitrators) {
    if (!c.verdicts.some((v) => v.arbitrator === a) && s.arbitrators[a]) {
      s.arbitrators[a].noShows += 1;
      c.noShows.push(a);
    }
  }
  if (c.round === 2 && root.finalRuling !== null) {
    c.timeline.push({ at: ctx.now, kind: "default", text: "Hard deadline reached in round 2: the round-1 verdict stands." });
    executeRuling(s, ctx, c, root.finalRuling);
    c.status = "defaulted";
    return;
  }
  const m = s.milestones[c.milestone];
  const gig = s.gigs[c.gig];
  // Refund bonds; no arbitration fees; reputation dispute counters unchanged.
  credit(s, root.raisedBy, root.bond);
  if (c !== root) credit(s, c.raisedBy, c.bond);
  if (m.statusBeforeDispute === "funded") {
    const refund = lockedRemaining(m);
    m.refunded += refund;
    credit(s, gig.client, refund);
    m.status = "refunded";
    c.timeline.push({ at: ctx.now, kind: "default", text: `No verdict by the hard deadline. Undelivered milestone refunded to the client (${formatUsdc(refund)}).` });
  } else {
    // Resume the timeout schedule with the time it had left when frozen.
    const frozenFor = ctx.now - (m.frozenAt ?? c.openedAt);
    m.submittedAt = (m.submittedAt ?? ctx.now) + frozenFor;
    m.status = m.statusBeforeDispute ?? "submitted";
    c.timeline.push({ at: ctx.now, kind: "default", text: "No verdict by the hard deadline. The milestone resumes its v1 timeout schedule with the time it had left." });
  }
  c.status = "defaulted";
  c.settledAt = ctx.now;
  root.status = root === c ? "defaulted" : root.status;
  finishCase(s, c);
  gig.status = "inProgress";
  emit(s, ctx, { program: "dispute", name: "DefaultOutcomeApplied", case: c.address, gig: c.gig, milestone: c.milestone, receipt: `Case ${shortAddress(c.address)} hit its hard deadline; the default outcome restored v1 terms and refunded bonds.` });
  maybeCompleteGig(s, ctx, c.gig);
}

// ─── Instructions ───────────────────────────────────────────────────────────

export const instructions = {
  // gig program
  createGig(s: ChainState, ctx: Ctx, a: { title: string; description: string; category: string; skills: string[]; budget: number; deadline: number; brief?: string }) {
    if (!a.title.trim()) fail("gig", "TitleEmpty", "Title cannot be empty");
    if (a.title.length > 100) fail("gig", "TitleTooLong", "Title is longer than 100 characters");
    if (a.description.length > 500) fail("gig", "DescriptionTooLong", "Description is longer than 500 characters");
    if (a.budget <= 0) fail("gig", "InvalidBudget", "Budget must be greater than zero");
    if (a.deadline < ctx.now + DAY) fail("gig", "DeadlineTooSoon", "Deadline must be at least one day away");
    const address = nextId(s, "gig");
    const id = Object.keys(s.gigs).length + 1;
    s.gigs[address] = {
      address,
      id,
      client: ctx.actor,
      freelancer: null,
      mint: USDC_MINT,
      status: "published",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      title: a.title.trim(),
      description: a.description.trim(),
      skills: a.skills,
      category: a.category,
      budget: a.budget,
      deadline: a.deadline,
      applicants: [],
      brief: a.brief,
    };
    emit(s, ctx, { program: "gig", name: "GigPublished", gig: address, receipt: `New gig “${a.title}” published with a ${formatUsdc(a.budget)} budget.` });
    return address;
  },

  applyToGig(s: ChainState, ctx: Ctx, a: { gig: Address }) {
    const gig = getGig(s, a.gig);
    if (gig.status !== "published") fail("gig", "NotPublished", "This gig is no longer accepting applications");
    if (gig.client === ctx.actor) fail("gig", "Unauthorized", "You can't apply to your own gig");
    if (!gig.applicants.includes(ctx.actor)) gig.applicants.push(ctx.actor);
    notify(s, ctx, gig.client, `${shortAddress(ctx.actor)} applied to “${gig.title}”.`, `/gigs/${gig.address}`);
  },

  assignFreelancer(s: ChainState, ctx: Ctx, a: { gig: Address; freelancer: Address }) {
    const gig = getGig(s, a.gig);
    if (gig.client !== ctx.actor) fail("gig", "Unauthorized", "Only the client can assign a freelancer");
    if (gig.status !== "published") fail("gig", "InvalidStatus", "Gig must be Published to assign");
    if (a.freelancer === gig.client) fail("gig", "InvalidFreelancer", "Client cannot be the freelancer");
    gig.freelancer = a.freelancer;
    gig.status = "assigned";
    gig.updatedAt = ctx.now;
    ensureProfile(s, a.freelancer, ctx.now);
    emit(s, ctx, { program: "gig", name: "FreelancerAssigned", gig: gig.address, actors: [ctx.actor, a.freelancer], receipt: `${shortAddress(a.freelancer)} was assigned to “${gig.title}”.` });
    notify(s, ctx, a.freelancer, `You were hired for “${gig.title}”. Review and accept the milestone terms.`, `/gigs/${gig.address}`);
  },

  cancelGig(s: ChainState, ctx: Ctx, a: { gig: Address }) {
    const gig = getGig(s, a.gig);
    if (gig.client !== ctx.actor) fail("gig", "Unauthorized", "Only the client can cancel");
    const funded = Object.values(s.milestones).some((m) => m.gig === gig.address && m.status !== "pendingFunding");
    if (funded || !["draft", "published", "assigned"].includes(gig.status)) fail("gig", "InvalidStatus", "Gigs with funded milestones cannot be cancelled");
    gig.status = "cancelled";
    for (const m of Object.values(s.milestones)) if (m.gig === gig.address) delete s.milestones[m.address];
    emit(s, ctx, { program: "gig", name: "GigCancelled", gig: gig.address, receipt: `“${gig.title}” was cancelled before any funds were locked.` });
  },

  // escrow program
  createMilestone(s: ChainState, ctx: Ctx, a: { gig: Address; title: string; amount: number; spec?: MilestoneSpec; specHash: Hash }) {
    const gig = getGig(s, a.gig);
    if (gig.client !== ctx.actor) fail("escrow", "Unauthorized", "Only the client can create milestones");
    if (!["published", "assigned", "inProgress", "disputed"].includes(gig.status)) fail("escrow", "InvalidGigStatus", "Gig is not open for milestones");
    if (a.amount < s.protocol.minMilestone) fail("escrow", "AmountBelowMinimum", `Milestone must be at least ${formatUsdc(s.protocol.minMilestone)}`);
    const existing = Object.values(s.milestones).filter((m) => m.gig === gig.address);
    const committed = existing.reduce((sum, m) => sum + m.amount, 0);
    if (committed + a.amount > gig.budget) fail("escrow", "ExceedsBudget", `Milestones would exceed the gig budget of ${formatUsdc(gig.budget)}`);
    const index = existing.length;
    const address = mockAddress(`milestone:${gig.address}:${index}`);
    s.milestones[address] = {
      address,
      gig: gig.address,
      index,
      title: a.title,
      amount: a.amount,
      released: 0,
      feesPaid: 0,
      refunded: 0,
      status: "pendingFunding",
      specHash: a.specHash,
      deliveryHash: ZERO_HASH,
      reportHash: ZERO_HASH,
      termsAccepted: false,
      createdAt: ctx.now,
      fundedAt: null,
      submittedAt: null,
      submittedSlot: null,
      approvedAt: null,
      terms: null,
      spec: a.spec,
    };
    emit(s, ctx, { program: "escrow", name: "MilestoneCreated", gig: gig.address, milestone: address, amount: a.amount, receipt: `Milestone ${index + 1} “${a.title}” created for ${formatUsdc(a.amount)}${a.specHash !== ZERO_HASH ? " with a committed spec" : ""}.` });
    if (gig.freelancer && a.specHash !== ZERO_HASH) notify(s, ctx, gig.freelancer, `New milestone terms to accept on “${gig.title}”.`, `/gigs/${gig.address}`);
    return address;
  },

  acceptTerms(s: ChainState, ctx: Ctx, a: { milestone: Address; specHash: Hash }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.freelancer !== ctx.actor) fail("escrow", "Unauthorized", "Only the assigned freelancer can accept terms");
    if (m.status !== "pendingFunding") fail("escrow", "InvalidStatus", "Terms can only be accepted before funding");
    if (a.specHash !== m.specHash) fail("escrow", "SpecHashMismatch", "The spec you saw does not match the committed spec hash");
    m.termsAccepted = true;
    emit(s, ctx, { program: "escrow", name: "TermsAccepted", gig: gig.address, milestone: m.address, receipt: `${shortAddress(ctx.actor)} accepted the terms of “${m.title}” (spec ${m.specHash.slice(0, 8)}…).` });
    notify(s, ctx, gig.client, `Terms accepted for “${m.title}”. You can fund it now.`, `/gigs/${gig.address}/hire`);
  },

  fundMilestone(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.client !== ctx.actor) fail("escrow", "Unauthorized", "Only the client can fund");
    if (!gig.freelancer) fail("escrow", "NoFreelancer", "Assign a freelancer before funding");
    if (m.status !== "pendingFunding") fail("escrow", "InvalidStatus", "Milestone is already funded");
    if (m.specHash !== ZERO_HASH && !m.termsAccepted) fail("escrow", "TermsNotAccepted", "The freelancer has not accepted this milestone's terms yet");
    debit(s, ctx.actor, m.amount, "escrow");
    m.status = "funded";
    m.fundedAt = ctx.now;
    m.terms = { partialTimeout: s.protocol.partialTimeout, fullTimeout: s.protocol.fullTimeout, partialBps: s.protocol.partialBps, feeBps: s.protocol.feeBps };
    if (gig.status === "assigned") gig.status = "inProgress";
    emit(s, ctx, { program: "escrow", name: "MilestoneFunded", gig: gig.address, milestone: m.address, amount: m.amount, receipt: `${formatUsdc(m.amount)} locked in a vault no one holds a key to, for “${m.title}”.` });
    notify(s, ctx, gig.freelancer, `“${m.title}” is funded: ${formatUsdc(m.amount)} locked in escrow. You can start.`, `/gigs/${gig.address}`);
  },

  submitDelivery(s: ChainState, ctx: Ctx, a: { milestone: Address; files: DeliveryFile[]; note: string; deliveryHash: Hash; reportHash: Hash; report?: VerificationReport }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.freelancer !== ctx.actor) fail("escrow", "Unauthorized", "Only the assigned freelancer can deliver");
    if (m.status !== "funded") fail("escrow", "InvalidStatus", "Milestone must be Funded to deliver");
    m.status = "submitted";
    m.submittedAt = ctx.now;
    m.submittedSlot = slotAt(ctx.now);
    m.deliveryHash = a.deliveryHash;
    m.reportHash = a.reportHash;
    m.files = a.files;
    m.deliveryNote = a.note;
    m.report = a.report;
    emit(s, ctx, { program: "escrow", name: "DeliverySubmitted", gig: gig.address, milestone: m.address, receipt: `Delivery for “${m.title}” committed on-chain (${a.files.length} file${a.files.length === 1 ? "" : "s"}). The 72 h partial-release clock started.` });
    notify(s, ctx, gig.client, `Delivery received for “${m.title}”. Review the verification report.`, `/gigs/${gig.address}`);
  },

  approveMilestone(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.client !== ctx.actor) fail("escrow", "Unauthorized", "Only the client can approve");
    if (m.status === "disputed") fail("escrow", "MilestoneDisputed", "This milestone is frozen by an open dispute");
    if (!["submitted", "partialReleased"].includes(m.status)) fail("escrow", "InvalidStatus", "Nothing to approve yet");
    settleMilestoneFully(s, ctx, m, "MilestoneApproved");
  },

  partialTimeoutRelease(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    if (m.status === "disputed") fail("escrow", "MilestoneDisputed", "This milestone is frozen by an open dispute");
    if (m.status !== "submitted") fail("escrow", "InvalidStatus", "Partial release needs a Submitted milestone");
    if (ctx.now < (m.submittedAt ?? 0) + (m.terms?.partialTimeout ?? 0)) fail("escrow", "TimeoutNotReached", "Partial release is not due yet");
    release(s, ctx, m, Math.floor((m.amount * (m.terms?.partialBps ?? 2000)) / 10_000), "PartialReleaseExecuted");
    m.status = "partialReleased";
  },

  fullTimeoutRelease(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    if (m.status === "disputed") fail("escrow", "MilestoneDisputed", "This milestone is frozen by an open dispute");
    if (!["submitted", "partialReleased"].includes(m.status)) fail("escrow", "InvalidStatus", "Full release needs a delivered milestone");
    if (ctx.now < (m.submittedAt ?? 0) + (m.terms?.fullTimeout ?? 0)) fail("escrow", "TimeoutNotReached", "Full release is not due yet");
    settleMilestoneFully(s, ctx, m, "FullReleaseExecuted");
  },

  refundAfterDeadline(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.client !== ctx.actor) fail("escrow", "Unauthorized", "Only the client can claim a refund");
    if (m.status !== "funded") fail("escrow", "InvalidStatus", "Only an undelivered, funded milestone can be refunded");
    if (ctx.now < gig.deadline + s.protocol.noDeliveryGrace) fail("escrow", "GracePeriodActive", "The no-delivery grace period hasn't passed yet");
    const refund = lockedRemaining(m);
    m.refunded += refund;
    m.status = "refunded";
    credit(s, gig.client, refund);
    const p = gig.freelancer ? ensureProfile(s, gig.freelancer, ctx.now) : null;
    if (p) {
      p.cancelledJobs += 1;
      refreshProfile(s, ctx, p);
    }
    emit(s, ctx, { program: "escrow", name: "RefundedAfterDeadline", gig: gig.address, milestone: m.address, amount: refund, receipt: `Nothing was delivered by the deadline plus grace, so ${formatUsdc(refund)} went back to the client.` });
    notify(s, ctx, gig.freelancer, `“${m.title}” was refunded to the client: no delivery by the deadline.`, `/gigs/${gig.address}`);
    maybeCompleteGig(s, ctx, gig.address);
  },

  rateFreelancer(s: ChainState, ctx: Ctx, a: { gig: Address; score: number; review: string; reviewHash: Hash }) {
    const gig = getGig(s, a.gig);
    if (gig.client !== ctx.actor) fail("escrow", "Unauthorized", "Only the client can rate");
    if (gig.status !== "completed") fail("escrow", "GigNotCompleted", "Rate after the gig completes");
    if (a.score < 1 || a.score > 5) fail("reputation", "InvalidScore", "Score must be 1–5");
    if (s.ratings.some((r) => r.gig === gig.address)) fail("reputation", "AlreadyRated", "You already rated this job");
    s.ratings.unshift({ address: mockAddress(`rating:${gig.address}`), jobId: gig.id, gig: gig.address, client: gig.client, freelancer: gig.freelancer!, score: a.score, reviewHash: a.reviewHash, review: a.review, submittedAt: ctx.now });
    const p = ensureProfile(s, gig.freelancer!, ctx.now);
    p.ratingSum += a.score;
    p.ratingCount += 1;
    refreshProfile(s, ctx, p);
    emit(s, ctx, { program: "reputation", name: "RatingSubmitted", gig: gig.address, actors: [ctx.actor, gig.freelancer!], receipt: `${shortAddress(ctx.actor)} rated ${shortAddress(gig.freelancer)} ${a.score}★ for “${gig.title}”.` });
    notify(s, ctx, gig.freelancer, `You received a ${a.score}★ rating for “${gig.title}”.`, `/reputation/${gig.freelancer}`);
  },

  // achievement program
  claimBadge(s: ChainState, ctx: Ctx, a: { type: string }) {
    const b = s.badges.find((x) => x.profile === ctx.actor && x.type === a.type);
    if (!b) fail("achievement", "BadgeNotAwarded", "Reputation hasn't awarded this badge to you");
    if (b!.minted) fail("achievement", "AlreadyClaimed", "Badge NFT already claimed");
    b!.minted = true;
    b!.assetId = mockAddress(`asset:${ctx.actor}:${a.type}`);
    emit(s, ctx, { program: "achievement", name: "AchievementClaimed", receipt: `${shortAddress(ctx.actor)} minted the ${a.type} badge as a non-transferable Metaplex Core NFT.` });
  },

  // dispute program
  raiseDispute(s: ChainState, ctx: Ctx, a: { milestone: Address; reason: string; humanOnly: boolean }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    const isClient = gig.client === ctx.actor;
    const isFreelancer = gig.freelancer === ctx.actor;
    if (!isClient && !isFreelancer) fail("escrow", "Unauthorized", "Only the client or freelancer can raise a dispute");
    const r = m.receivable ? s.receivables[m.receivable] : undefined;
    if (isFreelancer && r && r.status === "active" && r.owner !== gig.freelancer) fail("escrow", "ReceivableSold", "After selling the receivable, only the client can raise a dispute");
    const delivered = ["submitted", "partialReleased"].includes(m.status);
    const undeliveredPastDeadline = isClient && m.status === "funded" && ctx.now > gig.deadline;
    if (!delivered && !undeliveredPastDeadline) fail("escrow", "NotDisputable", "This milestone can't be disputed in its current state");
    if (!a.reason.trim()) fail("dispute", "ReasonRequired", "Describe what is wrong");
    const frozen = lockedRemaining(m);
    const bond = disputeBond(frozen, s.disputeConfig);
    debit(s, ctx.actor, bond, "escrow");
    const address = mockAddress(`case:${m.address}:1`);
    const cfg = s.disputeConfig;
    const c: DisputeCase = {
      address,
      milestone: m.address,
      gig: gig.address,
      round: 1,
      raisedBy: ctx.actor,
      raiserRole: isClient ? "client" : "freelancer",
      client: gig.client,
      freelancer: gig.freelancer!,
      holder: r && r.status === "active" && r.owner !== gig.freelancer ? r.owner : undefined,
      reason: a.reason.trim(),
      frozenAmount: frozen,
      bond,
      mode: a.humanOnly ? "humanOnly" : "aiAssisted",
      humanOnlyReason: a.humanOnly ? "chosen" : undefined,
      status: "evidence",
      openedAt: ctx.now,
      deadlines: { evidence: ctx.now + cfg.evidenceWindow, ai: ctx.now + cfg.evidenceWindow + cfg.aiWindow, arbitration: 0, appeal: 0, hard: ctx.now + cfg.hardDeadline },
      hashes: { spec: m.specHash, delivery: m.deliveryHash, report: m.reportHash, brief: ZERO_HASH },
      briefStatus: a.humanOnly ? "skipped" : "pending",
      seats: (["A", "B", "C"] as SeatId[]).map((seat) => {
        const reg = s.aiRegistry.find((e) => e.job === `seat${seat}`)!;
        return { seat, label: reg.label, model: reg.model, backupModel: reg.backupModel ?? reg.model, status: "pending" as const, attempts: [] };
      }),
      aiPhase: a.humanOnly ? "skipped" : "pending",
      recommendation: null,
      split: false,
      requiredArbitrators: 1,
      arbitrators: [],
      noShows: [],
      reassignments: 0,
      verdicts: [],
      finalRuling: null,
      waivedBy: [],
      feeBps: a.humanOnly ? cfg.humanOnlyFeeBps : cfg.feeBps,
      feeAmount: arbitrationFee(frozen, cfg, a.humanOnly),
      timeline: [
        { at: ctx.now, kind: "opened", text: `${isClient ? "Client" : "Freelancer"} raised a dispute and posted a ${formatUsdc(bond)} bond. ${formatUsdc(frozen)} frozen; timeouts paused.` },
      ],
    };
    s.cases[address] = c;
    m.statusBeforeDispute = m.status;
    m.frozenAt = ctx.now;
    m.status = "disputed";
    m.disputeCase = address;
    gig.status = "disputed";
    emit(s, ctx, { program: "dispute", name: "CaseOpened", gig: gig.address, milestone: m.address, case: address, amount: frozen, actors: [ctx.actor, isClient ? gig.freelancer! : gig.client], receipt: `Dispute opened on “${m.title}”: ${formatUsdc(frozen)} frozen until a verdict or the 21-day hard deadline.` });
    notify(s, ctx, isClient ? gig.freelancer : gig.client, `A dispute was raised on “${m.title}”. Submit evidence within 72 h.`, `/disputes/${address}`);
    return address;
  },

  chooseHumanOnly(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (![c.client, c.freelancer].includes(ctx.actor)) fail("dispute", "Unauthorized", "Only a party can choose human-only arbitration");
    if (c.status !== "evidence") fail("dispute", "InvalidStatus", "Too late to switch modes");
    if (ctx.now > c.openedAt + DAY) fail("dispute", "WindowClosed", "Human-only can be chosen only in the first 24 h");
    c.mode = "humanOnly";
    c.humanOnlyReason = "chosen";
    c.aiPhase = "skipped";
    c.briefStatus = "skipped";
    c.feeBps = s.disputeConfig.humanOnlyFeeBps;
    c.feeAmount = arbitrationFee(c.frozenAmount, s.disputeConfig, true);
    c.timeline.push({ at: ctx.now, kind: "humanOnly", text: "A party chose human-only arbitration: nothing will be sent to Gemini. Two arbitrators, 96 h window, 5% fee." });
    emit(s, ctx, { program: "dispute", name: "HumanOnlyChosen", case: c.address, receipt: `Case ${shortAddress(c.address)} switched to human-only arbitration.` });
  },

  submitEvidence(s: ChainState, ctx: Ctx, a: { case: Address; label: string; text: string; contentHash: Hash }) {
    const c = getCase(s, a.case);
    const role = ctx.actor === c.client ? "client" : ctx.actor === c.freelancer ? "freelancer" : ctx.actor === c.holder ? "holder" : null;
    if (!role) fail("dispute", "Unauthorized", "Only parties (or the receivable holder) can submit evidence");
    if (c.status !== "evidence" && !(c.round === 2 && c.status === "arbitration")) fail("dispute", "EvidenceClosed", "The evidence window has closed");
    const mine = s.evidence.filter((e) => e.case === c.address && e.party === ctx.actor);
    if (mine.length >= 10) fail("dispute", "TooMuchEvidence", "Up to 10 evidence items per side");
    if (!a.label.trim() || !a.text.trim()) fail("dispute", "EmptyEvidence", "Evidence needs a label and content");
    const item: EvidenceItem = {
      address: mockAddress(`evidence:${c.address}:${ctx.actor}:${mine.length}`),
      case: c.address,
      party: ctx.actor,
      role: role!,
      index: mine.length,
      label: a.label.trim(),
      text: a.text.trim(),
      contentHash: a.contentHash,
      uri: `ar://${mockHash(a.text).slice(0, 43)}`,
      submittedAt: ctx.now,
    };
    s.evidence.push(item);
    c.timeline.push({ at: ctx.now, kind: "evidence", text: `${role} submitted evidence “${item.label}” (hash ${a.contentHash.slice(0, 8)}…).` });
    emit(s, ctx, { program: "dispute", name: "EvidenceSubmitted", case: c.address, receipt: `Evidence “${item.label}” committed to case ${shortAddress(c.address)}.` });
  },

  submitVerdict(s: ChainState, ctx: Ctx, a: { case: Address; ruling: Bps; reasons: VerdictReason[]; seatAnswers?: Partial<Record<SeatId, string>>; reasonHash: Hash }) {
    const c = getCase(s, a.case);
    const isFallback = c.status === "tieBreak" && c.fallback === ctx.actor;
    if (!c.arbitrators.includes(ctx.actor) && !isFallback) fail("dispute", "NotAssigned", "You are not assigned to this case");
    if (isFallback) fail("dispute", "UseBreakTie", "As fallback arbitrator, pick one of the two rulings");
    if (c.status !== "arbitration") fail("dispute", "InvalidStatus", "This case is not awaiting a verdict");
    if (ctx.now > c.deadlines.arbitration) fail("dispute", "DeadlinePassed", "The arbitration deadline has passed");
    if (!ALLOWED_RULINGS.includes(a.ruling)) fail("dispute", "InvalidRuling", "Ruling must be 0, 25, 50, 75 or 100%");
    if (c.verdicts.some((v) => v.arbitrator === ctx.actor)) fail("dispute", "AlreadySigned", "You already signed a verdict");
    if (a.reasons.length === 0 || a.reasons.some((r) => !r.text.trim())) fail("dispute", "ReasonRequired", "A reason is required for every criterion");
    if (c.recommendation !== null && Math.abs(a.ruling - c.recommendation) >= 2500) {
      const posted = c.seats.filter((x) => x.status === "posted").map((x) => x.seat);
      if (posted.some((seat) => !a.seatAnswers?.[seat]?.trim())) fail("dispute", "SeatAnswersRequired", "A verdict this far from the AI recommendation must answer each AI juror's main finding");
    }
    c.verdicts.push({ arbitrator: ctx.actor, ruling: a.ruling, reasons: a.reasons, seatAnswers: a.seatAnswers, reasonHash: a.reasonHash, signedAt: ctx.now });
    c.timeline.push({ at: ctx.now, kind: "verdict", text: `Arbitrator ${shortAddress(ctx.actor)} signed a verdict (reason hash ${a.reasonHash.slice(0, 8)}…).` });
    emit(s, ctx, { program: "dispute", name: "VerdictSubmitted", case: c.address, receipt: `An arbitrator signed a verdict on case ${shortAddress(c.address)}.` });
    resolveVerdicts(s, ctx, c);
  },

  breakTie(s: ChainState, ctx: Ctx, a: { case: Address; pick: Bps }) {
    const c = getCase(s, a.case);
    if (c.status !== "tieBreak" || c.fallback !== ctx.actor) fail("dispute", "NotFallback", "You are not this case's fallback arbitrator");
    const options = c.verdicts.map((v) => v.ruling);
    if (!options.includes(a.pick)) fail("dispute", "InvalidPick", "Pick one of the two signed rulings");
    c.tieBreakPick = a.pick;
    c.timeline.push({ at: ctx.now, kind: "tieBreak", text: `Fallback arbitrator picked ${formatRuling(a.pick)}.` });
    finalizeRound(s, ctx, c, a.pick);
  },

  recuse(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (!c.arbitrators.includes(ctx.actor)) fail("dispute", "NotAssigned", "You are not assigned to this case");
    if (c.verdicts.some((v) => v.arbitrator === ctx.actor)) fail("dispute", "AlreadySigned", "You already signed");
    const replacement = pickArbitrators(s, c, 1, [...c.arbitrators, ...c.noShows]);
    c.arbitrators = c.arbitrators.filter((x) => x !== ctx.actor).concat(replacement);
    s.arbitrators[ctx.actor].activeCases -= 1;
    for (const r of replacement) {
      s.arbitrators[r].activeCases += 1;
      notify(s, ctx, r, `You were assigned case ${shortAddress(c.address)} after a recusal.`, `/disputes/${c.address}`);
    }
    c.timeline.push({ at: ctx.now, kind: "recuse", text: `Arbitrator ${shortAddress(ctx.actor)} recused; ${replacement.length ? "a replacement was assigned" : "no replacement available"}.` });
  },

  reassignArbitrator(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (c.status !== "arbitration") fail("dispute", "InvalidStatus", "Nothing to reassign");
    if (ctx.now <= c.deadlines.arbitration) fail("dispute", "DeadlineNotReached", "The arbitrator still has time");
    if (c.reassignments >= 2) fail("dispute", "ReassignLimit", "Reassignment limit reached; the hard deadline applies");
    const missing = c.arbitrators.filter((x) => !c.verdicts.some((v) => v.arbitrator === x));
    for (const x of missing) {
      const arb = s.arbitrators[x];
      arb.noShows += 1;
      const slash = Math.floor((arb.stake * s.disputeConfig.noShowSlashBps) / 10_000);
      arb.stake -= slash;
      s.treasury.balance += slash;
      arb.activeCases = Math.max(0, arb.activeCases - 1);
      c.noShows.push(x);
      const recent = arb.noShows;
      if (recent >= 3) arb.status = "removed";
      notify(s, ctx, x, `You missed the verdict deadline on case ${shortAddress(c.address)}: marked no-show, ${formatUsdc(slash)} slashed.`, `/arbitrate`);
    }
    const replacement = pickArbitrators(s, c, missing.length, [...c.arbitrators, ...c.noShows]);
    c.arbitrators = c.arbitrators.filter((x) => !missing.includes(x)).concat(replacement);
    for (const r of replacement) {
      s.arbitrators[r].activeCases += 1;
      notify(s, ctx, r, `Fallback assignment: case ${shortAddress(c.address)}. Verdict due in 24 h.`, `/disputes/${c.address}`);
    }
    c.reassignments += 1;
    c.deadlines.arbitration = ctx.now + DAY;
    c.timeline.push({ at: ctx.now, kind: "reassigned", text: `Deadline missed by ${missing.map((x) => shortAddress(x)).join(", ")} (no-show). Fallback arbitrator assigned with a fresh 24 h.` });
    emit(s, ctx, { program: "dispute", name: "ArbitratorReassigned", case: c.address, receipt: `Case ${shortAddress(c.address)} reassigned to a fallback arbitrator after a missed deadline.` });
  },

  appeal(s: ChainState, ctx: Ctx, a: { case: Address; grounds: string }) {
    const c = getCase(s, a.case);
    if (![c.client, c.freelancer].includes(ctx.actor)) fail("dispute", "Unauthorized", "Only a party can appeal");
    if (c.round !== 1) fail("dispute", "FinalRound", "Round 2 is final");
    if (c.status !== "appealWindow" || ctx.now > c.deadlines.appeal) fail("dispute", "AppealClosed", "The appeal window is closed");
    if (!a.grounds.trim()) fail("dispute", "GroundsRequired", "Write your grounds for appeal");
    const bond = c.bond * 2;
    debit(s, ctx.actor, bond, "dispute");
    const address = mockAddress(`case:${c.milestone}:2`);
    const r2: DisputeCase = {
      ...structuredClone(c),
      address,
      round: 2,
      previousRound: c.address,
      raisedBy: ctx.actor,
      raiserRole: ctx.actor === c.client ? "client" : "freelancer",
      bond,
      status: "arbitration",
      verdicts: [],
      tieBreakPick: undefined,
      fallback: undefined,
      finalRuling: null,
      waivedBy: [],
      noShows: [],
      reassignments: 0,
      appeal: { by: ctx.actor, grounds: a.grounds.trim(), bond, at: ctx.now },
      appealedTo: undefined,
      timeline: [{ at: ctx.now, kind: "appeal", text: `${ctx.actor === c.client ? "Client" : "Freelancer"} appealed with a ${formatUsdc(bond)} bond. Two fresh arbitrators decide round 2, which is final.` }],
      mode: c.mode,
      feeAmount: c.feeAmount,
    };
    r2.brief = r2.brief ? { ...r2.brief, contradictions: [...r2.brief.contradictions, `Appellant's grounds: ${a.grounds.trim().slice(0, 140)}`] } : r2.brief;
    s.cases[address] = r2;
    c.appeal = r2.appeal;
    c.appealedTo = address;
    c.status = "appealed";
    s.milestones[c.milestone].disputeCase = address;
    r2.requiredArbitrators = 2;
    r2.arbitrators = pickArbitrators(s, r2, 2, [...c.arbitrators, ...(c.fallback ? [c.fallback] : [])]);
    for (const x of r2.arbitrators) {
      s.arbitrators[x].activeCases += 1;
      notify(s, ctx, x, `Appeal assigned: case ${shortAddress(address)} (round 2).`, `/disputes/${address}`);
    }
    r2.deadlines = { ...c.deadlines, arbitration: ctx.now + s.disputeConfig.arbitrationWindow + DAY, appeal: 0 };
    finishCase(s, c);
    emit(s, ctx, { program: "dispute", name: "Appealed", case: address, receipt: `Round-1 verdict on case ${shortAddress(c.address)} was appealed.` });
    notify(s, ctx, ctx.actor === c.client ? c.freelancer : c.client, `The other party appealed the verdict on case ${shortAddress(c.address)}.`, `/disputes/${address}`);
    return address;
  },

  waiveAppeal(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (![c.client, c.freelancer].includes(ctx.actor)) fail("dispute", "Unauthorized", "Only a party can waive");
    if (c.status !== "appealWindow") fail("dispute", "InvalidStatus", "Not in the appeal window");
    if (!c.waivedBy.includes(ctx.actor)) c.waivedBy.push(ctx.actor);
    c.timeline.push({ at: ctx.now, kind: "waive", text: `${ctx.actor === c.client ? "Client" : "Freelancer"} waived the appeal window.` });
  },

  settleCase(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (c.status === "settled") return; // idempotent
    if (c.status !== "appealWindow") fail("dispute", "NotSettleable", "No final verdict to settle yet");
    const bothWaived = c.waivedBy.includes(c.client) && c.waivedBy.includes(c.freelancer);
    if (c.round === 1 && !bothWaived && ctx.now < c.deadlines.appeal) fail("dispute", "AppealWindowOpen", "The appeal window is still open");
    executeRuling(s, ctx, c, c.finalRuling!);
  },

  applyDefaultOutcome(s: ChainState, ctx: Ctx, a: { case: Address }) {
    const c = getCase(s, a.case);
    if (["settled", "defaulted", "appealed"].includes(c.status)) fail("dispute", "AlreadyFinal", "Case is already final");
    if (ctx.now < c.deadlines.hard) fail("dispute", "HardDeadlineNotReached", "The hard deadline hasn't passed");
    applyDefault(s, ctx, c);
  },

  registerArbitrator(s: ChainState, ctx: Ctx, a: { stake: number }) {
    if (s.arbitrators[ctx.actor]) fail("dispute", "AlreadyRegistered", "Already registered");
    if (a.stake < s.disputeConfig.arbitratorStake) fail("dispute", "StakeTooLow", `Stake at least ${formatUsdc(s.disputeConfig.arbitratorStake)}`);
    debit(s, ctx.actor, a.stake, "dispute");
    s.arbitrators[ctx.actor] = { authority: ctx.actor, stake: a.stake, status: "cooldown", activeCases: 0, casesDecided: 0, overturnedOnAppeal: 0, noShows: 0, cooldownUntil: null, feesEarned: 0, joinedAt: ctx.now };
    emit(s, ctx, { program: "dispute", name: "ArbitratorRegistered", receipt: `${shortAddress(ctx.actor)} staked ${formatUsdc(a.stake)} and applied to the arbitrator registry (pending DAO approval).` });
  },

  addStake(s: ChainState, ctx: Ctx, a: { amount: number }) {
    const arb = s.arbitrators[ctx.actor] ?? fail("dispute", "NotArbitrator", "Not a registered arbitrator");
    debit(s, ctx.actor, a.amount, "dispute");
    arb.stake += a.amount;
    emit(s, ctx, { program: "dispute", name: "StakeAdded", amount: a.amount, receipt: `${shortAddress(ctx.actor)} added ${formatUsdc(a.amount)} to their arbitrator stake.` });
  },

  claimFees(s: ChainState, ctx: Ctx, _a: Record<string, never> = {}) {
    void _a;
    const arb = s.arbitrators[ctx.actor] ?? fail("dispute", "NotArbitrator", "Not a registered arbitrator");
    if (arb.feesEarned <= 0) fail("dispute", "NothingToClaim", "No fees to claim");
    credit(s, ctx.actor, arb.feesEarned);
    emit(s, ctx, { program: "dispute", name: "FeesClaimed", amount: arb.feesEarned, receipt: `${shortAddress(ctx.actor)} claimed ${formatUsdc(arb.feesEarned)} in arbitration fees.` });
    arb.feesEarned = 0;
  },

  // receivables program
  mintReceivable(s: ChainState, ctx: Ctx, a: { milestone: Address }) {
    const m = getMilestone(s, a.milestone);
    const gig = getGig(s, m.gig);
    if (gig.freelancer !== ctx.actor) fail("receivables", "Unauthorized", "Only the freelancer can mint the receivable");
    if (m.status !== "submitted") fail("receivables", "NotSubmitted", "Only a delivered (Submitted) milestone can be tokenized");
    if (!m.termsAccepted) fail("receivables", "TermsNotAccepted", "Receivables need accepted terms");
    if (m.receivable) fail("receivables", "AlreadyMinted", "One receivable per milestone");
    const remaining = lockedRemaining(m);
    const face = remaining - releaseFee(remaining, { feeBps: m.terms?.feeBps ?? s.protocol.feeBps });
    const address = mockAddress(`receivable:${m.address}`);
    s.receivables[address] = { address, milestone: m.address, gig: gig.address, freelancer: ctx.actor, owner: ctx.actor, faceValue: face, askPrice: null, status: "active", mintedAt: ctx.now, sales: [] };
    m.receivable = address;
    emit(s, ctx, { program: "receivables", name: "ReceivableMinted", gig: gig.address, milestone: m.address, amount: face, receipt: `Receivable NFT minted for “${m.title}” with a face value of ${formatUsdc(face)}.` });
    return address;
  },

  listReceivable(s: ChainState, ctx: Ctx, a: { receivable: Address; price: number }) {
    const r = s.receivables[a.receivable] ?? fail("receivables", "NotFound", "Receivable not found");
    if (r.owner !== ctx.actor) fail("receivables", "NotOwner", "You don't hold this receivable");
    if (r.status !== "active") fail("receivables", "Settled", "Receivable already settled");
    if (a.price <= 0 || a.price > r.faceValue) fail("receivables", "InvalidPrice", "Price must be between 0 and the face value");
    r.askPrice = a.price;
    emit(s, ctx, { program: "receivables", name: "ReceivableListed", amount: a.price, receipt: `Receivable listed at ${formatUsdc(a.price)} (${(((r.faceValue - a.price) / r.faceValue) * 100).toFixed(1)}% discount to face).` });
  },

  delistReceivable(s: ChainState, ctx: Ctx, a: { receivable: Address }) {
    const r = s.receivables[a.receivable] ?? fail("receivables", "NotFound", "Receivable not found");
    if (r.owner !== ctx.actor) fail("receivables", "NotOwner", "You don't hold this receivable");
    r.askPrice = null;
  },

  buyReceivable(s: ChainState, ctx: Ctx, a: { receivable: Address }) {
    const r = s.receivables[a.receivable] ?? fail("receivables", "NotFound", "Receivable not found");
    if (r.status !== "active" || r.askPrice === null) fail("receivables", "NotListed", "Receivable is not for sale");
    if (r.owner === ctx.actor) fail("receivables", "AlreadyOwner", "You already hold it");
    const m = s.milestones[r.milestone];
    if (m.status === "disputed") fail("receivables", "Disputed", "Can't buy while the milestone is disputed");
    debit(s, ctx.actor, r.askPrice!, "receivables");
    credit(s, r.owner, r.askPrice!);
    r.sales.push({ from: r.owner, to: ctx.actor, price: r.askPrice!, at: ctx.now });
    notify(s, ctx, r.owner, `Your receivable for “${m.title}” sold for ${formatUsdc(r.askPrice!)}.`, `/receivables`);
    emit(s, ctx, { program: "receivables", name: "ReceivableSold", milestone: m.address, amount: r.askPrice!, actors: [ctx.actor, r.owner], receipt: `${shortAddress(ctx.actor)} bought the receivable for “${m.title}” for ${formatUsdc(r.askPrice!)}; escrow now pays them on release.` });
    r.owner = ctx.actor;
    r.askPrice = null;
  },

  // governance (SPL Governance + Proove config programs)
  createProposal(s: ChainState, ctx: Ctx, a: { title: string; description: string; changes: SettingChange[] }) {
    const persona = s.personas.find((p) => p.address === ctx.actor);
    if (!persona?.council) fail("governance", "NotCouncil", "Phase 2: only council members can create proposals");
    if (!a.title.trim()) fail("governance", "TitleRequired", "Proposal needs a title");
    for (const ch of a.changes) validateChange(ch);
    const id = s.proposals.reduce((mx, p) => Math.max(mx, p.id), 0) + 1;
    s.proposals.unshift({ id, title: a.title.trim(), description: a.description.trim(), author: ctx.actor, changes: a.changes, status: "voting", votesFor: 0, votesAgainst: 0, votesAbstain: 0, quorum: 2, createdAt: ctx.now, votingEndsAt: ctx.now + 3 * DAY, timelockEndsAt: null, executedAt: null, votes: {} });
    emit(s, ctx, { program: "governance", name: "ProposalCreated", receipt: `Proposal #${id} “${a.title}” opened for a 3-day vote.` });
  },

  castVote(s: ChainState, ctx: Ctx, a: { proposal: number; choice: "for" | "against" | "abstain" }) {
    const p = s.proposals.find((x) => x.id === a.proposal) ?? fail("governance", "NotFound", "Proposal not found");
    if (p.status !== "voting" || ctx.now > p.votingEndsAt) fail("governance", "VotingClosed", "Voting has ended");
    const persona = s.personas.find((x) => x.address === ctx.actor);
    if (!persona?.council) fail("governance", "NoVotingPower", "Phase 2: only council members hold voting power");
    const prev = p.votes[ctx.actor];
    if (prev) {
      if (prev === "for") p.votesFor -= 1;
      else if (prev === "against") p.votesAgainst -= 1;
      else p.votesAbstain -= 1;
    }
    p.votes[ctx.actor] = a.choice;
    if (a.choice === "for") p.votesFor += 1;
    else if (a.choice === "against") p.votesAgainst += 1;
    else p.votesAbstain += 1;
    emit(s, ctx, { program: "governance", name: "VoteCast", receipt: `${shortAddress(ctx.actor)} voted ${a.choice} on proposal #${p.id}.` });
  },

  executeProposal(s: ChainState, ctx: Ctx, a: { proposal: number }) {
    const p = s.proposals.find((x) => x.id === a.proposal) ?? fail("governance", "NotFound", "Proposal not found");
    if (p.status !== "timelock" || ctx.now < (p.timelockEndsAt ?? Infinity)) fail("governance", "TimelockActive", "The 48 h timelock hasn't passed");
    executeChanges(s, ctx, p);
  },

  vetoProposal(s: ChainState, ctx: Ctx, a: { proposal: number }) {
    const p = s.proposals.find((x) => x.id === a.proposal) ?? fail("governance", "NotFound", "Proposal not found");
    if (!s.personas.find((x) => x.address === ctx.actor)?.council) fail("governance", "NotCouncil", "Only the council can veto");
    if (!["voting", "succeeded", "timelock"].includes(p.status)) fail("governance", "NotVetoable", "Proposal is final");
    p.status = "vetoed";
    emit(s, ctx, { program: "governance", name: "ProposalVetoed", receipt: `Council vetoed proposal #${p.id}.` });
  },

  // Solana Attestation Service
  issueCredential(s: ChainState, ctx: Ctx, a: { schema: CredentialSchema }) {
    const p = s.profiles[ctx.actor];
    if (a.schema !== "proove.arbitrator.v1" && !p) fail("sas", "NoProfile", "No reputation profile to attest yet");
    const arb = s.arbitrators[ctx.actor];
    if (a.schema === "proove.arbitrator.v1" && !arb) fail("sas", "NotArbitrator", "Only arbitrators can request this credential");
    const topCategories = [...new Set(Object.values(s.gigs).filter((g) => g.freelancer === ctx.actor && g.status === "completed").map((g) => g.category))].slice(0, 3).join(", ") || "—";
    const fields: Record<string, string | number> =
      a.schema === "proove.arbitrator.v1"
        ? { cases_decided: arb!.casesDecided, overturned_on_appeal: arb!.overturnedOnAppeal, no_shows: arb!.noShows, stake: formatUsdc(arb!.stake) }
        : {
            completed_jobs: p!.completedJobs,
            successful_jobs: p!.successfulJobs,
            on_time_jobs: p!.onTimeJobs,
            average_rating: (p!.averageRating / 100).toFixed(2),
            reputation_score: p!.reputationScore,
            disputes_won: p!.disputesWon,
            disputes_lost: p!.disputesLost,
            top_categories: topCategories,
            ...(a.schema === "proove.work-full.v1" ? { total_earnings: formatUsdc(p!.totalEarnings) } : {}),
          };
    s.counter += 1;
    const address = mockAddress(`attestation:${ctx.actor}:${s.counter}`);
    s.credentials.unshift({
      address,
      schema: a.schema,
      subject: ctx.actor,
      issuer: "Proove1ssuer1111111111111111111111111111111",
      fields,
      sources: a.schema === "proove.arbitrator.v1" ? [{ account: mockAddress(`arbitrator-pda:${ctx.actor}`), label: "Arbitrator PDA" }] : [{ account: mockAddress(`profile-pda:${ctx.actor}`), label: "UserProfile PDA" }],
      asOfSlot: slotAt(ctx.now),
      issuedAt: ctx.now,
      expiresAt: ctx.now + 90 * DAY,
      revoked: false,
    });
    emit(s, ctx, { program: "sas", name: "AttestationCreated", receipt: `Issued a ${a.schema} credential to ${shortAddress(ctx.actor)}, valid 90 days.` });
    return address;
  },

  revokeCredential(s: ChainState, ctx: Ctx, a: { credential: Address }) {
    const c = s.credentials.find((x) => x.address === a.credential) ?? fail("sas", "NotFound", "Credential not found");
    if (c.subject !== ctx.actor) fail("sas", "Unauthorized", "Only the subject can revoke");
    c.revoked = true;
    emit(s, ctx, { program: "sas", name: "AttestationRevoked", receipt: `${shortAddress(ctx.actor)} revoked a ${c.schema} credential.` });
  },

  // mock-only helpers
  airdrop(s: ChainState, ctx: Ctx, a: { amount: number }) {
    credit(s, ctx.actor, a.amount);
    emit(s, ctx, { program: "escrow", name: "DevnetAirdrop", amount: a.amount, receipt: `Devnet faucet sent ${formatUsdc(a.amount)} to ${shortAddress(ctx.actor)}.` });
  },
};

export type Instructions = typeof instructions;
export type InstructionName = keyof Instructions;
export type InstructionArgs<K extends InstructionName> = Parameters<Instructions[K]>[2];

// ─── Verdict resolution & governance helpers ────────────────────────────────

function resolveVerdicts(s: ChainState, ctx: Ctx, c: DisputeCase) {
  if (c.verdicts.length < c.requiredArbitrators) return;
  const [a, b] = c.verdicts;
  if (c.requiredArbitrators === 1 || a.ruling === b.ruling) {
    finalizeRound(s, ctx, c, a.ruling);
    return;
  }
  const fallback = pickArbitrators(s, c, 1, [...c.arbitrators, ...c.noShows])[0];
  c.status = "tieBreak";
  c.fallback = fallback;
  c.deadlines.tieBreak = ctx.now + DAY;
  if (fallback) {
    s.arbitrators[fallback].activeCases += 1;
    notify(s, ctx, fallback, `Tie-break needed on case ${shortAddress(c.address)}: pick one of two signed rulings within 24 h.`, `/disputes/${c.address}`);
  }
  c.timeline.push({ at: ctx.now, kind: "tie", text: `Arbitrators disagree (${formatRuling(a.ruling)} vs ${formatRuling(b.ruling)}). A fallback arbitrator picks one within 24 h.` });
}

function finalizeRound(s: ChainState, ctx: Ctx, c: DisputeCase, ruling: Bps) {
  c.finalRuling = ruling;
  if (c.round === 2) {
    c.status = "appealWindow";
    c.timeline.push({ at: ctx.now, kind: "final", text: `Round-2 verdict is final: ${formatRuling(ruling)}. Settling now.` });
    executeRuling(s, ctx, c, ruling);
    return;
  }
  c.status = "appealWindow";
  c.deadlines.appeal = ctx.now + s.disputeConfig.appealWindow;
  c.timeline.push({ at: ctx.now, kind: "verdict", text: `Verdict: ${formatRuling(ruling)}. 48 h appeal window open; both parties can waive it to settle at once.` });
  for (const who of [c.client, c.freelancer]) notify(s, ctx, who, `Verdict on case ${shortAddress(c.address)}: ${formatRuling(ruling)}. You can appeal within 48 h.`, `/disputes/${c.address}`);
}

function validateChange(ch: SettingChange) {
  const range = SETTING_RANGES[`${ch.account}.${ch.key}`];
  if (!range) return;
  const v = Number(ch.to);
  if (!Number.isFinite(v) || v < range.min || v > range.max) fail("governance", "OutOfRange", `${range.label} must be between ${range.format(range.min)} and ${range.format(range.max)} (enforced in program code)`);
}

export function executeChanges(s: ChainState, ctx: Ctx, p: Proposal) {
  for (const ch of p.changes) {
    validateChange(ch);
    if (ch.account === "ProtocolConfig") (s.protocol as unknown as Record<string, number>)[ch.key] = Number(ch.to);
    else if (ch.account === "DisputeConfig") (s.disputeConfig as unknown as Record<string, number>)[ch.key] = Number(ch.to);
    else if (ch.account === "AiRegistry") {
      const e = s.aiRegistry.find((x) => x.job === ch.key);
      if (e) {
        e.model = String(ch.to);
        e.promptHash = mockHash(`prompt:${ch.key}:${ch.to}`);
        e.approvedAt = ctx.now;
      }
    } else if (ch.account === "Treasury") {
      const amount = Number(ch.to);
      if (amount > s.treasury.balance) fail("governance", "TreasuryInsufficient", "Treasury balance too low");
      s.treasury.balance -= amount;
      credit(s, String(ch.from), amount);
    }
  }
  p.status = "executed";
  p.executedAt = ctx.now;
  emit(s, ctx, { program: "governance", name: "ProposalExecuted", actors: [ctx.actor, TREASURY], receipt: `Proposal #${p.id} executed after its timelock; it applies only to milestones funded from now on.` });
}

export const _internal = { finalizeRound, resolveVerdicts };

export const USDC_UNIT = USDC;

export type { CriterionFinding };
