/**
 * Demo dataset, built by replaying instructions at past timestamps (plus a
 * few "prior history" counters), so every fixture is a state the real
 * programs could actually reach.
 */
import type { Address, AiRegistryEntry, MilestoneSpec, Persona, PersonaProfile, VerificationReport } from "@/lib/domain/types";
import { ZERO_HASH } from "@/lib/domain/types";
import { hashDocument, mockAddress, mockHash } from "@/lib/domain/hash";
import { DAY, HOUR, USDC } from "@/lib/domain/format";
import { MOCK_MODELS, PROMPT_HASHES } from "./ai";
import { ensureProfile, instructions as ix, refreshProfile, type Ctx } from "./instructions";
import { keeperTick } from "./keeper";
import { STATE_VERSION, USDC_MINT, type ChainState } from "./state";

const addr = (name: string) => mockAddress(`persona:${name}`);

export const P = {
  ava: addr("ava"),
  priya: addr("priya"),
  kai: addr("kai"),
  sana: addr("sana"),
  tomas: addr("tomas"),
  yuki: addr("yuki"),
  leo: addr("leo"),
  mira: addr("mira"),
  jonas: addr("jonas"),
  elena: addr("elena"),
  ravi: addr("ravi"),
};

const PERSONAS: Persona[] = [
  { address: P.ava, name: "Ava Chen", description: "Client · runs Northwind Studio", defaultRole: "client" },
  { address: P.kai, name: "Kai Mensah", description: "Freelancer · brand & product designer", defaultRole: "freelancer" },
  { address: P.priya, name: "Priya Nair", description: "Client · founder at Fieldnote", defaultRole: "client" },
  { address: P.sana, name: "Sana Iqbal", description: "Freelancer · data labeling lead", defaultRole: "freelancer" },
  { address: P.mira, name: "Mira Okafor", description: "Arbitrator · council member", defaultRole: "freelancer", council: true },
  { address: P.leo, name: "Leo Park", description: "Receivables buyer", defaultRole: "client" },
];

const PEOPLE: PersonaProfile[] = [
  { address: P.ava, name: "Ava Chen", headline: "Creative director at Northwind Studio", skills: [], categories: ["Graphics & Design"], hue: 330 },
  { address: P.priya, name: "Priya Nair", headline: "Founder, Fieldnote", skills: [], categories: ["Programming & Tech"], hue: 200 },
  { address: P.kai, name: "Kai Mensah", headline: "Brand identities, product UI, illustration", skills: ["Figma", "Brand systems", "Illustration", "Next.js"], categories: ["Graphics & Design", "Programming & Tech"], hue: 340 },
  { address: P.sana, name: "Sana Iqbal", headline: "Computer-vision data labeling at scale", skills: ["COCO", "CVAT", "QA sampling"], categories: ["AI Services"], hue: 160 },
  { address: P.tomas, name: "Tomás Ruiz", headline: "Solana programs and audits", skills: ["Anchor", "Rust", "Security"], categories: ["Programming & Tech"], hue: 260 },
  { address: P.yuki, name: "Yuki Tanaka", headline: "Technical writer & translator (EN/ES/JA)", skills: ["Docs", "Translation", "Copywriting"], categories: ["Writing & Translation"], hue: 40 },
  { address: P.leo, name: "Leo Park", headline: "Buys funded receivables", skills: [], categories: [], hue: 100 },
  { address: P.mira, name: "Mira Okafor", headline: "Arbitrator · ex-product lead", skills: ["Arbitration"], categories: [], hue: 280 },
  { address: P.jonas, name: "Jonas Weber", headline: "Arbitrator · design ops", skills: ["Arbitration"], categories: [], hue: 210 },
  { address: P.elena, name: "Elena Rossi", headline: "Arbitrator · software lead", skills: ["Arbitration"], categories: [], hue: 20 },
  { address: P.ravi, name: "Ravi Shah", headline: "Arbitrator · data QA", skills: ["Arbitration"], categories: [], hue: 120 },
];

