import type { ActivityInfo, Mutation } from "../handlers/types";
import { TABLES } from "../handlers/types";
import type { Plain } from "../decode";
import type { PoolClient, Queryable } from "./pool";

export interface EventRow {
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: number | null;
  program: string;
  name: string;
  data: Record<string, Plain>;
  activity: ActivityInfo;
}

/** Insert one event; returns false when (signature, event_index) was already stored. */
export async function insertEvent(client: Queryable, e: EventRow): Promise<boolean> {
  const res = await client.query(
    `INSERT INTO events (signature, event_index, slot, block_time, program, name, data, actors, gig, milestone, case_address, amount, receipt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (signature, event_index) DO NOTHING`,
    [
      e.signature,
      e.eventIndex,
      e.slot,
      e.blockTime,
      e.program,
      e.name,
      JSON.stringify(e.data),
      [...new Set(e.activity.actors.filter(Boolean))],
      e.activity.gig ?? null,
      e.activity.milestone ?? null,
      e.activity.case ?? null,
      e.activity.amount ?? null,
      e.activity.receipt,
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

function checkColumns(table: Mutation["table"], cols: string[]) {
  const allowed: readonly string[] = TABLES[table].columns;
  for (const c of cols) if (!allowed.includes(c)) throw new Error(`Unknown column ${table}.${c}`);
}

/**
 * Apply one mutation at `slot` with per-column slot gating (see `Mutation`).
 * Assumes a single writer inside a transaction (the row is locked with
 * FOR UPDATE when it exists).
 */
export async function applyMutation(client: PoolClient, m: Mutation, slot: number): Promise<void> {
  const { key: keyCol } = TABLES[m.table];
  const existing = await client.query<{ slot: number; field_slots: Record<string, number> }>(
    `SELECT slot, field_slots FROM ${m.table} WHERE ${keyCol} = $1 FOR UPDATE`,
    [m.key],
  );
  const row = existing.rows[0];

  if (m.remove) {
    if (row && row.slot <= slot) await client.query(`DELETE FROM ${m.table} WHERE ${keyCol} = $1`, [m.key]);
    return;
  }

  const fieldSlots = row?.field_slots ?? {};
  const set = Object.entries(m.set ?? {}).filter(([c]) => fieldSlots[c] === undefined || fieldSlots[c]! <= slot);
  const inc = Object.entries(m.inc ?? {}).filter(([c]) => fieldSlots[c] === undefined || fieldSlots[c]! < slot);
  checkColumns(m.table, [...set.map(([c]) => c), ...inc.map(([c]) => c)]);
  const stamped = Object.fromEntries([...set, ...inc].map(([c]) => [c, slot]));

  if (!row) {
    const cols = [keyCol, ...set.map(([c]) => c), ...inc.map(([c]) => c), "slot", "field_slots"];
    const values = [m.key, ...set.map(([, v]) => v), ...inc.map(([, v]) => v), slot, JSON.stringify(stamped)];
    await client.query(
      `INSERT INTO ${m.table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );
    return;
  }

  if (set.length === 0 && inc.length === 0) return;
  const values: unknown[] = [m.key];
  const assigns: string[] = [];
  for (const [c, v] of set) {
    values.push(v);
    assigns.push(`"${c}" = $${values.length}`);
  }
  for (const [c, v] of inc) {
    values.push(v);
    assigns.push(`"${c}" = coalesce("${c}", 0) + $${values.length}`);
  }
  values.push(slot);
  assigns.push(`slot = greatest(slot, $${values.length})`);
  values.push(JSON.stringify(stamped));
  assigns.push(`field_slots = field_slots || $${values.length}::jsonb`);
  await client.query(`UPDATE ${m.table} SET ${assigns.join(", ")} WHERE ${keyCol} = $1`, values);
}

export interface Cursor {
  program: string;
  lastSignature: string | null;
  lastSlot: number | null;
}

export async function getCursor(db: Queryable, program: string): Promise<Cursor> {
  const { rows } = await db.query<{ last_signature: string | null; last_slot: number | null }>(
    `SELECT last_signature, last_slot FROM ingest_cursors WHERE program = $1`,
    [program],
  );
  return { program, lastSignature: rows[0]?.last_signature ?? null, lastSlot: rows[0]?.last_slot ?? null };
}

export async function setCursor(db: Queryable, program: string, signature: string, slot: number): Promise<void> {
  await db.query(
    `INSERT INTO ingest_cursors (program, last_signature, last_slot, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (program) DO UPDATE SET last_signature = EXCLUDED.last_signature, last_slot = EXCLUDED.last_slot, updated_at = now()`,
    [program, signature, slot],
  );
}
