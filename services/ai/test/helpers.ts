import { Writable } from "node:stream";
import { sha256Hex } from "@proove/types/hash";
import type { MilestoneSpec } from "@proove/types/types";
import { loadConfig, type Config } from "../src/config";
import type { ModelClient, ModelRequest, ModelResponse } from "../src/model";
import { loadAllowlist, loadPrompts, PromptRegistry } from "../src/prompts";
import { buildServer, WALLET_HEADER } from "../src/server";
import type { VerifyRequest } from "../src/schemas";

export const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
export const OTHER_WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

type Script = (req: ModelRequest, call: number) => string | Error | object;

/** Fake model: returns scripted output and records every request it saw. */
export class FakeModel implements ModelClient {
  readonly requests: ModelRequest[] = [];
  constructor(private script: Script) {}
  async generate(req: ModelRequest): Promise<ModelResponse> {
    this.requests.push(req);
    const out = this.script(req, this.requests.length);
    if (out instanceof Error) throw out;
    return { text: typeof out === "string" ? out : JSON.stringify(out), modelVersion: "fake-001", inputTokens: 100, outputTokens: 50 };
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({}), logLevel: "info", ...overrides };
}

export function makeApp(model: ModelClient, opts: { config?: Partial<Config>; registry?: PromptRegistry; now?: () => number } = {}) {
  const config = testConfig(opts.config);
  const registry = opts.registry ?? new PromptRegistry(loadPrompts(), loadAllowlist(), config.models);
  const lines: string[] = [];
  const logStream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  const app = buildServer({ config, model, registry, logStream, now: opts.now ?? (() => 1_795_000_000_000) });
  return { app, lines, config, registry };
}

export function post(app: ReturnType<typeof makeApp>["app"], url: string, payload: unknown, wallet = WALLET) {
  return app.inject({
    method: "POST",
    url,
    headers: { [WALLET_HEADER]: wallet, "content-type": "application/json" },
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

export const SPEC: MilestoneSpec = {
  schema: "proove.milestone-spec.v1",
  gig: "GigAddr1111111111111111111111111111111111111",
  index: 0,
  title: "Label 500 product images",
  amount: "120000000",
  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  deliverables: [{ id: "d1", kind: "dataset", format: "COCO JSON" }],
  criteria: [
    { id: "c1", text: "Every image has at least one bounding box", check: "automatic", weight: 2 },
    { id: "c2", text: "No duplicate image IDs", check: "automatic", weight: 1 },
    { id: "c3", text: "Labels look tidy", check: "manual", hard_to_test: true },
  ],
  deadline: 1_795_000_000,
  generated_by: null,
  edited_by_client: true,
};

export function textFile(name: string, text: string, mime = "application/json") {
  return {
    name,
    size: Buffer.byteLength(text),
    mime,
    plaintextHash: sha256Hex(text),
    uri: `ar://${name}`,
    content: { encoding: "utf8" as const, data: text },
  };
}

export function verifyRequest(
  files: VerifyRequest["files"] = [textFile("labels.json", '{"images":[{"id":1,"boxes":[[0,0,1,1]]}]}')],
  note = "Done.",
): VerifyRequest {
  return { milestone: "MilestoneAddr11111111111111111111111111111111", spec: SPEC, files, note, submittedSlot: 1234 };
}

/** An honest verifier output for SPEC citing labels.json. */
export function honestVerdicts(file = "labels.json") {
  return {
    findings: [
      { criterion: "c1", verdict: "pass", confidence: 0.9, evidence: [{ file, locator: "images[0]" }], note: "Every image has a box." },
      { criterion: "c2", verdict: "fail", confidence: 0.8, evidence: [{ file, locator: "images" }], note: "Duplicate id 1." },
      { criterion: "c3", verdict: "unclear", confidence: 0.4, evidence: [], note: "Subjective." },
    ],
    summary: "One criterion passes, one fails and one is left to the client.",
  };
}

export const SCOPE_OUTPUT = {
  category: "Data Labeling",
  title: "Label 500 product images",
  budget_usdc: 1200,
  milestones: [
    {
      title: "Pilot batch",
      share: 0.2,
      deliverables: [{ kind: "dataset", format: "COCO JSON" }],
      criteria: [
        { text: "Every image in the pilot has a bounding box", check: "automatic", weight: 2, hard_to_test: false },
        { text: "Labels follow the guideline", check: "sampled", sample_size: 20, pass_threshold: 0.9, hard_to_test: false },
      ],
    },
    {
      title: "Full dataset",
      share: 0.8,
      deliverables: [{ kind: "dataset", format: "COCO JSON" }],
      criteria: [{ text: "Labels feel consistent", check: "manual", hard_to_test: true }],
    },
  ],
};
