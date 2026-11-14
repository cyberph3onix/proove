import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Hash } from "./types";

/**
 * RFC 8785 (JSON Canonicalization Scheme) for the subset of JSON Proove
 * documents use: objects with sorted keys, arrays, strings, finite numbers,
 * booleans and null. Every committed document (spec, report, brief,
 * evaluation, verdict reason) is hashed over this canonical form so anyone
 * can recompute the on-chain hash from the stored JSON.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonicalize: non-finite number");
    // ES number serialization matches RFC 8785 for finite values.
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      // RFC 8785 sorts by UTF-16 code units, which is JS's default string order.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`canonicalize: unsupported type ${typeof value}`);
}

export function sha256Hex(data: string | Uint8Array): Hash {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return bytesToHex(sha256(bytes));
}

/** SHA-256 over the RFC 8785 canonical form: the value committed on-chain. */
export function hashDocument(doc: unknown): Hash {
  return sha256Hex(canonicalize(doc));
}

/**
 * Cheap non-cryptographic digest, used only to derive stable mock IDs and
 * pseudo slot hashes. Documents are always hashed with hashDocument().
 */
export function mockHash(input: string): Hash {
  let out = "";
  let h1 = 0x811c9dc5;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < input.length; i++) {
      h1 ^= input.charCodeAt(i) + round;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    out += h1.toString(16).padStart(8, "0");
  }
  return out;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Deterministic base58 pseudo-address for mock accounts. */
export function mockAddress(seed: string, length = 44): string {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (Math.imul(state, 31) + seed.charCodeAt(i)) >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9 + i) >>> 0;
    out += B58[state % 58];
  }
  return out;
}

/** Deterministic PRNG (mulberry32) used for sample-audit selection. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Select `k` of `n` item indices from a slot-hash seed, the way the
 * sample audit does: anyone holding the seed gets the same items.
 */
export function sampleIndices(seed: Hash, n: number, k: number): number[] {
  const rand = prng(parseInt(seed.slice(0, 8), 16));
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(k, n)).sort((a, b) => a - b);
}
