import { describe, expect, it } from "vitest";
import { hashDocument } from "@proove/types/hash";
import { loadPrompts } from "../src/prompts";
import { FakeModel, honestVerdicts, makeApp, post, SPEC, textFile, verifyRequest } from "./helpers";

const verifyHash = loadPrompts().get("verify")!.hash;

describe("POST /v1/delivery/verify", () => {
  it("returns a VerificationReport in the mock's shape", async () => {
    const { app } = makeApp(new FakeModel(() => honestVerdicts()));
    const req = verifyRequest();
    const res = await post(app, "/v1/delivery/verify", req);
    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(Object.keys(report).sort()).toEqual(
      ["created_at", "findings", "input_hashes", "milestone", "model", "prompt_version", "samples", "schema", "summary"].sort(),
    );
    expect(report.schema).toBe("proove.verification-report.v1");
    expect(report.milestone).toBe(req.milestone);
    expect(report.model).toBe("gemini-3.8-flash");
    expect(report.prompt_version).toBe(verifyHash);
    expect(report.input_hashes).toEqual([hashDocument(SPEC), req.files[0]!.plaintextHash]);
    expect(report.created_at).toBe(1_795_000_000);
    expect(report.findings.map((f: { verdict: string }) => f.verdict)).toEqual(["pass", "fail", "unclear"]);
    expect(report.summary.startsWith("1 of 3 criteria pass.")).toBe(true);
    expect(report.summary.endsWith("This report is advice only.")).toBe(true);
    expect(res.headers["x-proove-document-hash"]).toBe(hashDocument(report));
  });

  it("returns findings in spec order whatever order the model used", async () => {
    const out = honestVerdicts();
    out.findings.reverse();
    const { app } = makeApp(new FakeModel(() => out));
    const report = (await post(app, "/v1/delivery/verify", verifyRequest())).json();
    expect(report.findings.map((f: { criterion: string }) => f.criterion)).toEqual(["c1", "c2", "c3"]);
  });

  it("rejects content that does not match its plaintextHash (422)", async () => {
    const fake = new FakeModel(() => honestVerdicts());
    const { app } = makeApp(fake);
    const file = { ...textFile("labels.json", "{}"), plaintextHash: "0".repeat(64) };
    const res = await post(app, "/v1/delivery/verify", verifyRequest([file]));
    expect(res.statusCode).toBe(422);
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ["an unknown criterion", (o: ReturnType<typeof honestVerdicts>) => o.findings.push({ ...o.findings[0]!, criterion: "c9" })],
    ["a duplicate finding", (o: ReturnType<typeof honestVerdicts>) => o.findings.push({ ...o.findings[0]! })],
    ["a missing finding", (o: ReturnType<typeof honestVerdicts>) => o.findings.pop()],
    ["an out-of-range confidence", (o: ReturnType<typeof honestVerdicts>) => (o.findings[0]!.confidence = 1.5)],
    ["a verdict outside the enum", (o: ReturnType<typeof honestVerdicts>) => (o.findings[0]!.verdict = "approved")],
    ["a summary over 120 words", (o: ReturnType<typeof honestVerdicts>) => (o.summary = "word ".repeat(121))],
  ])("rejects output with %s, retries, then answers 503", async (_name, mutate) => {
    const out = honestVerdicts();
    mutate(out);
    const fake = new FakeModel(() => out);
    const { app } = makeApp(fake);
    const res = await post(app, "/v1/delivery/verify", verifyRequest());
    expect(res.statusCode).toBe(503);
    expect(fake.requests).toHaveLength(2);
  });

  it("downgrades a pass with no evidence pointer to unclear", async () => {
    const out = honestVerdicts();
    out.findings[0]!.evidence = [];
    const { app } = makeApp(new FakeModel(() => out));
    const report = (await post(app, "/v1/delivery/verify", verifyRequest())).json();
    expect(report.findings[0]).toMatchObject({ verdict: "unclear", evidence: [] });
    expect(report.findings[0].confidence).toBeLessThanOrEqual(0.5);
  });

  it("drops pointers to files the model was not given, and downgrades passes left without one", async () => {
    const out = honestVerdicts();
    out.findings[0]!.evidence = [{ file: "proof-of-quality.pdf", locator: "p1" }];
    out.findings[1]!.evidence.push({ file: "elsewhere.txt", locator: "1" });
    const metadataOnly = { ...textFile("other.json", "{}"), content: undefined };
    const { app } = makeApp(new FakeModel(() => out));
    const report = (await post(app, "/v1/delivery/verify", verifyRequest([textFile("labels.json", "{}"), metadataOnly]))).json();
    expect(report.findings[0]).toMatchObject({ verdict: "unclear", evidence: [] });
    expect(report.findings[1].evidence).toEqual([{ file: "labels.json", locator: "images" }]);
    expect(report.input_hashes).toHaveLength(3);
  });

  it("sends binaries as inline parts and text files as escaped data", async () => {
    const fake = new FakeModel(() => honestVerdicts("labels.json"));
    const { app } = makeApp(fake);
    const pdf = Buffer.from("%PDF-1.7 fake");
    const pdfFile = {
      name: "report.pdf",
      size: pdf.length,
      mime: "application/pdf",
      plaintextHash: (await import("../src/content")).sha256Bytes(pdf),
      uri: "ar://r",
      content: { encoding: "base64" as const, data: pdf.toString("base64") },
    };
    await post(app, "/v1/delivery/verify", verifyRequest([textFile("labels.json", "{}"), pdfFile]));
    const parts = fake.requests[0]!.parts;
    expect(parts.filter((p) => "inlineData" in p)).toEqual([{ inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } }]);
  });
});
