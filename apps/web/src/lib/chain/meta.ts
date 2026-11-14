/**
 * Off-chain gig metadata (skills + original brief). The programs store title,
 * description, category and budget; skills and the raw brief stay local in
 * Phase 1, keyed by gig address.
 */
export interface StoredGigMeta {
  skills?: string[];
  brief?: string;
}

const KEY = "proove:gig-meta";

function readAll(): Record<string, StoredGigMeta> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, StoredGigMeta>;
  } catch {
    return {};
  }
}

export function saveGigMeta(address: string, meta: StoredGigMeta) {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[address] = { ...all[address], ...meta };
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function readGigMeta(address: string): StoredGigMeta | undefined {
  return readAll()[address];
}
