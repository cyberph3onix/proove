import { describe, expect, it } from "vitest";
import { hashDocument } from "@proove/types/hash";
import { FakeModel, honestVerdicts, makeApp, post, SCOPE_OUTPUT, textFile, verifyRequest, WALLET } from "./helpers";

/** Markers that must never reach a log line. */
const BRIEF = "SECRET-BRIEF-7f3a confidential product roadmap";
const NOTE = "SECRET-NOTE-91c2 private delivery note";
const FILE = "SECRET-FILE-0b5e proprietary source code";
const CRITERION = "SECRET-CRITERION-44d1";
const MODEL_OUT = "SECRET-MODEL-OUTPUT-e8e8";
const MARKERS = [BRIEF, NOTE, FILE, CRITERION, MODEL_OUT, "SECRET-"];

function expectClean(lines: string[]) {
  expect(lines.length).toBeGreaterThan(0);
  const all = lines.join("");
  for (const m of MARKERS) expect(all).not.toContain(m);
}

const jobLines = (lines: string[]) => lines.map((l) => JSON.parse(l)).filter((l) => l.event === "job");

describe("logs hold hashes only", () => {
  it("successful scope and verify calls log hashes, sizes, timings and wallet, not content", async () => {
    const out = honestVerdicts("labels.json");
    out.findings[0]!.note = MODEL_OUT;
    const fake = new FakeModel((req) => (req.parts.some((p) => "text" in p && p.text.includes("milestone-spec")) ? out : SCOPE_OUTPUT));
    const { app, lines } = makeApp(fake);

    const scopeBody = { brief: BRIEF };
    expect((await post(app, "/v1/scope/compile", scopeBody)).statusCode).toBe(200);
    const req = verifyRequest([textFile("labels.json", FILE)], NOTE);
    req.spec = { ...req.spec, criteria: [{ ...req.spec.criteria[0]!, text: CRITERION }, ...req.spec.criteria.slice(1)] };
    const res = await post(app, "/v1/delivery/verify", req);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(MODEL_OUT); // the client gets the report...

    expectClean(lines); // ...the logs do not.
    const [scope, verify] = jobLines(lines);
    expect(scope).toMatchObject({ job: "scope", wallet: WALLET, status: 200, request_hash: hashDocument(scopeBody), model: "gemini-3.8-flash" });
    expect(scope.prompt_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verify).toMatchObject({ job: "verify", status: 200, document_hash: res.headers["x-proove-document-hash"] });
    expect(verify.attempts[0]).toMatchObject({ ok: true, input_tokens: 100, output_tokens: 50 });
    expect(verify.attempts[0].output_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof verify.latency_ms).toBe("number");
  });

  it("failures log no content either", async () => {
    const fake = new FakeModel(() => `not json ${MODEL_OUT}`);
    const { app, lines } = makeApp(fake);

    // Malformed JSON body: Node's parse error quotes the input.
    await post(app, "/v1/scope/compile", `{"brief": "${BRIEF}`);
    // Schema-invalid request body.
    await post(app, "/v1/scope/compile", { brief: 42, extra: BRIEF });
    // Model output that fails validation.
    expect((await post(app, "/v1/scope/compile", { brief: BRIEF })).statusCode).toBe(503);
    // Hash mismatch on a delivered file.
    const bad = { ...textFile("labels.json", FILE), plaintextHash: "1".repeat(64) };
    expect((await post(app, "/v1/delivery/verify", verifyRequest([bad], NOTE))).statusCode).toBe(422);

    expectClean(lines);
    const outcomes = jobLines(lines).map((l) => l.outcome);
    expect(outcomes).toEqual(["invalid_request", "model_unavailable", "invalid_input"]);
  });

  it("error responses do not echo request content", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT));
    const res = await post(app, "/v1/scope/compile", `{"brief": "${BRIEF}`);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain("SECRET");
  });
});