function registry(now: number): AiRegistryEntry[] {
  return [
    { job: "scope", label: "Scope Compiler", model: MOCK_MODELS.scope, promptHash: PROMPT_HASHES.scope, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "verify", label: "Delivery Verifier", model: MOCK_MODELS.verify, promptHash: PROMPT_HASHES.verify, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "brief", label: "Neutral brief", model: MOCK_MODELS.brief, promptHash: PROMPT_HASHES.brief, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "seatA", label: "Seat A · neutral", model: MOCK_MODELS.seatA, promptHash: PROMPT_HASHES.seatNeutral, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "seatB", label: "Seat B · neutral, different model", model: MOCK_MODELS.seatB, promptHash: PROMPT_HASHES.seatNeutral, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "seatC", label: "Seat C · skeptic", model: MOCK_MODELS.seatC, promptHash: PROMPT_HASHES.seatSkeptic, backupModel: MOCK_MODELS.backup, approvedAt: now - 40 * DAY },
    { job: "receipts", label: "Plain-language receipts", model: "gemini-3.8-flash-lite", promptHash: mockHash("prompt:receipts:v1"), backupModel: null, approvedAt: now - 40 * DAY },
    { job: "conflicts", label: "Conflict check", model: "gemini-3.8-flash-lite", promptHash: mockHash("prompt:conflicts:v1"), backupModel: null, approvedAt: now - 40 * DAY },
  ];
}

export function emptyState(now: number): ChainState {
  return {
    version: STATE_VERSION,
    clockOffset: 0,
    persona: null,
    role: "client",
    personas: PERSONAS,
    people: Object.fromEntries(PEOPLE.map((p) => [p.address, p])),
    gigs: {},
    milestones: {},
    profiles: {},
    ratings: [],
    badges: [],
    cases: {},
    evidence: [],
    arbitrators: {},
    protocol: { partialTimeout: 72 * HOUR, fullTimeout: 7 * DAY, partialBps: 2000, feeBps: 50, minMilestone: 5 * USDC, noDeliveryGrace: 3 * DAY },
    disputeConfig: {
      evidenceWindow: 72 * HOUR,
      aiWindow: 12 * HOUR,
      arbitrationWindow: 48 * HOUR,
      appealWindow: 48 * HOUR,
      humanOnlyWindow: 96 * HOUR,
      bondBps: 500,
      bondMin: 2 * USDC,
      feeBps: 300,
      feeMin: 3 * USDC,
      humanOnlyFeeBps: 500,
      noShowSlashBps: 1000,
      arbitratorStake: 200 * USDC,
      highValueThreshold: 500 * USDC,
      hardDeadline: 21 * DAY,
      aiAttempts: 3,
      backupAttempts: 2,
    },
    aiRegistry: registry(now),
    proposals: [],
    treasury: { balance: 1_240 * USDC, feePool: 18 * USDC },
    credentials: [],
    receivables: {},
    balances: {},
    events: [],
    notifications: [],
    dev: { failNextTx: false, aiFailure: "none", deliveryQuality: 0.85, txLatency: 550 },
    counter: 0,
    arbitratorCursor: 0,
  };
}

function spec(gig: Address, index: number, title: string, amount: number, deadline: number, criteria: MilestoneSpec["criteria"], deliverables: MilestoneSpec["deliverables"]): MilestoneSpec {
  return {
    schema: "proove.milestone-spec.v1",
    gig,
    index,
    title,
    amount: String(amount),
    mint: USDC_MINT,
    deliverables,
    criteria,
    deadline,
    generated_by: { model: MOCK_MODELS.scope, prompt_version: PROMPT_HASHES.scope },
    edited_by_client: true,
  };
}

function report(milestone: Address, sp: MilestoneSpec, verdicts: ("pass" | "fail" | "unclear")[], at: number, slot: number): VerificationReport {
  return {
    schema: "proove.verification-report.v1",
    milestone,
    findings: sp.criteria.map((c, i) => ({
      criterion: c.id,
      verdict: verdicts[i] ?? "pass",
      confidence: verdicts[i] === "unclear" ? 0.45 : 0.86,
      evidence: verdicts[i] === "unclear" ? [] : [{ file: "delivery.zip", locator: c.check === "sampled" ? "item-0042" : `section ${i + 1}` }],
      note: verdicts[i] === "fail" ? "Not met as written; see the cited section." : verdicts[i] === "unclear" ? "Subjective; left to the client." : "Met as written.",
    })),
    summary: `${verdicts.filter((v) => v === "pass").length} of ${sp.criteria.length} criteria pass. This report is advice only.`,
    model: MOCK_MODELS.verify,
    prompt_version: PROMPT_HASHES.verify,
    input_hashes: [hashDocument(sp)],
    created_at: at,
    samples: sp.criteria
      .filter((c) => c.check === "sampled")
      .map((c) => ({ criterion: c.id, seedSlot: slot + 2, seed: mockHash(`slot:${slot + 2}`), items: Array.from({ length: c.sample_size ?? 20 }, (_, k) => `item-${String((k * 37) % 500).padStart(4, "0")}`), agreementRate: 0.94 })),
  };
}

