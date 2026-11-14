/**
 * Mock of services/ai. Same inputs and output schemas as the real Gemini
 * jobs (Scope Compiler, Delivery Verifier, Neutral Brief, AI juror seats),
 * produced by deterministic heuristics so the frontend can be built and
 * demoed without an API key. Swap for fetch() calls to the AI service later.
 */
import type {
  AiEvaluation,
  Bps,
  Criterion,
  CriterionFinding,
  DeliveryFile,
  DisputeCase,
  EvidenceItem,
  MilestoneSpec,
  NeutralBrief,
  SeatId,
  VerificationReport,
} from "@proove/types/types";
import { hashDocument, mockHash, sampleIndices } from "@proove/types/hash";
import { ALLOWED_RULINGS } from "@proove/types/dispute";

export const MOCK_MODELS = {
  scope: "gemini-3.8-flash",
  verify: "gemini-3.8-flash",
  brief: "gemini-3.5-pro",
  seatA: "gemini-3.5-pro",
  seatB: "gemini-3.8-flash",
  seatC: "gemini-3.5-pro",
  backup: "gemini-3.5-flash",
};

export const PROMPT_HASHES = {
  scope: mockHash("prompt:scope:v3"),
  verify: mockHash("prompt:verify:v2"),
  brief: mockHash("prompt:brief:v2"),
  seatNeutral: mockHash("prompt:seat-neutral:v4"),
  seatSkeptic: mockHash("prompt:seat-skeptic:v2"),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Scope Compiler ─────────────────────────────────────────────────────────

interface Template {
  match: RegExp;
  category: string;
  milestones: { title: string; share: number; deliverables: MilestoneSpec["deliverables"]; criteria: Omit<Criterion, "id">[] }[];
}

const TEMPLATES: Template[] = [
  {
    match: /label|annotat|dataset|bounding|classif/i,
    category: "Data Labeling",
    milestones: [
      {
        title: "Pilot batch (10%)",
        share: 0.2,
        deliverables: [{ id: "d1", kind: "dataset", format: "COCO JSON" }],
        criteria: [
          { text: "Every image in the pilot batch has at least one bounding box", check: "automatic", weight: 2 },
          { text: "Labels follow the attached guideline", check: "sampled", sample_size: 20, pass_threshold: 0.9 },
        ],
      },
      {
        title: "Full dataset",
        share: 0.8,
        deliverables: [{ id: "d1", kind: "dataset", format: "COCO JSON" }],
        criteria: [
          { text: "Every image has at least one bounding box", check: "automatic", weight: 2 },
          { text: "Labels follow the attached guideline", check: "sampled", sample_size: 50, pass_threshold: 0.9 },
          { text: "No duplicate image IDs in the export", check: "automatic", weight: 1 },
        ],
      },
    ],
  },
  {
    match: /logo|brand|design|figma|ui|ux|mockup|illustrat/i,
    category: "Graphics & Design",
    milestones: [
      {
        title: "Concepts",
        share: 0.3,
        deliverables: [{ id: "d1", kind: "images", format: "PNG + PDF board" }],
        criteria: [
          { text: "Three distinct concepts are delivered", check: "automatic", weight: 1 },
          { text: "Each concept uses the brand colours from the brief", check: "manual", weight: 1 },
          { text: "Concepts feel modern and premium", check: "manual", weight: 1, hard_to_test: true },
        ],
      },
      {
        title: "Final files",
        share: 0.7,
        deliverables: [
          { id: "d1", kind: "vector", format: "SVG + AI" },
          { id: "d2", kind: "images", format: "PNG @1x/2x/4x" },
        ],
        criteria: [
          { text: "Vector source files open without missing fonts", check: "automatic", weight: 2 },
          { text: "Light and dark variants are included", check: "automatic", weight: 1 },
          { text: "The chosen concept's feedback from round 1 is applied", check: "manual", weight: 2 },
        ],
      },
    ],
  },
  {
    match: /writ|article|blog|copy|translat|content|post/i,
    category: "Writing & Translation",
    milestones: [
      {
        title: "Outline",
        share: 0.2,
        deliverables: [{ id: "d1", kind: "document", format: "Markdown" }],
        criteria: [
          { text: "Outline covers every topic listed in the brief", check: "manual", weight: 1 },
          { text: "Target keyword appears in the proposed title", check: "automatic", weight: 1 },
        ],
      },
      {
        title: "Final draft",
        share: 0.8,
        deliverables: [{ id: "d1", kind: "document", format: "Markdown / Google Doc" }],
        criteria: [
          { text: "Word count is within ±10% of the target", check: "automatic", weight: 2 },
          { text: "No plagiarism above 5% similarity", check: "automatic", weight: 2 },
          { text: "Tone matches the brand voice described", check: "manual", weight: 1, hard_to_test: true },
        ],
      },
    ],
  },
  {
    match: /.*/,
    category: "Programming & Tech",
    milestones: [
      {
        title: "Working prototype",
        share: 0.4,
        deliverables: [{ id: "d1", kind: "code", format: "Git repository" }],
        criteria: [
          { text: "Project builds from a clean checkout with the documented command", check: "automatic", weight: 2 },
          { text: "Core user flow from the brief works end to end", check: "manual", weight: 2 },
        ],
      },
      {
        title: "Production release",
        share: 0.6,
        deliverables: [
          { id: "d1", kind: "code", format: "Git repository" },
          { id: "d2", kind: "document", format: "README" },
        ],
        criteria: [
          { text: "All automated tests pass in CI", check: "automatic", weight: 2 },
          { text: "README documents setup, env vars and deploy", check: "manual", weight: 1 },
          { text: "Code is clean and maintainable", check: "manual", weight: 1, hard_to_test: true },
        ],
      },
    ],
  },
];

export function parseBudget(brief: string): number | null {
  const m = brief.match(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(usdc|usd|\$|dollars)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 5 ? n : null;
}

export interface ScopeResult {
  category: string;
  title: string;
  milestones: { title: string; amount: number; deliverables: MilestoneSpec["deliverables"]; criteria: Criterion[] }[];
  model: string;
  prompt_version: string;
}

/**
 * Streams the compiled scope: first the skeleton, then one criterion at a
 * time (the real service streams Gemini's structured output the same way).
 */
export async function* compileScope(brief: string, budgetUsdc?: number): AsyncGenerator<ScopeResult> {
  await sleep(450);
  const t = TEMPLATES.find((x) => x.match.test(brief))!;
  const budget = budgetUsdc ?? parseBudget(brief) ?? 500;
  const firstLine = brief.split(/[.\n]/)[0].trim();
  const title = firstLine.length > 4 ? firstLine.slice(0, 80) : `${t.category} project`;
  const result: ScopeResult = {
    category: t.category,
    title,
    milestones: t.milestones.map((m) => ({
      title: m.title,
      amount: Math.round(budget * m.share),
      deliverables: m.deliverables,
      criteria: [],
    })),
    model: MOCK_MODELS.scope,
    prompt_version: PROMPT_HASHES.scope,
  };
  yield structuredClone(result);
  for (let mi = 0; mi < t.milestones.length; mi++) {
    for (let ci = 0; ci < t.milestones[mi].criteria.length; ci++) {
      await sleep(260);
      result.milestones[mi].criteria.push({ id: `c${ci + 1}`, ...t.milestones[mi].criteria[ci] });
      yield structuredClone(result);
    }
  }
}

// ─── Delivery Verifier ──────────────────────────────────────────────────────

export async function verifyDelivery(params: {
  milestone: string;
  spec: MilestoneSpec;
  files: DeliveryFile[];
  note: string;
  submittedSlot: number;
  /** Mock knob: lower quality makes more criteria fail. */
  quality?: number;
}): Promise<VerificationReport> {
  await sleep(1200);
  const quality = params.quality ?? 0.85;
  const file = params.files[0]?.name ?? "delivery";
  const samples: VerificationReport["samples"] = [];
  const findings: CriterionFinding[] = params.spec.criteria.map((c, i) => {
    const roll = ((parseInt(mockHash(`${params.milestone}:${c.id}`).slice(0, 4), 16) % 100) / 100) * (1 - quality) * 3;
    if (c.check === "sampled") {
      const seed = mockHash(`slot:${params.submittedSlot + 2}`);
      const total = 500;
      const items = sampleIndices(seed, total, c.sample_size ?? 50).map((n) => `item-${String(n).padStart(4, "0")}`);
      const agreementRate = Math.max(0, Math.min(1, quality + 0.08 - roll / 4));
      samples.push({ criterion: c.id, seedSlot: params.submittedSlot + 2, seed, items, agreementRate });
      const pass = agreementRate >= (c.pass_threshold ?? 0.9);
      return {
        criterion: c.id,
        verdict: pass ? "pass" : "fail",
        confidence: 0.82,
        evidence: items.slice(0, 3).map((id) => ({ file, locator: id })),
        note: `${Math.round(agreementRate * 100)}% agreement on ${items.length} sampled items (threshold ${Math.round((c.pass_threshold ?? 0.9) * 100)}%).`,
      };
    }
    if (c.hard_to_test) {
      return { criterion: c.id, verdict: "unclear", confidence: 0.4, evidence: [], note: "Subjective criterion; needs the client's judgement." };
    }
    const pass = roll < 0.5;
    return {
      criterion: c.id,
      verdict: pass ? "pass" : "fail",
      confidence: pass ? 0.9 : 0.74,
      evidence: [{ file: params.files[i % Math.max(1, params.files.length)]?.name ?? file, locator: pass ? "whole file" : `section ${i + 1}` }],
      note: pass ? "Met as written." : "Not met as written; see the cited section.",
    };
  });
  const passed = findings.filter((f) => f.verdict === "pass").length;
  return {
    schema: "proove.verification-report.v1",
    milestone: params.milestone,
    findings,
    summary: `${passed} of ${findings.length} criteria pass. ${
      findings.some((f) => f.verdict === "fail") ? "Failed criteria cite the parts of the delivery that miss the spec." : "No criterion fails."
    } ${findings.some((f) => f.verdict === "unclear") ? "Subjective criteria are left to the client." : ""} This report is advice only.`.trim(),
    model: MOCK_MODELS.verify,
    prompt_version: PROMPT_HASHES.verify,
    input_hashes: [hashDocument(params.spec), ...params.files.map((f) => f.plaintextHash)],
    created_at: Math.floor(Date.now() / 1000),
    samples,
  };
}

// ─── Disputes ───────────────────────────────────────────────────────────────

export function neutralBrief(c: DisputeCase, spec: MilestoneSpec | undefined, evidence: EvidenceItem[]): NeutralBrief {
  const criteria = (spec?.criteria ?? []).map((cr) => ({ id: cr.id, plain: cr.text }));
  return {
    schema: "proove.neutral-brief.v1",
    criteria,
    claims: evidence.map((e) => ({
      party: e.role === "holder" ? "client" : e.role,
      text: e.text.length > 160 ? `${e.text.slice(0, 157)}…` : e.text,
      criteria: criteria.slice(0, 2).map((x) => x.id),
    })),
    evidenceMap: evidence.map((e) => ({ item: e.label, supports: criteria.slice(0, 1).map((x) => x.id) })),
    contradictions: [
      "Does the delivered file meet criterion c1 as written, or only an earlier draft of it?",
      "Was the client's change request made before or after the spec hash was accepted?",
    ],
    gaps: evidence.length < 2 ? ["Only one side has submitted evidence."] : ["No third-party check of the subjective criteria."],
    model: MOCK_MODELS.brief,
    prompt_version: PROMPT_HASHES.brief,
    input_hashes: [c.hashes.spec, c.hashes.delivery, c.hashes.report, ...evidence.map((e) => e.contentHash)],
  };
}

/** Deterministic ruling per seat, biased by evidence balance. */
export function seatEvaluation(c: DisputeCase, seat: SeatId, spec: MilestoneSpec | undefined, evidence: EvidenceItem[], forcedRuling?: Bps): AiEvaluation {
  const freelancerEv = evidence.filter((e) => e.role === "freelancer").length;
  const clientEv = evidence.filter((e) => e.role !== "freelancer").length;
  const base = 5000 + (freelancerEv - clientEv) * 2500 + (seat === "C" ? -2500 : seat === "B" ? 0 : 0);
  const ruling = forcedRuling ?? ALLOWED_RULINGS.reduce((best, r) => (Math.abs(r - base) < Math.abs(best - base) ? r : best), 5000);
  const findings: CriterionFinding[] = (spec?.criteria ?? []).map((cr, i) => ({
    criterion: cr.id,
    verdict: cr.hard_to_test ? "unclear" : (i + (ruling >= 5000 ? 0 : 1)) % 2 === 0 ? "pass" : "fail",
    confidence: 0.7,
    evidence: [{ file: evidence[i % Math.max(1, evidence.length)]?.label ?? "delivery manifest" }],
    note: cr.hard_to_test ? "Subjective; weighted lightly." : "Assessed against the committed delivery.",
  }));
  return {
    schema: "proove.ai-evaluation.v1",
    seat,
    ruling,
    findings,
    confidence: seat === "C" ? 0.58 : 0.71,
    reasoning:
      seat === "C"
        ? "Strongest case against my first view: the freelancer delivered on time and most objective criteria pass. Even so, the failed criterion is central to the milestone, so I propose a partial ruling."
        : `Weighed each criterion against the committed delivery and both sides' evidence. ${ruling >= 5000 ? "Most objective criteria are met" : "Key objective criteria are not met"}; subjective ones were weighted lightly.`,
    model: seat === "B" ? MOCK_MODELS.seatB : seat === "A" ? MOCK_MODELS.seatA : MOCK_MODELS.seatC,
    prompt_version: seat === "C" ? PROMPT_HASHES.seatSkeptic : PROMPT_HASHES.seatNeutral,
    input_hashes: [c.hashes.spec, c.hashes.delivery, c.hashes.report, c.hashes.brief, ...evidence.map((e) => e.contentHash)],
  };
}

/** Plain-language receipt (Flash-Lite in production). */
export function receipt(name: string, detail: string): string {
  return `${name}: ${detail}`;
}
