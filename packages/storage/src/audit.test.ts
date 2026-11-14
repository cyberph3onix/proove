import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { getBase58Decoder } from "@solana/kit";
import { toBase64, utf8 } from "./bytes";
import {
  AuditSeedExpiredError,
  AuditSeedNotYetAvailableError,
  auditItemIds,
  computeAuditSample,
  fetchAuditSeed,
  parseSlotHashes,
  selectAuditSeed,
  type SlotHashEntry,
} from "./audit";

const seed = (s: string | number) => sha256(utf8(`seed:${s}`));

describe("computeAuditSample", () => {
  it("is deterministic and accepts raw or base58 seeds", () => {
    const s = seed(1);
    const a = computeAuditSample(s, 500, 50);
    expect(a).toEqual(computeAuditSample(s.slice(), 500, 50));
    expect(a).toEqual(computeAuditSample(getBase58Decoder().decode(s), 500, 50));
    expect(a).toHaveLength(50);
    expect(new Set(a).size).toBe(50);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(a.every((i) => Number.isInteger(i) && i >= 0 && i < 500)).toBe(true);
  });

  it("is pinned for a known seed (anyone re-implementing must match)", () => {
    const zero = new Uint8Array(32);
    expect(computeAuditSample(zero, 100, 10)).toMatchInlineSnapshot(`
      [
        3,
        7,
        12,
        13,
        16,
        30,
        79,
        88,
        92,
        97,
      ]
    `);
    expect(computeAuditSample(seed("pin"), 500, 5)).toMatchInlineSnapshot(`
      [
        56,
        98,
        373,
        374,
        465,
      ]
    `);
  });

  it("different seeds and domains give different samples", () => {
    expect(computeAuditSample(seed(1), 500, 50)).not.toEqual(computeAuditSample(seed(2), 500, 50));
    expect(computeAuditSample(seed(1), 500, 50, { domain: "c2" })).not.toEqual(computeAuditSample(seed(1), 500, 50, { domain: "c3" }));
    expect(computeAuditSample(seed(1), 500, 50, { domain: "" })).toEqual(computeAuditSample(seed(1), 500, 50));
  });

  it("a smaller sample from the same seed is a prefix of the draw order", () => {
    // Same stream, so the first k draws coincide; sorted output of k=10 ⊂ k=20.
    const small = computeAuditSample(seed(3), 1000, 10);
    const big = new Set(computeAuditSample(seed(3), 1000, 20));
    expect(small.every((i) => big.has(i))).toBe(true);
  });

  it("handles edge cases", () => {
    expect(computeAuditSample(seed(1), 0, 50)).toEqual([]);
    expect(computeAuditSample(seed(1), 10, 0)).toEqual([]);
    expect(computeAuditSample(seed(1), 1, 5)).toEqual([0]);
    expect(computeAuditSample(seed(1), 7, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(computeAuditSample(seed(1), 7, 100)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(computeAuditSample(seed(1), { files: ["a", "b", "c"] }, 2)).toHaveLength(2);
    expect(computeAuditSample(seed(1), { files: [] }, 2)).toEqual([]);
    // Huge populations do not allocate the whole index range.
    const huge = computeAuditSample(seed(1), 4_000_000_000, 5);
    expect(huge).toHaveLength(5);
    expect(huge.every((i) => i < 4_000_000_000)).toBe(true);
  });

  it("rejects bad inputs", () => {
    expect(() => computeAuditSample(new Uint8Array(31), 10, 1)).toThrow(/32 bytes/);
    expect(() => computeAuditSample(seed(1), -1, 1)).toThrow(RangeError);
    expect(() => computeAuditSample(seed(1), 1.5, 1)).toThrow(RangeError);
    expect(() => computeAuditSample(seed(1), 2 ** 32, 1)).toThrow(RangeError);
    expect(() => computeAuditSample(seed(1), 10, -1)).toThrow(RangeError);
  });

  it("selects every index with equal probability (chi-squared)", () => {
    const n = 12;
    const k = 4;
    const trials = 12_000;
    const counts = new Array(n).fill(0);
    for (let t = 0; t < trials; t++) for (const i of computeAuditSample(seed(t), n, k)) counts[i]++;
    const expected = (trials * k) / n;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // df = 11; p = 0.001 critical value is 31.26.
    expect(chi2).toBeLessThan(31.26);
  });

  it("is uniform over subsets, not just marginals (n=5, k=2: 10 subsets)", () => {
    const counts = new Map<string, number>();
    const trials = 20_000;
    for (let t = 0; t < trials; t++) {
      const key = computeAuditSample(seed(`p${t}`), 5, 2).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(10);
    const expected = trials / 10;
    const chi2 = [...counts.values()].reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // df = 9; p = 0.001 critical value is 27.88.
    expect(chi2).toBeLessThan(27.88);
  });

  it("formats item ids like the verifier report", () => {
    expect(auditItemIds([3, 42])).toEqual(["item-0003", "item-0042"]);
  });
});

function encodeSlotHashes(entries: SlotHashEntry[]): Uint8Array {
  const out = new Uint8Array(8 + entries.length * 40);
  const v = new DataView(out.buffer);
  v.setBigUint64(0, BigInt(entries.length), true);
  entries.forEach((e, i) => {
    v.setBigUint64(8 + i * 40, e.slot, true);
    out.set(e.hash, 16 + i * 40);
  });
  return out;
}

/** Newest first, as the sysvar stores them; `skip` lists slots without a bank. */
function window(from: number, to: number, skip: number[] = []): SlotHashEntry[] {
  const out: SlotHashEntry[] = [];
  for (let s = to; s >= from; s--) if (!skip.includes(s)) out.push({ slot: BigInt(s), hash: seed(`slot${s}`) });
  return out;
}

describe("SlotHashes", () => {
  it("parses the sysvar layout", () => {
    const entries = window(100, 110);
    const parsed = parseSlotHashes(encodeSlotHashes(entries));
    expect(parsed).toHaveLength(11);
    expect(parsed[0].slot).toBe(110n);
    expect(parsed[10].hash).toEqual(seed("slot100"));
    expect(() => parseSlotHashes(new Uint8Array(4))).toThrow(/too short/);
    expect(() => parseSlotHashes(encodeSlotHashes(entries).slice(0, 50))).toThrow(/truncated/);
  });

  it("uses submitted_slot + 2", () => {
    const s = selectAuditSeed(window(100, 200), 150);
    expect(s.targetSlot).toBe(152n);
    expect(s.seedSlot).toBe(152n);
    expect(s.slotHash).toEqual(seed("slot152"));
    expect(s.slotHashBase58).toBe(getBase58Decoder().decode(seed("slot152")));
    expect(s.slotHashHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("falls forward to the first produced slot when the target was skipped", () => {
    const s = selectAuditSeed(window(100, 200, [152, 153]), 150);
    expect(s.targetSlot).toBe(152n);
    expect(s.seedSlot).toBe(154n);
  });

  it("errors while the target slot is not in the sysvar yet", () => {
    expect(() => selectAuditSeed(window(100, 151), 150)).toThrow(AuditSeedNotYetAvailableError);
    // Target skipped and nothing after it yet: still not available.
    expect(() => selectAuditSeed(window(100, 151, []), 150)).toThrow(/retry/);
    expect(() => selectAuditSeed([], 150)).toThrow(AuditSeedNotYetAvailableError);
  });

  it("errors once the target has left the window", () => {
    expect(() => selectAuditSeed(window(160, 600), 150)).toThrow(AuditSeedExpiredError);
    // Oldest entry is after the target: we cannot prove the slots between were skipped.
    expect(() => selectAuditSeed(window(153, 600), 150)).toThrow(AuditSeedExpiredError);
  });

  it("fetchAuditSeed reads the sysvar at finalized commitment", async () => {
    let seen: { addr: string; cfg: unknown } | undefined;
    const rpc = {
      getAccountInfo: (addr: string, cfg: unknown) => {
        seen = { addr, cfg };
        return { send: async () => ({ value: { data: [toBase64(encodeSlotHashes(window(100, 200, [152]))), "base64"] } }) };
      },
    };
    const s = await fetchAuditSeed(rpc as never, 150);
    expect(seen!.addr).toBe("SysvarS1otHashes111111111111111111111111111");
    expect(seen!.cfg).toEqual({ encoding: "base64", commitment: "finalized" });
    expect(s.seedSlot).toBe(153n);
    const sample = computeAuditSample(s.slotHashBase58, 500, 50);
    expect(sample).toEqual(computeAuditSample(seed("slot153"), 500, 50));

    const missing = { getAccountInfo: () => ({ send: async () => ({ value: null }) }) };
    await expect(fetchAuditSeed(missing as never, 150)).rejects.toThrow(/not found/);
  });
});