const files = (name: string, n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    name: i === 0 ? name : `notes-${i}.md`,
    size: 1_200_000 + i * 48_000,
    mime: i === 0 ? "application/zip" : "text/markdown",
    plaintextHash: mockHash(`${name}:${i}`),
    uri: `ar://${mockHash(`${name}:ct:${i}`).slice(0, 43)}`,
  }));

export function buildSeed(now: number): ChainState {
  const s = emptyState(now);
  const at = (actor: Address, offset: number): Ctx => ({ actor, now: now + offset });
  const tickAt = (offset: number) => {
    for (let i = 0; i < 12; i++) if (!keeperTick(s, now + offset)) break;
  };

  // Wallet balances (devnet USDC).
  Object.assign(s.balances, {
    [P.ava]: 24_500 * USDC,
    [P.priya]: 11_800 * USDC,
    [P.kai]: 820 * USDC,
    [P.sana]: 310 * USDC,
    [P.tomas]: 1_900 * USDC,
    [P.yuki]: 420 * USDC,
    [P.leo]: 9_600 * USDC,
    [P.mira]: 540 * USDC,
    [P.jonas]: 300 * USDC,
    [P.elena]: 300 * USDC,
    [P.ravi]: 300 * USDC,
  });

  // Prior history (v1-era jobs) so profiles aren't empty.
  const prior: [Address, number, number, number, number, number, number, number][] = [
    // who, completed, successful, onTime, earnings, ratingSum, ratingCount, disputesWon
    [P.kai, 13, 13, 12, 18_400, 61, 13, 1],
    [P.sana, 31, 30, 30, 22_900, 147, 30, 0],
    [P.tomas, 22, 21, 19, 61_000, 103, 22, 1],
    [P.yuki, 6, 6, 5, 3_100, 28, 6, 0],
  ];
  for (const [who, c, ok, onTime, earn, rsum, rcount, won] of prior) {
    const p = ensureProfile(s, who, now - 200 * DAY);
    Object.assign(p, { completedJobs: c, successfulJobs: ok, onTimeJobs: onTime, totalEarnings: earn * USDC, ratingSum: rsum, ratingCount: rcount, disputesWon: won });
    s.badges.push({ type: "FirstGig", profile: who, issuedAt: now - 190 * DAY, minted: true, assetId: mockAddress(`v1badge:${who}:first`), version: "v1" });
    p.badgesEarned += 1;
    if (c >= 10) {
      s.badges.push({ type: "TenCompletedJobs", profile: who, issuedAt: now - 90 * DAY, minted: true, assetId: mockAddress(`v1badge:${who}:ten`), version: "v1" });
      p.badgesEarned += 1;
    }
    refreshProfile(s, at(who, -60 * DAY), p);
  }

  // Arbitrator registry (DAO-approved, staked).
  for (const [who, stake, decided] of [[P.mira, 400, 9], [P.jonas, 250, 14], [P.elena, 300, 6], [P.ravi, 200, 3]] as const) {
    s.arbitrators[who] = { authority: who, stake: stake * USDC, status: "active", activeCases: 0, casesDecided: decided, overturnedOnAppeal: who === P.jonas ? 1 : 0, noShows: 0, cooldownUntil: null, feesEarned: who === P.mira ? 24 * USDC : 0, joinedAt: now - 120 * DAY };
  }

  // ── g1: data labeling, delivered and awaiting approval ──
  const g1 = ix.createGig(s, at(P.ava, -10 * DAY), { title: "Label 500 product images for a retail catalog", description: "Bounding boxes and class labels for 500 catalog photos, following our labeling guideline v3. COCO JSON export.", category: "AI Services", skills: ["COCO", "Bounding boxes"], budget: 300 * USDC, deadline: now + 5 * DAY });
  ix.assignFreelancer(s, at(P.ava, -9.8 * DAY), { gig: g1, freelancer: P.sana });
  const g1s0 = spec(g1, 0, "Pilot batch (10%)", 60 * USDC, now - 6 * DAY, [
    { id: "c1", text: "Every image in the pilot batch has at least one bounding box", check: "automatic", weight: 2 },
    { id: "c2", text: "Labels follow the attached guideline v3", check: "sampled", sample_size: 20, pass_threshold: 0.9 },
  ], [{ id: "d1", kind: "dataset", format: "COCO JSON" }]);
  const g1m0 = ix.createMilestone(s, at(P.ava, -9.7 * DAY), { gig: g1, title: g1s0.title, amount: 60 * USDC, spec: g1s0, specHash: hashDocument(g1s0) });
  ix.acceptTerms(s, at(P.sana, -9.6 * DAY), { milestone: g1m0, specHash: hashDocument(g1s0) });
  ix.fundMilestone(s, at(P.ava, -9.5 * DAY), { milestone: g1m0 });
  const r0 = report(g1m0, g1s0, ["pass", "pass"], now - 7 * DAY, 0);
  ix.submitDelivery(s, at(P.sana, -7 * DAY), { milestone: g1m0, files: files("pilot-coco.zip"), note: "Pilot batch of 50 images.", deliveryHash: mockHash("g1m0:manifest"), reportHash: hashDocument(r0), report: r0 });
  ix.approveMilestone(s, at(P.ava, -6.5 * DAY), { milestone: g1m0 });
  const g1s1 = spec(g1, 1, "Full dataset", 240 * USDC, now + 5 * DAY, [
    { id: "c1", text: "Every image has at least one bounding box", check: "automatic", weight: 2 },
    { id: "c2", text: "Labels follow the attached guideline v3", check: "sampled", sample_size: 50, pass_threshold: 0.9 },
    { id: "c3", text: "No duplicate image IDs in the export", check: "automatic", weight: 1 },
  ], [{ id: "d1", kind: "dataset", format: "COCO JSON" }]);
  const g1m1 = ix.createMilestone(s, at(P.ava, -6.4 * DAY), { gig: g1, title: g1s1.title, amount: 240 * USDC, spec: g1s1, specHash: hashDocument(g1s1) });
  ix.acceptTerms(s, at(P.sana, -6.3 * DAY), { milestone: g1m1, specHash: hashDocument(g1s1) });
  ix.fundMilestone(s, at(P.ava, -6.2 * DAY), { milestone: g1m1 });
  const sub1 = now - 20 * HOUR;
  const r1 = report(g1m1, g1s1, ["pass", "pass", "pass"], sub1, Math.floor((sub1 - 1_600_000_000) * 2.5));
  ix.submitDelivery(s, at(P.sana, -20 * HOUR), { milestone: g1m1, files: files("catalog-coco-v1.zip", 3), note: "All 500 images labeled. Guideline v3 followed; edge cases noted in notes-1.md.", deliveryHash: mockHash("g1m1:manifest"), reportHash: hashDocument(r1), report: r1 });

  // ── g2: brand identity, disputed, in arbitration (two arbitrators) ──
  const g2 = ix.createGig(s, at(P.ava, -16 * DAY), { title: "Brand identity for Northwind Coffee", description: "Logo, colour system and a one-page brand guide for a specialty coffee roaster.", category: "Graphics & Design", skills: ["Logo", "Brand systems"], budget: 900 * USDC, deadline: now - 3 * DAY });
  ix.assignFreelancer(s, at(P.ava, -15.8 * DAY), { gig: g2, freelancer: P.kai });
  const g2s0 = spec(g2, 0, "Concepts", 270 * USDC, now - 11 * DAY, [
    { id: "c1", text: "Three distinct logo concepts are delivered", check: "automatic", weight: 1 },
    { id: "c2", text: "Each concept uses the brand colours from the brief", check: "manual", weight: 1 },
  ], [{ id: "d1", kind: "images", format: "PNG + PDF board" }]);
  const g2m0 = ix.createMilestone(s, at(P.ava, -15.7 * DAY), { gig: g2, title: g2s0.title, amount: 270 * USDC, spec: g2s0, specHash: hashDocument(g2s0) });
  ix.acceptTerms(s, at(P.kai, -15.6 * DAY), { milestone: g2m0, specHash: hashDocument(g2s0) });
  ix.fundMilestone(s, at(P.ava, -15.5 * DAY), { milestone: g2m0 });
  const r20 = report(g2m0, g2s0, ["pass", "pass"], now - 12 * DAY, 0);
  ix.submitDelivery(s, at(P.kai, -12 * DAY), { milestone: g2m0, files: files("northwind-concepts.pdf"), note: "Three directions: Ember, Grain, Harbor.", deliveryHash: mockHash("g2m0:manifest"), reportHash: hashDocument(r20), report: r20 });
  ix.approveMilestone(s, at(P.ava, -11.5 * DAY), { milestone: g2m0 });
  const g2s1 = spec(g2, 1, "Final files", 630 * USDC, now - 3 * DAY, [
    { id: "c1", text: "Vector source files open without missing fonts", check: "automatic", weight: 2 },
    { id: "c2", text: "Light and dark variants of the logo are included", check: "automatic", weight: 1 },
    { id: "c3", text: "Round-1 feedback on the Harbor concept is applied", check: "manual", weight: 2 },
    { id: "c4", text: "Brand guide covers colour, type and clear-space rules", check: "manual", weight: 1 },
  ], [{ id: "d1", kind: "vector", format: "SVG + AI" }, { id: "d2", kind: "document", format: "PDF brand guide" }]);
  const g2m1 = ix.createMilestone(s, at(P.ava, -11.4 * DAY), { gig: g2, title: g2s1.title, amount: 630 * USDC, spec: g2s1, specHash: hashDocument(g2s1) });
  ix.acceptTerms(s, at(P.kai, -11.3 * DAY), { milestone: g2m1, specHash: hashDocument(g2s1) });
  ix.fundMilestone(s, at(P.ava, -11.2 * DAY), { milestone: g2m1 });
  const r21 = report(g2m1, g2s1, ["pass", "fail", "unclear", "pass"], now - 5 * DAY, 0);
  ix.submitDelivery(s, at(P.kai, -5 * DAY), { milestone: g2m1, files: files("northwind-final.zip", 3), note: "Final Harbor logo, SVG/AI sources and the brand guide.", deliveryHash: mockHash("g2m1:manifest"), reportHash: hashDocument(r21), report: r21 });
  const c1 = ix.raiseDispute(s, at(P.ava, -4.4 * DAY), { milestone: g2m1, reason: "The dark variant is missing and the Harbor feedback (thicker wordmark, warmer brown) wasn't applied. The guide also skips clear-space rules.", humanOnly: false });
  ix.submitEvidence(s, at(P.ava, -4.3 * DAY), { case: c1, label: "Round-1 feedback email", text: "Feedback sent after concepts: go with Harbor, make the wordmark heavier, shift the brown warmer (#7A4A2B), and add a dark-background variant.", contentHash: mockHash("ev:ava:1") });
  ix.submitEvidence(s, at(P.ava, -4.2 * DAY), { case: c1, label: "Screenshot of delivered folder", text: "The delivered zip contains logo-light.svg and logo-light.ai only. No dark variant file exists.", contentHash: mockHash("ev:ava:2") });
  ix.submitEvidence(s, at(P.kai, -3.8 * DAY), { case: c1, label: "Revision log", text: "Wordmark weight changed from 500 to 650 and brown shifted to #7A4A2B in v3 (see page 4 of the guide). Dark variant is embedded as an artboard inside logo-light.ai.", contentHash: mockHash("ev:kai:1") });
  ix.submitEvidence(s, at(P.kai, -3.7 * DAY), { case: c1, label: "Chat log on clear space", text: "Client said on day 9: 'skip clear space for now, we'll do it with the packaging work'.", contentHash: mockHash("ev:kai:2") });
  tickAt(-1.4 * DAY); // evidence closes → AI phase: brief, seats, assignment
  for (let i = 0; i < 6; i++) keeperTick(s, now - 1.4 * DAY + i * 600);
  const case1 = s.cases[c1];
  const other = case1.arbitrators.find((a) => a !== P.mira);
  if (other) {
    ix.submitVerdict(s, at(other, -6 * HOUR), {
      case: c1,
      ruling: 7500,
      reasonHash: mockHash("verdict:jonas"),
      seatAnswers: {
        A: "Seat A treats the missing dark export as a fail; the artboard inside the .ai file is a usable dark variant, so I count it as partial.",
        B: "Seat B agrees with A on c2; same answer.",
        C: "Seat C's skeptic case weighs c3 heavily, but the revision log shows the Harbor feedback was applied.",
      },
      reasons: g2s1.criteria.map((c) => ({ criterion: c.id, text: c.id === "c2" ? "The dark variant exists as an artboard inside the .ai file, but not as a separate export as the criterion implies. Partially met." : c.id === "c4" ? "Client's own message deferred clear-space rules; not held against the freelancer." : "Met on the evidence." })),
    });
  }

  // ── g3: Solana dashboard, funded milestone awaiting delivery + spec awaiting acceptance ──
  const g3 = ix.createGig(s, at(P.priya, -4 * DAY), { title: "Solana escrow analytics dashboard", description: "A Next.js dashboard showing value locked, releases and disputes from our program's events.", category: "Programming & Tech", skills: ["Next.js", "Solana", "Charts"], budget: 1_500 * USDC, deadline: now + 12 * DAY });
  ix.assignFreelancer(s, at(P.priya, -3.8 * DAY), { gig: g3, freelancer: P.kai });
  const g3s0 = spec(g3, 0, "Working prototype", 600 * USDC, now + 4 * DAY, [
    { id: "c1", text: "Project builds from a clean checkout with `pnpm build`", check: "automatic", weight: 2 },
    { id: "c2", text: "Shows value locked and releases per day from devnet events", check: "manual", weight: 2 },
    { id: "c3", text: "Usable at 375 px width", check: "manual", weight: 1 },
  ], [{ id: "d1", kind: "code", format: "Git repository" }]);
  const g3m0 = ix.createMilestone(s, at(P.priya, -3.7 * DAY), { gig: g3, title: g3s0.title, amount: 600 * USDC, spec: g3s0, specHash: hashDocument(g3s0) });
  ix.acceptTerms(s, at(P.kai, -3.6 * DAY), { milestone: g3m0, specHash: hashDocument(g3s0) });
  ix.fundMilestone(s, at(P.priya, -3.5 * DAY), { milestone: g3m0 });
  const g3s1 = spec(g3, 1, "Production release", 900 * USDC, now + 12 * DAY, [
    { id: "c1", text: "All automated tests pass in CI", check: "automatic", weight: 2 },
    { id: "c2", text: "README documents setup, env vars and deploy", check: "manual", weight: 1 },
    { id: "c3", text: "Dispute timeline view matches the indexer API", check: "manual", weight: 2 },
  ], [{ id: "d1", kind: "code", format: "Git repository" }, { id: "d2", kind: "document", format: "README" }]);
  ix.createMilestone(s, at(P.priya, -1 * DAY), { gig: g3, title: g3s1.title, amount: 900 * USDC, spec: g3s1, specHash: hashDocument(g3s1) });

  // ── g4 / g5: open gigs with applicants ──
  const g4 = ix.createGig(s, at(P.ava, -2 * DAY), { title: "Landing page copy for a self-custody wallet", description: "Hero, three feature sections and an FAQ. Plain English, no hype. ~900 words.", category: "Writing & Translation", skills: ["Copywriting", "Web3"], budget: 350 * USDC, deadline: now + 9 * DAY, brief: "Landing page copy for our wallet, about 900 words, plain English." });
  ix.applyToGig(s, at(P.yuki, -1.5 * DAY), { gig: g4 });
  ix.applyToGig(s, at(P.kai, -1.2 * DAY), { gig: g4 });
  const g5 = ix.createGig(s, at(P.priya, -1.5 * DAY), { title: "Anchor program audit prep", description: "Review four Anchor programs before an external audit: threat model, invariant list and test gaps.", category: "Programming & Tech", skills: ["Anchor", "Security"], budget: 2_500 * USDC, deadline: now + 20 * DAY });
  ix.applyToGig(s, at(P.tomas, -1 * DAY), { gig: g5 });
  ix.createGig(s, at(P.priya, -0.5 * DAY), { title: "Explainer video: how escrow releases work", description: "A 60-second motion-graphics explainer of milestone escrow for our onboarding.", category: "Video & Animation", skills: ["Motion graphics"], budget: 800 * USDC, deadline: now + 25 * DAY });

  // ── g6: completed, rated ──
  const g6 = ix.createGig(s, at(P.priya, -30 * DAY), { title: "Podcast cover art and episode templates", description: "Cover art and a Figma template for episode thumbnails.", category: "Graphics & Design", skills: ["Illustration"], budget: 200 * USDC, deadline: now - 20 * DAY });
  ix.assignFreelancer(s, at(P.priya, -29.9 * DAY), { gig: g6, freelancer: P.kai });
  const g6m0 = ix.createMilestone(s, at(P.priya, -29.8 * DAY), { gig: g6, title: "Cover art + template", amount: 200 * USDC, specHash: ZERO_HASH });
  ix.fundMilestone(s, at(P.priya, -29.7 * DAY), { milestone: g6m0 });
  ix.submitDelivery(s, at(P.kai, -24 * DAY), { milestone: g6m0, files: files("podcast-art.zip"), note: "Cover and template.", deliveryHash: mockHash("g6m0"), reportHash: ZERO_HASH });
  ix.approveMilestone(s, at(P.priya, -23.5 * DAY), { milestone: g6m0 });
  ix.rateFreelancer(s, at(P.priya, -23.4 * DAY), { gig: g6, score: 5, review: "Fast, thoughtful, and the template saves us an hour per episode.", reviewHash: mockHash("review:g6") });

  // ── g7: delivered; receivable minted and listed ──
  const g7 = ix.createGig(s, at(P.priya, -9 * DAY), { title: "Onboarding illustrations for a fitness app", description: "Six spot illustrations for the onboarding flow, in our existing style.", category: "Graphics & Design", skills: ["Illustration"], budget: 450 * USDC, deadline: now + 2 * DAY });
  ix.assignFreelancer(s, at(P.priya, -8.9 * DAY), { gig: g7, freelancer: P.kai });
  const g7s0 = spec(g7, 0, "Six illustrations", 450 * USDC, now + 2 * DAY, [
    { id: "c1", text: "Six illustrations at 1x/2x/3x as PNG plus SVG sources", check: "automatic", weight: 2 },
    { id: "c2", text: "Style matches the attached reference sheet", check: "manual", weight: 1 },
  ], [{ id: "d1", kind: "images", format: "PNG + SVG" }]);
  const g7m0 = ix.createMilestone(s, at(P.priya, -8.8 * DAY), { gig: g7, title: g7s0.title, amount: 450 * USDC, spec: g7s0, specHash: hashDocument(g7s0) });
  ix.acceptTerms(s, at(P.kai, -8.7 * DAY), { milestone: g7m0, specHash: hashDocument(g7s0) });
  ix.fundMilestone(s, at(P.priya, -8.6 * DAY), { milestone: g7m0 });
  const r70 = report(g7m0, g7s0, ["pass", "pass"], now - 2 * DAY, 0);
  ix.submitDelivery(s, at(P.kai, -2 * DAY), { milestone: g7m0, files: files("onboarding-illustrations.zip"), note: "All six, with SVG sources.", deliveryHash: mockHash("g7m0"), reportHash: hashDocument(r70), report: r70 });
  const rec = ix.mintReceivable(s, at(P.kai, -1.9 * DAY), { milestone: g7m0 });
  ix.listReceivable(s, at(P.kai, -1.9 * DAY), { receivable: rec, price: 432 * USDC });

  // ── g8: past dispute, settled at 75% ──
  const g8 = ix.createGig(s, at(P.ava, -26 * DAY), { title: "Translate API docs to Spanish", description: "Translate 40 pages of API reference into neutral Spanish.", category: "Writing & Translation", skills: ["Translation"], budget: 300 * USDC, deadline: now - 19 * DAY });
  ix.assignFreelancer(s, at(P.ava, -25.9 * DAY), { gig: g8, freelancer: P.yuki });
  const g8s0 = spec(g8, 0, "Full translation", 300 * USDC, now - 19 * DAY, [
    { id: "c1", text: "All 40 pages translated", check: "automatic", weight: 2 },
    { id: "c2", text: "Code samples left untranslated", check: "automatic", weight: 1 },
    { id: "c3", text: "Terminology follows the glossary", check: "sampled", sample_size: 30, pass_threshold: 0.9 },
  ], [{ id: "d1", kind: "document", format: "Markdown" }]);
  const g8m0 = ix.createMilestone(s, at(P.ava, -25.8 * DAY), { gig: g8, title: g8s0.title, amount: 300 * USDC, spec: g8s0, specHash: hashDocument(g8s0) });
  ix.acceptTerms(s, at(P.yuki, -25.7 * DAY), { milestone: g8m0, specHash: hashDocument(g8s0) });
  ix.fundMilestone(s, at(P.ava, -25.6 * DAY), { milestone: g8m0 });
  const r80 = report(g8m0, g8s0, ["pass", "pass", "fail"], now - 20 * DAY, 0);
  ix.submitDelivery(s, at(P.yuki, -20 * DAY), { milestone: g8m0, files: files("api-docs-es.zip"), note: "All pages.", deliveryHash: mockHash("g8m0"), reportHash: hashDocument(r80), report: r80 });
  const c2 = ix.raiseDispute(s, at(P.ava, -19.5 * DAY), { milestone: g8m0, reason: "About a third of the glossary terms are translated inconsistently.", humanOnly: false });
  ix.submitEvidence(s, at(P.ava, -19.4 * DAY), { case: c2, label: "Glossary diff", text: "11 of 30 sampled terms differ from the glossary.", contentHash: mockHash("ev:c2:ava") });
  ix.submitEvidence(s, at(P.yuki, -19 * DAY), { case: c2, label: "Glossary version note", text: "The glossary was updated after delivery; 7 of the 11 match the earlier version.", contentHash: mockHash("ev:c2:yuki") });
  for (let i = 0; i < 6; i++) keeperTick(s, now - 16.4 * DAY + i * 600);
  const case2 = s.cases[c2];
  for (const arb of case2.arbitrators) {
    ix.submitVerdict(s, at(arb, -15 * DAY), { case: c2, ruling: 7500, reasonHash: mockHash(`verdict:c2:${arb}`), seatAnswers: { A: "Glossary changed after delivery; most mismatches are not errors.", B: "Same as A.", C: "The skeptic reading ignores the glossary version note." }, reasons: g8s0.criteria.map((c) => ({ criterion: c.id, text: c.id === "c3" ? "Most mismatches trace to the later glossary version; 4 genuine errors remain." : "Met." })) });
  }
  ix.waiveAppeal(s, at(P.ava, -14.8 * DAY), { case: c2 });
  ix.waiveAppeal(s, at(P.yuki, -14.7 * DAY), { case: c2 });
  tickAt(-14.6 * DAY);

  // ── g9: funded, no delivery past deadline + grace → refundable ──
  const g9 = ix.createGig(s, at(P.priya, -14 * DAY), { title: "Clean and dedupe a CRM export", description: "Deduplicate ~8k contacts and normalise company names.", category: "Business", skills: ["Data cleaning"], budget: 150 * USDC, deadline: now - 6 * DAY });
  ix.assignFreelancer(s, at(P.priya, -13.9 * DAY), { gig: g9, freelancer: P.sana });
  const g9m0 = ix.createMilestone(s, at(P.priya, -13.8 * DAY), { gig: g9, title: "Clean export", amount: 150 * USDC, specHash: ZERO_HASH });
  ix.fundMilestone(s, at(P.priya, -13.7 * DAY), { milestone: g9m0 });

  // ── Governance ──
  s.proposals.push(
    { id: 1, title: "Set the protocol fee to 0.5%", description: "Fund arbitrators, Gemini costs and audits with a 0.5% fee on every release, as in the original product plan.", author: P.mira, changes: [{ account: "ProtocolConfig", key: "feeBps", from: 0, to: 50 }], status: "executed", votesFor: 3, votesAgainst: 0, votesAbstain: 0, quorum: 2, createdAt: now - 45 * DAY, votingEndsAt: now - 42 * DAY, timelockEndsAt: now - 40 * DAY, executedAt: now - 40 * DAY, votes: { [P.mira]: "for", [P.jonas]: "for", [P.elena]: "for" } },
    { id: 2, title: "Raise the protocol fee to 1.5%", description: "Grow the treasury faster for the audit.", author: P.jonas, changes: [{ account: "ProtocolConfig", key: "feeBps", from: 50, to: 150 }], status: "defeated", votesFor: 1, votesAgainst: 2, votesAbstain: 0, quorum: 2, createdAt: now - 20 * DAY, votingEndsAt: now - 17 * DAY, timelockEndsAt: null, executedAt: null, votes: { [P.jonas]: "for", [P.mira]: "against", [P.elena]: "against" } },
    { id: 3, title: "Approve gemini-3.8-flash as Seat B's model", description: "Seat B must differ from Seat A. Move it to the current Flash model listed in the Gemini changelog.", author: P.elena, changes: [{ account: "AiRegistry", key: "seatB", from: MOCK_MODELS.seatB, to: "gemini-3.8-flash" }], status: "timelock", votesFor: 2, votesAgainst: 0, votesAbstain: 1, quorum: 2, createdAt: now - 4 * DAY, votingEndsAt: now - 1 * DAY, timelockEndsAt: now + 20 * HOUR, executedAt: null, votes: { [P.elena]: "for", [P.jonas]: "for", [P.mira]: "abstain" } },
    { id: 4, title: "Shorten the partial release delay to 48 h", description: "Freelancers wait 72 h for the first 20%. Most clients approve within two days; 48 h pays freelancers sooner without hurting review time. Applies only to milestones funded after execution.", author: P.jonas, changes: [{ account: "ProtocolConfig", key: "partialTimeout", from: 72 * HOUR, to: 48 * HOUR }], status: "voting", votesFor: 1, votesAgainst: 0, votesAbstain: 0, quorum: 2, createdAt: now - 1 * DAY, votingEndsAt: now + 2 * DAY, timelockEndsAt: null, executedAt: null, votes: { [P.jonas]: "for" } },
  );
  s.proposals.sort((a, b) => b.id - a.id);

  // ── Credentials ──
  ix.issueCredential(s, at(P.kai, -10 * DAY), { schema: "proove.work-summary.v1" });

  s.notifications = s.notifications.filter((n) => n.at > now - 6 * DAY).map((n) => ({ ...n, read: n.at < now - 3 * DAY }));
  s.events.sort((a, b) => b.blockTime - a.blockTime);
  return s;
}
