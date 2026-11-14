/**
 * Random sample audit (PRD Feature 1, "Random sample audits").
 *
 * Seed: the SlotHashes sysvar entry for `submitted_slot + 2` (rule for skipped
 * slots below). Sample: a partial Fisher-Yates shuffle driven by a SHA-256
 * counter stream with rejection sampling, so every k-subset is equally likely
 * and anyone holding the seed gets the same indices.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { address, type Commitment, type GetAccountInfoApi, getBase58Decoder, getBase58Encoder, type Rpc } from "@solana/kit";
import { concatBytes, fromBase64, utf8 } from "./bytes";

export const AUDIT_SCHEME = "proove.sample-audit.v1" as const;
/** Slots after `submitted_slot` whose hash seeds the audit. */
export const AUDIT_SLOT_OFFSET = 2;
export const SYSVAR_SLOT_HASHES = address("SysvarS1otHashes111111111111111111111111111");

function seedBytes(slotHash: Uint8Array | string): Uint8Array {
  const b = typeof slotHash === "string" ? new Uint8Array(getBase58Encoder().encode(slotHash)) : slotHash;
  if (b.length !== 32) throw new Error(`slot hash must be 32 bytes, got ${b.length}`);
  return b;
}

/** Deterministic uniform integers from SHA-256(scheme ‖ 0 ‖ domain ‖ 0 ‖ seed ‖ counter_be32). */
function uniformStream(seed: Uint8Array, domain: string) {
  const prefix = concatBytes(utf8(AUDIT_SCHEME), new Uint8Array([0]), utf8(domain), new Uint8Array([0]), seed);
  let counter = 0;
  let block = new Uint8Array(0);
  let pos = 0;
  const nextU32 = (): number => {
    if (pos >= block.length) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, counter++, false);
      block = sha256(concatBytes(prefix, c));
      pos = 0;
    }
    const v = new DataView(block.buffer, block.byteOffset + pos, 4).getUint32(0, false);
    pos += 4;
    return v;
  };
  /** Uniform in [0, m) by rejection: draws ≥ the largest multiple of m are discarded (no modulo bias). */
  return (m: number): number => {
    if (m <= 1) return 0;
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % m);
    for (;;) {
      const x = nextU32();
      if (x < limit) return x % m;
    }
  };
}

/**
 * Indices (ascending) of the items to audit.
 *
 * @param slotHash    32-byte SlotHashes entry, raw or base58 (as RPC returns it).
 * @param population  number of items, or a manifest (its `files.length` is used).
 * @param sampleSize  items wanted; capped at the population.
 * @param opts.domain optional label (e.g. a criterion id) giving independent
 *                    samples from the same seed. Empty by default.
 */
export function computeAuditSample(
  slotHash: Uint8Array | string,
  population: number | { files: readonly unknown[] },
  sampleSize: number,
  opts: { domain?: string } = {},
): number[] {
  const n = typeof population === "number" ? population : population.files.length;
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) throw new RangeError(`population must be an integer in [0, 2^32), got ${n}`);
  if (!Number.isInteger(sampleSize) || sampleSize < 0) throw new RangeError(`sampleSize must be a non-negative integer, got ${sampleSize}`);
  const seed = seedBytes(slotHash);
  const k = Math.min(sampleSize, n);
  const uniform = uniformStream(seed, opts.domain ?? "");
  // Partial Fisher-Yates over a virtual array [0, n): only swapped slots are stored.
  const swapped = new Map<number, number>();
  const at = (i: number) => swapped.get(i) ?? i;
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    const j = i + uniform(n - i);
    const vi = at(i);
    const vj = at(j);
    swapped.set(j, vi);
    swapped.set(i, vj);
    out.push(vj);
  }
  return out.sort((a, b) => a - b);
}

/** Item ids in the shape the verifier reports them (`item-0042`). */
export function auditItemIds(indices: number[], width = 4): string[] {
  return indices.map((i) => `item-${String(i).padStart(width, "0")}`);
}

// ─── SlotHashes sysvar ───────────────────────────────────────────────────────

export interface SlotHashEntry {
  slot: bigint;
  hash: Uint8Array;
}

