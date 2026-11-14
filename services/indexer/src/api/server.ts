import { PROGRAM_IDS, type ProgramIds } from "@proove/config";
import { PublicKey } from "@solana/web3.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "../db/pool";
import { profilePda } from "../handlers/util";
import {
  PROFILE_FIELDS,
  decodeCursor,
  encodeCursor,
  sourced,
  toChainEvent,
  toGig,
  toMilestone,
  type Sourced,
} from "./mappers";

export interface ApiOptions {
  pool: Pool;
  programIds?: ProgramIds;
  logger?: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function isPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

const limitSchema = { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT } as const;

export function buildApi({ pool, programIds = PROGRAM_IDS, logger = false }: ApiOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.get("/healthz", async (_req, reply) => {
    try {
      const { rows } = await pool.query(`SELECT program, last_slot, updated_at FROM ingest_cursors ORDER BY program`);
      return { ok: true, cursors: rows };
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
  });

  // ─── Gigs ────────────────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      q?: string;
      category?: string;
      skill?: string;
      status?: string;
      client?: string;
      freelancer?: string;
      minBudget?: number;
      maxBudget?: number;
      cursor?: string;
      limit: number;
    };
  }>(
    "/v1/gigs",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string", maxLength: 200 },
            category: { type: "string" },
            skill: { type: "string" },
            status: { type: "string" },
            client: { type: "string" },
            freelancer: { type: "string" },
            minBudget: { type: "integer", minimum: 0 },
            maxBudget: { type: "integer", minimum: 0 },
            cursor: { type: "string" },
            limit: limitSchema,
          },
        },
      },
    },
    async (req) => {
      const { q, category, skill, status, client, freelancer, minBudget, maxBudget, cursor, limit } = req.query;
      const where: string[] = [];
      const params: unknown[] = [];
      const add = (sql: (p: string) => string, value: unknown) => {
        params.push(value);
        where.push(sql(`$${params.length}`));
      };
      const query = q?.trim();
      let rank = "0";
      if (query) {
        params.push(query);
        const p = `$${params.length}`;
        where.push(`search @@ websearch_to_tsquery('english', ${p})`);
        rank = `ts_rank(search, websearch_to_tsquery('english', ${p}))`;
      }
      if (category) add((p) => `lower(category) = lower(${p})`, category);
      if (skill) add((p) => `EXISTS (SELECT 1 FROM unnest(skills) s WHERE lower(s) = lower(${p}))`, skill);
      if (status) add((p) => `status = ANY(string_to_array(${p}, ','))`, status);
      if (client) add((p) => `client = ${p}`, client);
      if (freelancer) add((p) => `freelancer = ${p}`, freelancer);
      if (minBudget !== undefined) add((p) => `budget >= ${p}`, minBudget);
      if (maxBudget !== undefined) add((p) => `budget <= ${p}`, maxBudget);
      // Relevance ordering makes keyset pagination unstable, so the cursor is an offset.
      const offset = decodeCursor<{ o: number }>(cursor)?.o ?? 0;
      params.push(limit + 1, offset);
      const { rows } = await pool.query(
        `SELECT *, ${rank} AS rank FROM gigs
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY rank DESC, created_at DESC NULLS LAST, address DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const page = rows.slice(0, limit);
      return {
        items: page.map(toGig),
        nextCursor: rows.length > limit ? encodeCursor({ o: offset + limit }) : null,
      };
    },
  );

  app.get<{ Params: { gig: string } }>("/v1/gigs/:gig", async (req, reply) => {
    const { rows } = await pool.query(`SELECT * FROM gigs WHERE address = $1`, [req.params.gig]);
    if (!rows[0]) return reply.code(404).send({ error: "gig not found" });
    return toGig(rows[0]);
  });

  app.get<{ Params: { gig: string } }>("/v1/gigs/:gig/milestones", async (req) => {
    const { rows } = await pool.query(`SELECT * FROM milestones WHERE gig = $1 ORDER BY index ASC NULLS LAST, address`, [
      req.params.gig,
    ]);
    return { items: rows.map(toMilestone) };
  });

  app.get<{ Params: { milestone: string } }>("/v1/milestones/:milestone", async (req, reply) => {
    const { rows } = await pool.query(`SELECT * FROM milestones WHERE address = $1`, [req.params.milestone]);
    if (!rows[0]) return reply.code(404).send({ error: "milestone not found" });
    return toMilestone(rows[0]);
  });

  // ─── Activity ────────────────────────────────────────────────────────────

  app.get<{ Querystring: { wallet?: string; gig?: string; milestone?: string; cursor?: string; limit: number } }>(
    "/v1/activity",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            wallet: { type: "string" },
            gig: { type: "string" },
            milestone: { type: "string" },
            cursor: { type: "string" },
            limit: limitSchema,
          },
        },
      },
    },
    async (req) => {
      const { wallet, gig, milestone, cursor, limit } = req.query;
      const where: string[] = [];
      const params: unknown[] = [];
      if (wallet) {
        params.push(wallet);
        // Escrow events name no wallets; they reach a wallet through its gigs.
        where.push(
          `(actors @> ARRAY[$${params.length}]::text[] OR gig IN (SELECT address FROM gigs WHERE client = $${params.length} OR freelancer = $${params.length}))`,
        );
      }
      if (gig) {
        params.push(gig);
        where.push(`gig = $${params.length}`);
      }
      if (milestone) {
        params.push(milestone);
        where.push(`milestone = $${params.length}`);
      }
      const after = decodeCursor<{ s: number; sig: string; i: number }>(cursor);
      if (after) {
        params.push(after.s, after.sig, after.i);
        const n = params.length;
        where.push(`(slot, signature, event_index) < ($${n - 2}, $${n - 1}, $${n})`);
      }
      params.push(limit + 1);
      const { rows } = await pool.query(
        `SELECT * FROM events ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY slot DESC, signature DESC, event_index DESC LIMIT $${params.length}`,
        params,
      );
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return {
        items: page.map(toChainEvent),
        nextCursor: rows.length > limit && last ? encodeCursor({ s: last.slot, sig: last.signature, i: last.event_index }) : null,
      };
    },
  );

  // ─── Reputation ──────────────────────────────────────────────────────────

  app.get<{ Params: { wallet: string } }>("/v1/reputation/:wallet", async (req, reply) => {
    const { wallet } = req.params;
    if (!isPubkey(wallet)) return reply.code(400).send({ error: "wallet must be a base58 public key" });
    const pda = profilePda(wallet, programIds.reputation);
    const { rows } = await pool.query(`SELECT * FROM profiles WHERE account = $1 OR authority = $2 LIMIT 1`, [pda, wallet]);
    const p = rows[0];
    if (!p) return reply.code(404).send({ error: "profile not indexed", wallet, account: pda });

    const profile = Object.fromEntries(
      Object.entries(PROFILE_FIELDS).map(([field, column]) => [field, sourced(p, column, p.account)]),
    ) as Record<keyof typeof PROFILE_FIELDS, Sourced<number>>;

    const [badges, achievements, ratings] = await Promise.all([
      pool.query(`SELECT * FROM badges WHERE profile = $1 ORDER BY issued_at`, [p.account]),
      pool.query(`SELECT * FROM achievements WHERE owner = $1`, [wallet]),
      pool.query(`SELECT * FROM ratings WHERE freelancer = $1 ORDER BY submitted_at DESC NULLS LAST`, [wallet]),
    ]);
    const minted = new Map(achievements.rows.filter((a) => a.claimed).map((a) => [a.badge_type, a]));

    return {
      wallet,
      account: p.account,
      slot: p.slot,
      profile: { authority: { value: p.authority ?? wallet, account: p.account, slot: p.field_slots.authority ?? p.slot }, ...profile },
      badges: badges.rows.map((b) => {
        const nft = minted.get(b.badge_type);
        return {
          type: sourced(b, "badge_type", b.account),
          issuedAt: sourced(b, "issued_at", b.account),
          minted: nft
            ? { value: true, account: nft.account, slot: nft.field_slots.claimed ?? nft.slot }
            : { value: false, account: null, slot: null },
          assetId: nft ? sourced(nft, "mint", nft.account) : { value: null, account: null, slot: null },
        };
      }),
      ratings: ratings.rows.map((r) => ({
        jobId: sourced(r, "job_id", r.account),
        gig: sourced(r, "gig", r.account),
        client: sourced(r, "client", r.account),
        score: sourced(r, "score", r.account),
        reviewHash: sourced(r, "review_hash", r.account),
        submittedAt: sourced(r, "submitted_at", r.account),
      })),
    };
  });

  return app;
}
