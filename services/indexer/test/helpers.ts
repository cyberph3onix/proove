import { BN } from "@coral-xyz/anchor";
import { PROGRAM_IDS } from "@proove/config";
import { Keypair, PublicKey, type GetProgramAccountsFilter } from "@solana/web3.js";
import { buildPrograms, type IndexedProgram, type ProgramDef } from "../src/programs";
import type { ChainSource, RawAccount, SignatureInfo, TxRecord } from "../src/rpc/source";

export const programs = buildPrograms();
export const program = (name: IndexedProgram): ProgramDef => programs.find((p) => p.name === name)!;
export const programIds = PROGRAM_IDS;

export const pk = () => Keypair.generate().publicKey;
export const bn = (n: number | string) => new BN(n);
export { BN, PublicKey };

/** A real Anchor event log line: `Program data: base64(discriminator ++ borsh(data))`. */
export function eventLine(programName: IndexedProgram, name: string, data: Record<string, unknown>): string {
  const p = program(programName);
  const ev = p.idl.events!.find((e) => e.name === name)!;
  const body = p.coder.types.encode(name, data);
  return `Program data: ${Buffer.concat([Buffer.from(ev.discriminator), body]).toString("base64")}`;
}

/** Wrap log lines in an invoke/success frame for `programName` at CPI depth `depth`. */
export function invocation(programName: IndexedProgram, lines: string[], depth = 1): string[] {
  const id = program(programName).programId;
  return [`Program ${id} invoke [${depth}]`, `Program log: Instruction: Test`, ...lines, `Program ${id} consumed 1000 of 200000 compute units`, `Program ${id} success`];
}

let sigCounter = 0;
export function tx(slot: number, logs: string[], extra: Partial<TxRecord> = {}): TxRecord {
  sigCounter++;
  return { signature: `sig${String(sigCounter).padStart(6, "0")}`, slot, blockTime: 1_700_000_000 + slot, failed: false, logs, ...extra };
}

export async function encodeAccount(programName: IndexedProgram, name: string, data: Record<string, unknown>): Promise<Buffer> {
  return program(programName).coder.accounts.encode(name, data);
}

/** In-memory ChainSource for ingest tests. */
export class FakeSource implements ChainSource {
  txs: TxRecord[] = [];
  accounts = new Map<string, RawAccount[]>();
  slot = 1000;
  calls: { program: string; until?: string; before?: string }[] = [];
  private programOf = new Map<string, string[]>();

  addTx(t: TxRecord, programId: string) {
    this.txs.push(t);
    this.programOf.set(t.signature, [...(this.programOf.get(t.signature) ?? []), programId]);
  }

  async getSignatures(prog: string, opts: { before?: string; until?: string; limit: number }): Promise<SignatureInfo[]> {
    this.calls.push({ program: prog, until: opts.until, before: opts.before });
    const all = this.txs
      .filter((t) => this.programOf.get(t.signature)?.includes(prog))
      .sort((a, b) => b.slot - a.slot || b.signature.localeCompare(a.signature));
    let start = 0;
    if (opts.before) start = all.findIndex((t) => t.signature === opts.before) + 1;
    let end = all.length;
    if (opts.until) {
      const u = all.findIndex((t) => t.signature === opts.until);
      if (u >= 0) end = u;
    }
    return all.slice(start, Math.min(end, start + opts.limit)).map((t) => ({ signature: t.signature, slot: t.slot, failed: t.failed }));
  }

  async getTransaction(signature: string) {
    return this.txs.find((t) => t.signature === signature) ?? null;
  }

  async getProgramAccounts(prog: string, filters: GetProgramAccountsFilter[]) {
    const p = programs.find((x) => x.programId === prog)!;
    const f = filters[0];
    const want = f && "memcmp" in f ? f.memcmp.bytes : undefined;
    const accounts = (this.accounts.get(prog) ?? []).filter((a) => {
      const acc = p.idl.accounts!.find((x) => p.coder.accounts.memcmp(x.name).bytes === want);
      return acc ? Buffer.from(acc.discriminator).equals(a.data.subarray(0, 8)) : false;
    });
    return { slot: this.slot, accounts };
  }
}