/** Parse SlotHashes account data: u64 LE count, then (u64 LE slot, [u8; 32] hash), newest first. */
export function parseSlotHashes(data: Uint8Array): SlotHashEntry[] {
  if (data.length < 8) throw new Error("SlotHashes data too short");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = Number(view.getBigUint64(0, true));
  if (8 + count * 40 > data.length) throw new Error(`SlotHashes data truncated (${count} entries declared)`);
  const out: SlotHashEntry[] = [];
  for (let i = 0; i < count; i++) {
    const o = 8 + i * 40;
    out.push({ slot: view.getBigUint64(o, true), hash: data.slice(o + 8, o + 40) });
  }
  return out;
}

export class AuditSeedNotYetAvailableError extends Error {
  constructor(readonly targetSlot: bigint, readonly newestSlot: bigint | null) {
    super(`audit seed slot ${targetSlot} is not in SlotHashes yet (newest ${newestSlot ?? "none"}); retry shortly`);
    this.name = "AuditSeedNotYetAvailableError";
  }
}

export class AuditSeedExpiredError extends Error {
  constructor(readonly targetSlot: bigint, readonly oldestSlot: bigint) {
    super(`audit seed slot ${targetSlot} has left the SlotHashes window (oldest ${oldestSlot}); use the seed recorded at audit time`);
    this.name = "AuditSeedExpiredError";
  }
}

export interface AuditSeed {
  /** submitted_slot + 2. */
  targetSlot: bigint;
  /** The slot whose hash was used: the first non-skipped slot ≥ targetSlot. */
  seedSlot: bigint;
  slotHash: Uint8Array;
  /** base58, as RPC and explorers show it. */
  slotHashBase58: string;
  /** lowercase hex, as `SampleAudit.seed` stores hashes. */
  slotHashHex: string;
}

/**
 * Skipped-slot rule: use the entry with the smallest slot ≥ target. SlotHashes
 * only lists slots that produced a bank, so if `target` was skipped this is
 * the next produced slot. It is only well-defined while the window still
 * reaches back to `target` (oldest ≤ target), otherwise the slots between
 * may have been dropped and we refuse rather than guess.
 */
export function selectAuditSeed(entries: SlotHashEntry[], submittedSlot: bigint | number): AuditSeed {
  const targetSlot = BigInt(submittedSlot) + BigInt(AUDIT_SLOT_OFFSET);
  if (entries.length === 0) throw new AuditSeedNotYetAvailableError(targetSlot, null);
  let newest = entries[0].slot;
  let oldest = entries[0].slot;
  let best: SlotHashEntry | undefined;
  for (const e of entries) {
    if (e.slot > newest) newest = e.slot;
    if (e.slot < oldest) oldest = e.slot;
    if (e.slot >= targetSlot && (!best || e.slot < best.slot)) best = e;
  }
  if (!best) throw new AuditSeedNotYetAvailableError(targetSlot, newest);
  if (oldest > targetSlot) throw new AuditSeedExpiredError(targetSlot, oldest);
  return {
    targetSlot,
    seedSlot: best.slot,
    slotHash: best.hash,
    slotHashBase58: getBase58Decoder().decode(best.hash),
    slotHashHex: bytesToHex(best.hash),
  };
}

/**
 * Read the audit seed for a milestone from the SlotHashes sysvar over RPC.
 * Uses `finalized` by default so a fork cannot change the seed. SlotHashes
 * holds the last 512 slots (~3.5 min), so the verifier must read it soon
 * after submission and record it in the report (`SampleAudit.seed`).
 */
export async function fetchAuditSeed(
  rpc: Rpc<GetAccountInfoApi>,
  submittedSlot: bigint | number,
  opts: { commitment?: Commitment } = {},
): Promise<AuditSeed> {
  const res = await rpc.getAccountInfo(SYSVAR_SLOT_HASHES, { encoding: "base64", commitment: opts.commitment ?? "finalized" }).send();
  if (!res.value) throw new Error("SlotHashes sysvar not found on this cluster");
  return selectAuditSeed(parseSlotHashes(fromBase64(res.value.data[0])), submittedSlot);
}
