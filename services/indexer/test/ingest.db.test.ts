import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "../src/db/pool";
import { backfillAccounts, ingestTransaction, ingestTransactions, pollProgram, type Indexer } from "../src/ingest";
import { FakeSource, PublicKey, bn, encodeAccount, eventLine, invocation, pk, program, programIds, programs, tx } from "./helpers";
import { dbAvailable, setupTestDb } from "./db";
import { buildScenario } from "./scenario";

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
    expect(n).toBe(19);

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
    expect(ms[0]).toMatchObject({ address: s.m0.toBase58(), status: "completed", amount: 400, released: 400, submitted_slot: 15, approved_at: 2_100 });

    const profile = (await pool.query(`SELECT * FROM profiles WHERE account = $1`, [s.profile.toBase58()])).rows[0];
    expect(profile).toMatchObject({ authority: s.freelancer.toBase58(), rating_count: 1, rating_sum: 5, average_rating: 500 });

    const rating = (await pool.query(`SELECT * FROM ratings WHERE account = $1`, [s.rating.toBase58()])).rows[0];
    expect(rating).toMatchObject({ score: 5, freelancer: s.freelancer.toBase58() });
  });

  it("is idempotent on (signature, event index)", async () => {
    const before = (await pool.query(`SELECT count(*)::int AS n FROM events`)).rows[0].n;
    expect(await ingestTransactions(ix(), s.txs)).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM events`)).rows[0].n).toBe(before);
    const m = (await pool.query(`SELECT released FROM milestones WHERE address = $1`, [s.m0.toBase58()])).rows[0];
    expect(m.released).toBe(400);
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
          eventLine("reputation", "CompletionUpdated", { profile: s.profile, completed_jobs: bn(0), successful_jobs: bn(0), total_earnings: bn(0), reputation_score: bn(100) }),
          eventLine("reputation", "RatingSubmitted", { rating: pk(), job_id: bn(9), client: s.client, freelancer: s.freelancer, score: 1, new_average_rating: 300 }),
        ]),
      ),
    );
    const p = (await pool.query(`SELECT * FROM profiles WHERE account = $1`, [s.profile.toBase58()])).rows[0];
    expect(p).toMatchObject({ reputation_score: 700, completed_jobs: 1, rating_count: 1, average_rating: 500, slot: 30 });
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
        }),
      },
    ]);
    await backfillAccounts({ ...ix(), source } as Indexer, program("gig"));
    await backfillAccounts({ ...ix(), source } as Indexer, program("escrow"));
    const gig = (await pool.query(`SELECT * FROM gigs WHERE address = $1`, [g.toBase58()])).rows[0];
    expect(gig).toMatchObject({ status: "published", mint: mint.toBase58(), freelancer: null, slot: 40, skills: ["go"] });
    const ms = (await pool.query(`SELECT * FROM milestones WHERE address = $1`, [m.toBase58()])).rows[0];
    expect(ms).toMatchObject({ status: "funded", submitted_at: null, spec_hash: null, slot: 40 });
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
