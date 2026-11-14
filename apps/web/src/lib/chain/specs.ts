/**
 * Off-chain milestone metadata (title + full spec), keyed by spec hash.
 *
 * The programs only store `spec_hash`; the indexer does not keep the document.
 * Phase 1 keeps it in local storage so the UI can show the committed title and
 * the Delivery Verifier can check against the same criteria after a reload.
 */
import type { MilestoneSpec } from "@proove/types/types";

export interface StoredSpec {
  title: string;
  spec?: MilestoneSpec;
}

const KEY = "proove:milestone-specs";

function readAll(): Record<string, StoredSpec> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, StoredSpec>;
  } catch {
    return {};
  }
}

export function saveSpec(hash: string, value: StoredSpec) {
  if (typeof window === "undefined" || !hash) return;
  const all = readAll();
  all[hash] = value;
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function readSpec(hash: string | null | undefined): StoredSpec | undefined {
  if (!hash) return undefined;
  return readAll()[hash];
}
