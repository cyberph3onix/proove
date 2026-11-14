import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api/server";
import type { Pool } from "../src/db/pool";
import { ingestTransactions } from "../src/ingest";
import { pk, programIds, programs } from "./helpers";
import { protocolConfigPda } from "../src/handlers/util";
import { dbAvailable, setupTestDb } from "./db";
import { TERMS, buildScenario } from "./scenario";

describe.skipIf(!dbAvailable)("HTTP API (Postgres)", () => {
  let pool: Pool;
  let teardown: () => Promise<void>;
  let app: FastifyInstance;
  const s = buildScenario();

  beforeAll(async () => {
    const db = (await setupTestDb())!;
    pool = db.pool;
    teardown = db.teardown;
    await ingestTransactions({ pool, programs, programIds }, s.txs);
    app = buildApi({ pool, programIds });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await teardown?.();
  });

  const get = async (url: string) => {
    const res = await app.inject({ method: "GET", url });
    return { status: res.statusCode, body: res.json() };
  };
  const addresses = (items: { address: string }[]) => items.map((i) => i.address).sort();

  it("GET /healthz", async () => {
    expect((await get("/healthz")).body.ok).toBe(true);
  });

  describe("GET /v1/gigs", () => {
    it("lists every gig, newest first", async () => {
      const { body } = await get("/v1/gigs");
      expect(body.items.map((g: { id: number }) => g.id)).toEqual([3, 2, 1]);
      expect(body.nextCursor).toBeNull();
    });

    it("full-text searches title, skills and description", async () => {
      expect(addresses((await get("/v1/gigs?q=escrow")).body.items)).toEqual([s.gig.toBase58()]);
      expect(addresses((await get("/v1/gigs?q=rust")).body.items)).toEqual([s.gig.toBase58(), s.gig3.toBase58()].sort());
      expect(addresses((await get("/v1/gigs?q=illustrations")).body.items)).toEqual([s.gig2.toBase58()]); // stemmed
      expect((await get("/v1/gigs?q=haskell")).body.items).toEqual([]);
    });

    it("ranks title matches above description matches", async () => {
      const { body } = await get("/v1/gigs?q=dashboard%20OR%20program");
      expect(body.items[0].title).toMatch(/dashboard|program/i);
    });

    it("filters by category, skill (case-insensitive), budget range and status", async () => {
      expect(addresses((await get("/v1/gigs?category=design")).body.items)).toEqual([s.gig2.toBase58()]);
      expect(addresses((await get("/v1/gigs?skill=RUST")).body.items)).toEqual([s.gig.toBase58(), s.gig3.toBase58()].sort());
      expect(addresses((await get("/v1/gigs?minBudget=100000000&maxBudget=200000000")).body.items)).toEqual([s.gig2.toBase58()]);
      expect(addresses((await get("/v1/gigs?status=draft")).body.items)).toEqual([s.gig3.toBase58()]);
      expect(addresses((await get("/v1/gigs?category=Development&skill=security")).body.items)).toEqual([s.gig3.toBase58()]);
    });

    it("paginates with an opaque cursor", async () => {
      const p1 = (await get("/v1/gigs?limit=2")).body;
      expect(p1.items).toHaveLength(2);
      expect(p1.nextCursor).toEqual(expect.any(String));
      const p2 = (await get(`/v1/gigs?limit=2&cursor=${p1.nextCursor}`)).body;
      expect(p2.items).toHaveLength(1);
      expect(p2.nextCursor).toBeNull();
      expect(new Set([...addresses(p1.items), ...addresses(p2.items)]).size).toBe(3);
    });

    it("rejects invalid query values", async () => {
      expect((await get("/v1/gigs?minBudget=abc")).status).toBe(400);
      expect((await get("/v1/gigs?limit=1000")).status).toBe(400);
    });
  });

  it("GET /v1/gigs/:gig returns the Gig shape", async () => {
    const { status, body } = await get(`/v1/gigs/${s.gig.toBase58()}`);
    expect(status).toBe(200);
    expect(body).toEqual({
      address: s.gig.toBase58(),
      id: 1,
      client: s.client.toBase58(),
      freelancer: s.freelancer.toBase58(),
      mint: null,
      status: "inProgress",
      createdAt: 1_001,
      updatedAt: expect.any(Number),
      title: "Solana escrow dashboard",
      description: "Build a dashboard for milestone escrow vaults.",
      skills: ["rust", "react"],
      category: "Development",
      budget: 900_000_000,
      deadline: 9_999,
      applicants: [],
      slot: 14,
      vault: null, // no EscrowVault snapshot in this history
    });
    expect((await get(`/v1/gigs/${pk().toBase58()}`)).status).toBe(404);
  });

  it("GET /v1/gigs/:gig/milestones and /v1/milestones/:milestone", async () => {
    const list = (await get(`/v1/gigs/${s.gig.toBase58()}/milestones`)).body.items;
    expect(list).toHaveLength(1);
    const { body } = await get(`/v1/milestones/${s.m0.toBase58()}`);
    expect(body).toMatchObject({
      address: s.m0.toBase58(),
      gig: s.gig.toBase58(),
      index: 0,
      amount: 400,
      released: 396,
      feesPaid: 4,
      refunded: 0,
      status: "completed",
      submittedAt: 2_000,
      submittedSlot: 15,
      approvedAt: 2_100,
      specHash: s.spec.hex,
      deliveryHash: s.delivery.hex,
      reportHash: s.report.hex,
      termsAccepted: true,
      terms: { partialTimeout: TERMS.partial_timeout, fullTimeout: TERMS.full_timeout, partialBps: TERMS.partial_bps, feeBps: TERMS.fee_bps },
      title: null,
      slot: 17,
    });
    expect((await get(`/v1/milestones/${s.m1.toBase58()}`)).status).toBe(404);
  });

  describe("GET /v1/activity", () => {
    it("returns ChainEvents newest first", async () => {
      const { body } = await get("/v1/activity?limit=100");
      expect(body.items).toHaveLength(23);
      expect(body.items[0]).toMatchObject({ program: "gig", name: "GigUpdated", slot: 23, gig: s.gig3.toBase58() });
      const slots = body.items.map((e: { slot: number }) => e.slot);
      expect([...slots].sort((a, b) => b - a)).toEqual(slots);
      expect(body.items.find((e: { name: string }) => e.name === "MilestoneFunded")).toMatchObject({
        program: "escrow",
        amount: 400,
        receipt: expect.stringContaining("locked in escrow"),
      });
      const byName = (name: string) => body.items.filter((e: { name: string }) => e.name === name);
      expect(byName("TermsAccepted")[0]).toMatchObject({ actors: [s.freelancer.toBase58()], milestone: s.m0.toBase58(), receipt: expect.stringContaining("accepted the milestone terms") });
      expect(byName("ProtocolFeeCollected").map((e: { amount: number }) => e.amount)).toEqual([3, 1]);
      expect(byName("ProtocolConfigUpdated")[0]).toMatchObject({ actors: [s.admin.toBase58()], receipt: expect.stringContaining("1% fee") });
      expect(byName("DeliverySubmitted")[0].receipt).toContain("with a verification report");
    });

    it("filters by wallet: named actors plus events on that wallet's gigs", async () => {
      const { body } = await get(`/v1/activity?wallet=${s.freelancer.toBase58()}&limit=100`);
      const names = body.items.map((e: { name: string }) => e.name);
      expect(names).toContain("FreelancerAssigned");
      expect(names).toContain("MilestoneApproved"); // via the gig, not an actor
      expect(names).toContain("RatingSubmitted");
      expect(body.items.every((e: { gig?: string; actors: string[] }) => e.gig === s.gig.toBase58() || e.actors.includes(s.freelancer.toBase58()))).toBe(true);
    });

    it("paginates with a keyset cursor without gaps or duplicates", async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const { body } = await get(`/v1/activity?limit=4${cursor ? `&cursor=${cursor}` : ""}`);
        seen.push(...body.items.map((e: { signature: string; eventIndex: number }) => `${e.signature}:${e.eventIndex}`));
        cursor = body.nextCursor;
      } while (cursor);
      expect(seen).toHaveLength(23);
      expect(new Set(seen).size).toBe(23);
    });
  });

  it("GET /v1/protocol returns the config and treasury fee totals with account and slot", async () => {
    const { status, body } = await get("/v1/protocol");
    expect(status).toBe(200);
    const account = protocolConfigPda(programIds.escrow);
    expect(body).toMatchObject({ account, slot: 9 });
    expect(body.config.feeBps).toEqual({ value: TERMS.fee_bps, account, slot: 9 });
    expect(body.config.partialTimeout).toEqual({ value: TERMS.partial_timeout, account, slot: 9 });
    expect(body.config.treasury).toEqual({ value: s.treasury.toBase58(), account, slot: 9 });
    expect(body.config.noDeliveryGrace.value).toBe(TERMS.no_delivery_grace);
    expect(body.treasury).toEqual({ totalFees: { value: 4, account: s.treasury.toBase58(), slot: 17 }, feeCount: 2 });
  });

  describe("GET /v1/reputation/:wallet", () => {
    it("returns every value with the account and slot it came from", async () => {
      const { status, body } = await get(`/v1/reputation/${s.freelancer.toBase58()}`);
      expect(status).toBe(200);
      const account = s.profile.toBase58();
      expect(body).toMatchObject({ wallet: s.freelancer.toBase58(), account, slot: 19 });
      expect(body.profile.ratingCount).toEqual({ value: 1, account, slot: 19 });
      expect(body.profile.averageRating).toEqual({ value: 500, account, slot: 19 });
      expect(body.profile.completedJobs).toEqual({ value: 0, account, slot: 18 });
      // Extended counters start at 0 with the profile.
      expect(body.profile.onTimeJobs).toEqual({ value: 0, account, slot: 18 });
      expect(body.profile.disputesLost).toEqual({ value: 0, account, slot: 18 });
      expect(body.ratings).toHaveLength(1);
      expect(body.ratings[0].score).toEqual({ value: 5, account: s.rating.toBase58(), slot: 19 });
      expect(body.badges).toEqual([]);
    });

    it("400 on a malformed wallet, 404 when no profile is indexed", async () => {
      expect((await get("/v1/reputation/not-a-key")).status).toBe(400);
      const r = await get(`/v1/reputation/${pk().toBase58()}`);
      expect(r.status).toBe(404);
      expect(r.body.account).toEqual(expect.any(String));
    });
  });
});
