import { hashDocument } from "@proove/types/hash";
import type { CriterionFinding, VerificationReport } from "@proove/types/types";
import { decodeContent, sha256Bytes } from "./content";
import { dataBlock, fileParts } from "./data-block";
import type { ModelPart } from "./model";
import type { LoadedPrompt } from "./prompts";
import { OutputRejected } from "./run-job";
import type { VerifyModelOutput, VerifyRequest } from "./schemas";

/** The request is well-formed JSON but inconsistent (answered with 422). */
export class InvalidInput extends Error {}

export interface PreparedFile {
  name: string;
  mime: string;
  bytes: Buffer;
}

/** Decodes provided plaintexts and checks each against its manifest hash. */
export function prepareFiles(req: VerifyRequest): PreparedFile[] {
  const out: PreparedFile[] = [];
  const names = new Set<string>();
  req.files.forEach((f, i) => {
    if (names.has(f.name)) throw new InvalidInput(`files[${i}]: duplicate file name`);
    names.add(f.name);
    if (!f.content) return;
    const bytes = decodeContent(f.content);
    if (sha256Bytes(bytes) !== f.plaintextHash) throw new InvalidInput(`files[${i}]: content does not match plaintextHash`);
    out.push({ name: f.name, mime: f.mime, bytes });
  });
  return out;
}

export function buildVerifyPrompt(
  prompt: LoadedPrompt,
  req: VerifyRequest,
  files: PreparedFile[],
): { systemInstruction: string; parts: ModelPart[] } {
  const spec = {
    title: req.spec.title,
    deliverables: req.spec.deliverables,
    criteria: req.spec.criteria,
  };
  const manifest = req.files.map((f) => ({ name: f.name, mime: f.mime, size: f.size, content_provided: files.some((p) => p.name === f.name) }));
  const parts: ModelPart[] = [
    { text: prompt.template.task },
    { text: dataBlock("spec", "milestone-spec", spec) },
    { text: dataBlock("manifest", "delivery-manifest", manifest) },
    { text: dataBlock("note", "freelancer-note", req.note) },
  ];
  files.forEach((f, i) => parts.push(...fileParts("delivery-file", { label: `file-${i + 1}`, name: f.name, mime: f.mime, bytes: f.bytes })));
  return { systemInstruction: prompt.template.system, parts };
}

const SUMMARY_WORDS = 120;
const ADVICE = "This report is advice only.";

function clipWords(s: string, max: number): string {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return w.length <= max ? w.join(" ") : `${w.slice(0, max).join(" ")}…`;
}

/**
 * Validates the model's findings against the request. Verdicts come only
 * from schema-valid output, and:
 * - there must be exactly one finding per spec criterion (else rejected);
 * - evidence pointers must name a file whose content the model was given;
 *   other pointers are dropped;
 * - a "pass" left with no valid pointer is downgraded to "unclear".
 * The pass count in the summary is computed here, not taken from the model.
 */
export function checkVerifyOutput(out: VerifyModelOutput, req: VerifyRequest, files: PreparedFile[]): { findings: CriterionFinding[]; summary: string } {
  const criteriaIds = req.spec.criteria.map((c) => c.id);
  const byId = new Map<string, VerifyModelOutput["findings"][number]>();
  for (const f of out.findings) {
    if (!criteriaIds.includes(f.criterion)) throw new OutputRejected("finding for an unknown criterion");
    if (byId.has(f.criterion)) throw new OutputRejected("duplicate finding");
    byId.set(f.criterion, f);
  }
  if (byId.size !== criteriaIds.length) throw new OutputRejected("missing findings");

  const readable = new Set(files.map((f) => f.name));
  const findings: CriterionFinding[] = criteriaIds.map((id) => {
    const f = byId.get(id)!;
    const evidence = f.evidence.filter((e) => readable.has(e.file)).map((e) => (e.locator ? { file: e.file, locator: e.locator } : { file: e.file }));
    if (f.verdict === "pass" && evidence.length === 0) {
      return {
        criterion: id,
        verdict: "unclear",
        confidence: Math.min(f.confidence, 0.5),
        evidence,
        note: `${f.note} (Downgraded from pass: no evidence pointer to a delivered file.)`.trim(),
      };
    }
    return { criterion: id, verdict: f.verdict, confidence: f.confidence, evidence, note: f.note };
  });

  const passed = findings.filter((f) => f.verdict === "pass").length;
  const head = `${passed} of ${findings.length} criteria pass.`;
  const budget = SUMMARY_WORDS - head.split(" ").length - ADVICE.split(" ").length;
  const body = clipWords(out.summary.replace(/this report is advice only\.?/gi, ""), budget);
  return { findings, summary: [head, body, ADVICE].filter(Boolean).join(" ") };
}

export function assembleReport(args: {
  req: VerifyRequest;
  findings: CriterionFinding[];
  summary: string;
  model: string;
  promptHash: string;
  now: () => number;
}): VerificationReport {
  return {
    schema: "proove.verification-report.v1",
    milestone: args.req.milestone,
    findings: args.findings,
    summary: args.summary,
    model: args.model,
    prompt_version: args.promptHash,
    input_hashes: [hashDocument(args.req.spec), ...args.req.files.map((f) => f.plaintextHash)],
    created_at: Math.floor(args.now() / 1000),
    // Sample audits (SlotHashes seed at submitted_slot + 2) are a separate plan item.
    samples: [],
  };
}
