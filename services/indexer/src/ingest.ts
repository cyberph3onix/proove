import type { ProgramIds } from "@proove/config";
import { decodeAccount, decodeEventsFromLogs } from "./decode";
import { applyMutation, getCursor, insertEvent, setCursor } from "./db/store";
import { withTransaction, type Pool } from "./db/pool";
import { ACCOUNT_HANDLERS } from "./handlers/accounts";
import { EVENT_HANDLERS, UNKNOWN_EVENT, type HandlerKey } from "./handlers/events";
import type { EventContext } from "./handlers/types";
import { programById, type ProgramDef } from "./programs";
import type { ChainSource, TxRecord } from "./rpc/source";

export interface Indexer {
  pool: Pool;
  source: ChainSource;
  programs: ProgramDef[];
  programIds: ProgramIds;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * Decode and store the events of one transaction atomically. Re-ingesting a
 * transaction is a no-op: events are keyed by (signature, event index) and
 * entity writes only run for newly inserted events.
 */
export async function ingestTransaction(ix: Pick<Indexer, "pool" | "programs" | "programIds">, tx: TxRecord): Promise<number> {
  if (tx.failed) return 0;
  const events = decodeEventsFromLogs(tx.logs, programById(ix.programs));
  if (events.length === 0) return 0;
  const ctx: EventContext = { signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime, programIds: ix.programIds };
  return withTransaction(ix.pool, async (client) => {
    let inserted = 0;
    for (const ev of events) {
      const handler = EVENT_HANDLERS[`${ev.program}.${ev.name}` as HandlerKey] ?? UNKNOWN_EVENT;
      const fresh = await insertEvent(client, {
        signature: tx.signature,
        eventIndex: ev.index,
        slot: tx.slot,
        blockTime: tx.blockTime,
        program: ev.program,
        name: ev.name,
        data: ev.data,
        activity: handler.activity(ev.data, ctx),
      });
      if (!fresh) continue;
      inserted++;
      for (const m of handler.mutations(ev.data, ctx)) await applyMutation(client, m, tx.slot);
    }
    return inserted;
  });
}

export async function ingestTransactions(ix: Pick<Indexer, "pool" | "programs" | "programIds">, txs: TxRecord[]): Promise<number> {
  let n = 0;
  for (const tx of [...txs].sort((a, b) => a.slot - b.slot)) n += await ingestTransaction(ix, tx);
  return n;
}

/**
 * Fetch every signature for `program` newer than its cursor (paging back
 * with `before`, capped at `max`), ingest them oldest first, then advance
 * the cursor to the newest one.
 */
export async function pollProgram(ix: Indexer, program: ProgramDef, max = 1000): Promise<{ signatures: number; events: number }> {
  const cursor = await getCursor(ix.pool, program.name);
  const collected: { signature: string; slot: number; failed: boolean }[] = [];
  let before: string | undefined;
  while (collected.length < max) {
    const page = await ix.source.getSignatures(program.programId, {
      before,
      until: cursor.lastSignature ?? undefined,
      limit: Math.min(1000, max - collected.length),
    });
    if (page.length === 0) break;
    collected.push(...page);
    before = page[page.length - 1]!.signature;
    if (page.length < Math.min(1000, max)) break;
  }
  if (collected.length === 0) return { signatures: 0, events: 0 };

  let events = 0;
  for (const sig of [...collected].reverse()) {
    if (sig.failed) continue;
    const tx = await ix.source.getTransaction(sig.signature);
    if (tx) events += await ingestTransaction(ix, tx);
  }
  if (collected.length >= max && cursor.lastSignature) {
    ix.log?.("signature cap reached; older signatures after the cursor were skipped (run a backfill)", { program: program.name, max });
  }
  const newest = collected[0]!;
  await setCursor(ix.pool, program.name, newest.signature, newest.slot);
  return { signatures: collected.length, events };
}

/** One polling pass over every program. */
export async function pollAll(ix: Indexer, max?: number) {
  const out: Record<string, { signatures: number; events: number }> = {};
  for (const p of ix.programs) out[p.name] = await pollProgram(ix, p, max);
  return out;
}

/**
 * Snapshot every account type the program's IDL declares (filtered by
 * discriminator) and write them through the account handlers, stamped with
 * the RPC context slot.
 */
export async function backfillAccounts(ix: Indexer, program: ProgramDef): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const acc of program.idl.accounts ?? []) {
    const handler = ACCOUNT_HANDLERS[`${program.name}.${acc.name}`];
    if (!handler) continue;
    const { slot, accounts } = await ix.source.getProgramAccounts(program.programId, [{ memcmp: program.coder.accounts.memcmp(acc.name) }]);
    await withTransaction(ix.pool, async (client) => {
      for (const raw of accounts) {
        const decoded = decodeAccount(program, raw.data);
        if (!decoded || decoded.type !== acc.name) continue;
        for (const m of handler(decoded.data, { address: raw.address, slot, programIds: ix.programIds })) {
          await applyMutation(client, m, slot);
        }
      }
    });
    counts[acc.name] = accounts.length;
  }
  return counts;
}

export async function backfillAll(ix: Indexer) {
  const out: Record<string, Record<string, number>> = {};
  for (const p of ix.programs) out[p.name] = await backfillAccounts(ix, p);
  return out;
}
