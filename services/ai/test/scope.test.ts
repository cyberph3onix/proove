import { describe, expect, it } from "vitest";
import { hashDocument } from "@proove/types/hash";
import { loadPrompts } from "../src/prompts";
import { FakeModel, makeApp, post, SCOPE_OUTPUT } from "./helpers";

const scopeHash = loadPrompts().get("scope")!.hash;

describe("POST /v1/scope/compile", () => {
  it("returns a ScopeResult with server-assigned ids, amounts and provenance", async () => {
    const fake = new FakeModel(() => SCOPE_OUTPUT);
    const { app } = makeApp(fake);
    const res = await post(app, "/v1/scope/compile", { brief: "Label 500 product images with bounding boxes, budget $1,200" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      category: "Data Labeling",
      title: "Label 500 product images",
      milestones: [
        {
          title: "Pilot batch",
          amount: 240,
          deliverables: [{ id: "d1", kind: "dataset", format: "COCO JSON" }],
          criteria: [
            { id: "c1", text: "Every image in the pilot has a bounding box", check: "automatic", weight: 2 },
            { id: "c2", text: "Labels follow the guideline", check: "sampled", sample_size: 20, pass_threshold: 0.9 },
          ],
        },
        {
          title: "Full dataset",
          amount: 960,
          deliverables: [{ id: "d1", kind: "dataset", format: "COCO JSON" }],
          criteria: [{ id: "c1", text: "Labels feel consistent", check: "manual", hard_to_test: true }],
        },
      ],
      model: "gemini-3.8-flash",
      prompt_version: scopeHash,
    });
    expect(res.headers["x-proove-prompt-hash"]).toBe(scopeHash);
    expect(res.headers["x-proove-document-hash"]).toBe(hashDocument(body));
    expect(fake.requests[0]!.model).toBe("gemini-3.8-flash");
  });

  it("uses the request budget over the brief's, and the mock's 500 fallback when neither is given", async () => {
    const { app } = makeApp(new FakeModel(() => ({ ...SCOPE_OUTPUT, budget_usdc: null })));
    const a = (await post(app, "/v1/scope/compile", { brief: "Label images", budgetUsdc: 1000 })).json();
    expect(a.milestones.map((m: { amount: number }) => m.amount)).toEqual([200, 800]);
    const b = (await post(app, "/v1/scope/compile", { brief: "Label images" })).json();
    expect(b.milestones.map((m: { amount: number }) => m.amount)).toEqual([100, 400]);
  });

  it("normalises shares so amounts always add up to the budget", async () => {
    const out = structuredClone(SCOPE_OUTPUT);
    out.milestones[0]!.share = 0.3;
    out.milestones[1]!.share = 0.4;
    const { app } = makeApp(new FakeModel(() => out));
    const body = (await post(app, "/v1/scope/compile", { brief: "x", budgetUsdc: 1000 })).json();
    const amounts = body.milestones.map((m: { amount: number }) => m.amount);
    expect(amounts.reduce((s: number, n: number) => s + n, 0)).toBe(1000);
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const fake = new FakeModel((_r, call) => (call === 1 ? { category: "x" } : SCOPE_OUTPUT));
    const { app } = makeApp(fake);
    const res = await post(app, "/v1/scope/compile", { brief: "Label images" });
    expect(res.statusCode).toBe(200);
    expect(fake.requests).toHaveLength(2);
  });

  it("answers 503 unavailable after the retry also fails", async () => {
    const fake = new FakeModel(() => "not json at all");
    const { app } = makeApp(fake);
    const res = await post(app, "/v1/scope/compile", { brief: "Label images" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "unavailable", reason: "model_output_invalid" });
    expect(fake.requests).toHaveLength(2);
  });

  it("answers 503 when the provider errors", async () => {
    const { app } = makeApp(new FakeModel(() => new Error("upstream 500")));
    const res = await post(app, "/v1/scope/compile", { brief: "x" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: "unavailable", reason: "model_error" });
  });

  it("rejects invalid requests with 400 and issue paths only", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT));
    const res = await post(app, "/v1/scope/compile", { brief: "", budgetUsdc: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.map((i: { path: string }) => i.path).sort()).toEqual(["brief", "budgetUsdc"]);
  });

  it("passes attachments as data parts", async () => {
    const fake = new FakeModel(() => SCOPE_OUTPUT);
    const { app } = makeApp(fake);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    await post(app, "/v1/scope/compile", {
      brief: "Design a logo",
      attachments: [{ name: "ref.png", mime: "image/png", content: { encoding: "base64", data: png } }],
    });
    const parts = fake.requests[0]!.parts;
    expect(parts.some((p) => "inlineData" in p && p.inlineData.data === png)).toBe(true);
  });
});
