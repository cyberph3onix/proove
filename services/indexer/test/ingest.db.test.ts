import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "../src/db/pool";
import { backfillAccounts, ingestTransaction, ingestTransactions, pollProgram, type Indexer } from "../src/ingest";
import { FakeSource, PublicKey, bn, encodeAccount, eventLine, invocation, pk, program, programIds, programs, tx } from "./helpers";
import { protocolConfigPda, vaultPda } from "../src/handlers/util";
import { dbAvailable, setupTestDb } from "./db";
import { TERMS, buildScenario, hashOf } from "./scenario";

describe.skipIf(!dbAvailable)("ingest (Postgres)", () => {
  let pool: Pool;
  let teardown: () => Promise<void>;
  const s = buildScenario();

  beforeAll(async () => {
    const db = (await setupTestDb())!;
    pool = db.pool;
    teardown = db.teardown;
  });
  afterAll(async () => teardown?.());

  const ix = () => ({ pool, programs, programIds });

  it("ingests a history into gigs, milestones, profiles and ratings", async () => {
    const n = await ingestTransactions(ix(), s.txs);
    expect(n).toBe(23);

    const gig = (await pool.query(`SELECT * FROM gigs WHERE address = $1`, [s.gig.toBase58()])).rows[0];
    expect(gig).toMatchObject({
      id: 1,
      client: s.client.toBase58(),
      freelancer: s.freelancer.toBase58(),
      status: "inProgress",
      title: "Solana escrow dashboard",
      skills: ["rust", "react"],
      budget: 900_000_000,
    });

    const ms = (await pool.query(`SELECT * FROM milestones WHERE gig = $1`, [s.gig.toBase58()])).rows;
    expect(ms).toHaveLength(1); // m1 was cancelled and closed
    expect(ms[0]).toMatchObject({
      address: s.m0.toBase58(),
      status: "completed",
      amount: 400,
      released: 396,
      fees_paid: 4,
      refunded: 0,
      spec_hash: s.spec.hex,
      delivery_hash: s.delivery.hex,
      report_hash: s.report.hex,
      terms_accepted: true,
      submitted_slot: 15,
      approved_at: 2_100,
      // Snapshotted from the protocol config in force at funding (slot 14).
      partial_timeout: TERMS.partial_timeout,
      full_timeout: TERMS.full_timeout,
      partial_bps: TERMS.partial_bps,
      fee_bps: TERMS.fee_bps,
    });
    expect(ms[0].field_slots.partial_bps).toBe(14);

    const config = (await pool.query(`SELECT * FROM protocol_config`)).rows;
    expect(config).toEqual([
      expect.objectContaining({ address: protocolConfigPda(programIds.escrow), admin: s.admin.toBase58(), treasury: s.treasury.toBase58(), ...TERMS, slot: 9 }),
    ]);

    const profile = (await pool.query(`SELECT * FROM profiles WHERE account = $1`, [s.profile.toBase58()])).rows[0];
    expect(profile).toMatchObject({ authority: s.freelancer.toBase58(), rating_count: 1, rating_sum: 5, average_rating: 500 });
    expect(profile).toMatchObject({ on_time_jobs: 0, disputes_won: 0, disputes_lost: 0 });

    const rating = (await pool.query(`SELECT * FROM ratings WHERE account = $1`, [s.rating.toBase58()])).rows[0];
    expect(rating).toMatchObject({ score: 5, freelancer: s.freelancer.toBase58() });
  });

  it("is idempotent on (signature, event index)", async () => {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM events`)).rows[0].n;
    expect(await ingestTransactions(ix(), s.txs)).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM events`)).rows[0].n).toBe(before);
    const m = (await pool.query(`SELECT released FROM milestones WHERE address = $1`, [s.m0.toBase58()])).rows[0];
    expect(m.released).toBe(396);
  });

  it("keeps the newest value per column: older events cannot overwrite a newer account snapshot", async () => {
    const source = new FakeSource();
    source.slot = 30;
    source.accounts.set(programIds.reputation, [
      {
        address: s.profile.toBase58(),
        data: await encodeAccount("reputation", "UserProfile", {
          authority: s.freelancer,
          completed_jobs: bn(1),
          successful_jobs: bn(1),
          cancelled_jobs: bn(0),
          total_earnings: bn(400),
          rating_sum: bn(5),
          rating_count: bn(1),
          average_rating: 500,
          reputation_score: bn(700),
          badges_earned: 0,
          created_at: bn(1_500),
          updated_at: bn(2_200),
          bump: 254,
          on_time_jobs: bn(1),
          disputes_won: bn(0),
          disputes_lost: bn(0),
        }),
      },
    ]);
    const counts = await backfillAccounts({ ...ix(), source } as Indexer, program("reputation"));
    expect(counts.UserProfile).toBe(1);

    // Older than the snapshot (slot 25 < 30): neither the set nor the increment applies.
    await ingestTransaction(
      ix(),
      tx(
        25,
        invocation("reputation", [
          eventLine("reputation", "CompletionUpdated", {
            profile: s.profile,
            completed_jobs: bn(0),
            successful_jobs: bn(0),
            total_earnings: bn(0),
            reputation_score: bn(100),
            on_time_jobs: bn(0),
            disputes_won: bn(0),
            disputes_lost: bn(0),
          }),
          eventLine("reputation", "RatingSubmitted", { rating: pk(), job_id: bn(9), client: s.client, freelancer: s.freelancer, score: 1, new_average_rating: 300 }),
        ]),
      ),
    );
    const p = (await pool.query(`SELECT * FROM profiles WHERE account = $1`, [s.profile.toBase58()])).rows[0];
    expect(p).toMatchObject({ reputation_score: 700, completed_jobs: 1, rating_count: 1, average_rating: 500, on_time_jobs: 1, slot: 30 });
    expect(p.field_slots.reputation_score).toBe(30);

    // Newer than the snapshot: applies.
    await ingestTransaction(
      ix(),
      tx(31, invocation("reputation", [eventLine("reputation", "ProfileUpdated", { profile: s.profile, reputation_score: bn(720), updated_at: bn(2_300) })])),
    );
    const p2 = (await pool.query(`SELECT reputation_score, field_slots FROM profiles WHERE account = $1`, [s.profile.toBase58()])).rows[0];
    expect(p2.reputation_score).toBe(720);
    expect(p2.field_slots.reputation_score).toBe(31);
  });

  it("backfills gig and milestone accounts from getProgramAccounts", async () => {
    const source = new FakeSource();
    source.slot = 40;
    const g = pk();
    const m = pk();
    const mint = pk();
    source.accounts.set(programIds.gig, [
      {
        address: g.toBase58(),
        data: await encodeAccount("gig", "Gig", {
          id: bn(77),
          client: s.client,
          freelancer: PublicKey.default,
          mint,
          status: { Published: {} },
          created_at: bn(3_000),
          updated_at: bn(3_001),
          title: "Backfilled gig",
          description: "From an account snapshot",
          skills: "go",
          category: "Development",
          budget: bn(1_000),
          deadline: bn(4_000),
          bump: 250,
        }),
      },
    ]);
    source.accounts.set(programIds.escrow, [
      {
        address: m.toBase58(),
        data: await encodeAccount("escrow", "Milestone", {
          gig: g,
          index: 0,
          amount: bn(1_000),
          released: bn(0),
          status: { Funded: {} },
          submitted_at: bn(0),
          approved_at: bn(0),
          bump: 250,
          spec_hash: hashOf(0x5c).bytes,
          delivery_hash: Array(32).fill(0),
          report_hash: Array(32).fill(0),
          terms_accepted: true,
          submitted_slot: bn(0),
          funded_at: bn(3_500),
          partial_timeout: bn(100),
          full_timeout: bn(200),
          partial_bps: 3_000,
          fee_bps: 50,
          fees_paid: bn(0),
          refunded: bn(0),
        }),
      },
      {
        address: vaultPda(g.toBase58(), programIds.escrow),
        data: await encodeAccount("escrow", "EscrowVault", {
          gig: g,
          token_account: pk(),
          mint,
          total_locked: bn(1_000),
          total_released: bn(0),
          milestone_count: 1,
          active_milestone: 0,
          cancelled_milestones: 0,
          reputation_synced: false,
          bump: 251,
          total_fees: bn(0),
          total_refunded: bn(0),
          refunded_milestones: 0,
          late_deliveries: 0,
        }),
      },
      {
        address: protocolConfigPda(programIds.escrow),
        data: await encodeAccount("escrow", "ProtocolConfig", {
          admin: pk(),
          treasury: s.treasury,
          partial_timeout: bn(100),
          full_timeout: bn(200),
          partial_bps: 3_000,
          fee_bps: 50,
          min_milestone: bn(10),
          no_delivery_grace: bn(60),
          bump: 252,
        }),
      },
    ]);
    await backfillAccounts({ ...ix(), source } as Indexer, program("gig"));
    expect(await backfillAccounts({ ...ix(), source } as Indexer, program("escrow"))).toEqual({ EscrowVault: 1, Milestone: 1, ProtocolConfig: 1 });
    const gig = (await pool.query(`SELECT * FROM gigs WHERE address = $1`, [g.toBase58()])).rows[0];
    expect(gig).toMatchObject({ status: "published", mint: mint.toBase58(), freelancer: null, slot: 40, skills: ["go"] });
    const ms = (await pool.query(`SELECT * FROM milestones WHERE address = $1`, [m.toBase58()])).rows[0];
    expect(ms).toMatchObject({
      status: "funded",
      submitted_at: null,
      submitted_slot: null,
      spec_hash: hashOf(0x5c).hex,
      delivery_hash: "0".repeat(64),
      terms_accepted: true,
      funded_at: 3_500,
      partial_timeout: 100,
      fee_bps: 50,
      fees_paid: 0,
      slot: 40,
    });
    const vault = (await pool.query(`SELECT * FROM vaults WHERE gig = $1`, [g.toBase58()])).rows[0];
    expect(vault).toMatchObject({ total_locked: 1_000, total_fees: 0, total_refunded: 0, refunded_milestones: 0, milestone_count: 1, mint: mint.toBase58() });
    const config = (await pool.query(`SELECT * FROM protocol_config`)).rows[0];
    expect(config).toMatchObject({ fee_bps: 50, min_milestone: 10, slot: 40 });
  });

  it("refunds after the deadline: status, refunded amount and receipt", async () => {
    const g = pk();
    const m = pk();
    await ingestTransactions(ix(), [
      tx(60, invocation("escrow", [eventLine("escrow", "MilestoneCreated", { gig: g, milestone: m, index: 0, amount: bn(2_000_000), spec_hash: hashOf(1).bytes })])),
      tx(61, invocation("escrow", [eventLine("escrow", "MilestoneFunded", { gig: g, milestone: m, amount: bn(2_000_000) })])),
      tx(70, invocation("escrow", [eventLine("escrow", "RefundedAfterDeadline", { gig: g, milestone: m, amount: bn(2_000_000) })])),
    ]);
    const row = (await pool.query(`SELECT * FROM milestones WHERE address = $1`, [m.toBase58()])).rows[0];
    expect(row).toMatchObject({ status: "refunded", refunded: 2_000_000, released: 0, fees_paid: 0, terms_accepted: false });
    // Funded at slot 61, after the protocol config was last written (slot 40): terms copied from it.
    expect(row).toMatchObject({ partial_timeout: 100, fee_bps: 50 });
    const ev = (await pool.query(`SELECT * FROM events WHERE name = 'RefundedAfterDeadline' AND milestone = $1`, [m.toBase58()])).rows[0];
    expect(ev).toMatchObject({ gig: g.toBase58(), amount: 2_000_000 });
    expect(ev.receipt).toContain("went back to the client");
  });

  it("leaves funding terms unset when the config was only written after the funding slot", async () => {
    const g = pk();
    const m = pk();
    await ingestTransactions(ix(), [
      tx(35, invocation("escrow", [eventLine("escrow", "MilestoneCreated", { gig: g, milestone: m, index: 0, amount: bn(5), spec_hash: hashOf(2).bytes })])),
      tx(36, invocation("escrow", [eventLine("escrow", "MilestoneFunded", { gig: g, milestone: m, amount: bn(5) })])),
    ]);
    const row = (await pool.query(`SELECT * FROM milestones WHERE address = $1`, [m.toBase58()])).rows[0];
    expect(row).toMatchObject({ status: "funded", partial_timeout: null, fee_bps: null });
  });

  it("polls from a stored cursor, oldest first", async () => {
    const source = new FakeSource();
    const g = pk();
    const first = tx(50, invocation("gig", [eventLine("gig", "GigCreated", { gig: g, id: bn(5), client: s.client, freelancer: PublicKey.default, created_at: bn(5) })]));
    const second = tx(51, invocation("gig", [eventLine("gig", "GigPublished", { gig: g, id: bn(5) })]));
    source.addTx(first, programIds.gig);
    source.addTx(second, programIds.gig);

    const indexer: Indexer = { ...ix(), source };
    expect(await pollProgram(indexer, program("gig"))).toEqual({ signatures: 2, events: 2 });
    const cursor = (await pool.query(`SELECT * FROM ingest_cursors WHERE program = 'gig'`)).rows[0];
    expect(cursor).toMatchObject({ last_signature: second.signature, last_slot: 51 });
    expect((await pool.query(`SELECT status FROM gigs WHERE address = $1`, [g.toBase58()])).rows[0].status).toBe("published");

    const third = tx(52, invocation("gig", [eventLine("gig", "GigArchived", { gig: g, id: bn(5) })]));
    source.addTx(third, programIds.gig);
    expect(await pollProgram(indexer, program("gig"))).toEqual({ signatures: 1, events: 1 });
    expect(source.calls.at(-1)?.until).toBe(second.signature);
    expect((await pool.query(`SELECT status FROM gigs WHERE address = $1`, [g.toBase58()])).rows[0].status).toBe("archived");
  });
});
