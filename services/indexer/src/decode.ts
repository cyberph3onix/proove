import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { ProgramDef } from "./programs";

/** JSON-safe value produced from Anchor-decoded data. */
export type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };
export type PlainRecord = Record<string, Plain>;

export interface DecodedEvent {
  program: ProgramDef["name"];
  name: string;
  /** Position among all events in the transaction, in log order. */
  index: number;
  data: PlainRecord;
}

export interface DecodedAccount {
  program: ProgramDef["name"];
  /** IDL account name, e.g. "Gig", "UserProfile". */
  type: string;
  data: PlainRecord;
}

/**
 * Turn Anchor/borsh output into plain JSON: pubkeys become base58, integers
 * become numbers (or decimal strings beyond 2^53), unit enum variants become
 * their variant name (`{ Published: {} }` -> "Published"), byte arrays stay
 * number arrays (handlers hex-encode hashes).
 */
export function toPlain(value: unknown): Plain {
  if (value === null || value === undefined) return null;
  if (value instanceof PublicKey) return value.toBase58();
  if (BN.isBN(value)) {
    const bn = value as BN;
    return bn.abs().lte(new BN(Number.MAX_SAFE_INTEGER)) ? bn.toNumber() : bn.toString(10);
  }
  if (typeof value === "bigint") return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1) {
      const [variant, inner] = entries[0]!;
      if (/^[A-Z]/.test(variant) && inner && typeof inner === "object" && !Array.isArray(inner) && Object.keys(inner).length === 0) {
        return variant;
      }
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, toPlain(v)]));
  }
  return String(value);
}

const INVOKE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT = /^Program (\w+) (success|failed)/;
const DATA = "Program data: ";

/**
 * Walk a transaction's log messages, tracking the CPI stack, and decode every
 * `Program data:` line emitted by one of our programs with that program's IDL
 * coder. Lines from unknown programs, or that are not one of the IDL's events,
 * are skipped. `index` counts decoded events across the whole transaction so
 * (signature, index) is a stable idempotency key whichever program's
 * signature list the transaction was found through.
 */
export function decodeEventsFromLogs(logs: readonly string[], programs: Map<string, ProgramDef>): DecodedEvent[] {
  const stack: string[] = [];
  const out: DecodedEvent[] = [];
  for (const line of logs) {
    const invoke = INVOKE.exec(line);
    if (invoke) {
      stack.push(invoke[1]!);
      continue;
    }
    if (EXIT.test(line)) {
      stack.pop();
      continue;
    }
    if (!line.startsWith(DATA)) continue;
    const program = programs.get(stack[stack.length - 1] ?? "");
    if (!program) continue;
    let decoded: { name: string; data: unknown } | null = null;
    try {
      decoded = program.coder.events.decode(line.slice(DATA.length));
    } catch {
      decoded = null;
    }
    if (!decoded) continue;
    out.push({ program: program.name, name: decoded.name, index: out.length, data: toPlain(decoded.data) as PlainRecord });
  }
  return out;
}

/** Decode raw account data by matching its 8-byte discriminator against the program's IDL accounts. */
export function decodeAccount(program: ProgramDef, data: Buffer): DecodedAccount | null {
  const disc = data.subarray(0, 8);
  for (const acc of program.idl.accounts ?? []) {
    if (!Buffer.from(acc.discriminator).equals(disc)) continue;
    try {
      return { program: program.name, type: acc.name, data: toPlain(program.coder.accounts.decode(acc.name, data)) as PlainRecord };
    } catch {
      return null;
    }
  }
  return null;
}
