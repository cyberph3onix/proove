import { describe, expect, it } from "vitest";
import { loadConfig, MB } from "../src/config";
import { RateLimiter } from "../src/rate-limit";
import { WALLET_HEADER } from "../src/server";
import { FakeModel, makeApp, OTHER_WALLET, post, SCOPE_OUTPUT, WALLET } from "./helpers";

describe("payload cap", () => {
  it("defaults to 200 MB", () => {
    expect(loadConfig({}).maxPayloadBytes).toBe(200 * MB);
    expect(loadConfig({ MAX_PAYLOAD_MB: "50" }).maxPayloadBytes).toBe(50 * MB);
  });

  it("answers 413 before calling the model when the body is over the cap", async () => {
    const fake = new FakeModel(() => SCOPE_OUTPUT);
    const { app } = makeApp(fake, { config: { maxPayloadBytes: 1024 } });
    const res = await post(app, "/v1/scope/compile", { brief: "x".repeat(4096) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: "payload_too_large", limit_bytes: 1024 });
    expect(fake.requests).toHaveLength(0);
  });

  it("rejects on the declared content-length alone, before reading the body", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT));
    const res = await app.inject({
      method: "POST",
      url: "/v1/delivery/verify",
      headers: { [WALLET_HEADER]: WALLET, "content-type": "application/json", "content-length": String(201 * MB) },
      payload: "{}",
    });
    expect(res.statusCode).toBe(413);
  });

  it("accepts a body under the cap", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT), { config: { maxPayloadBytes: 8192 } });
    expect((await post(app, "/v1/scope/compile", { brief: "x".repeat(4096) })).statusCode).toBe(200);
  });
});

describe("wallet and rate limit", () => {
  it("requires a wallet header", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT));
    expect((await post(app, "/v1/scope/compile", { brief: "x" }, "")).statusCode).toBe(401);
    expect((await post(app, "/v1/scope/compile", { brief: "x" }, "not a wallet!")).statusCode).toBe(401);
  });

  it("limits each wallet separately and sets retry-after", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT), { config: { rateLimit: { capacity: 2, refillPerMinute: 1 } } });
    expect((await post(app, "/v1/scope/compile", { brief: "x" })).statusCode).toBe(200);
    expect((await post(app, "/v1/scope/compile", { brief: "x" })).statusCode).toBe(200);
    const limited = await post(app, "/v1/scope/compile", { brief: "x" });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect((await post(app, "/v1/scope/compile", { brief: "x" }, OTHER_WALLET)).statusCode).toBe(200);
  });

  it("refills over time", () => {
    let t = 0;
    const rl = new RateLimiter(2, 6, () => t);
    expect(rl.take("w")).toBe(0);
    expect(rl.take("w")).toBe(0);
    expect(rl.take("w")).toBe(10);
    t = 10_000;
    expect(rl.take("w")).toBe(0);
    expect(rl.take("w")).toBeGreaterThan(0);
    t = 1_000_000;
    expect(rl.take("w")).toBe(0);
    expect(rl.take("w")).toBe(0);
    expect(rl.take("w")).toBeGreaterThan(0);
  });

  it("does not rate-limit healthz", async () => {
    const { app } = makeApp(new FakeModel(() => SCOPE_OUTPUT), { config: { rateLimit: { capacity: 0, refillPerMinute: 0 } } });
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    expect((await post(app, "/v1/scope/compile", { brief: "x" })).statusCode).toBe(429);
  });
});
