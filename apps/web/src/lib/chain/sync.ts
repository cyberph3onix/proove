/**
 * Chain-mode read path: mirror the indexer + RPC into the same `ChainState`
 * shape the mock store uses, so pages and `use-chain` selectors stay unchanged.
 *
 * The indexer does not store specs, reports or display names. Those fall back
 * to neutral placeholders here; they are filled in by the AI/storage layer.
 */
import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type {
  Address,
  Badge,
  ChainEvent,
  Gig,
  Milestone,
  Persona,
  PersonaProfile,
  ProtocolConfig,
  Rating,
  UserProfile,
} from "@proove/types/types";
import { ZERO_HASH } from "@proove/types/types";
import { emptyState } from "@/lib/mock/seed";
import type { ChainState } from "@/lib/mock/state";
import { INDEXER_URL, USDC_MINT } from "./mode";
import { readPending } from "./pending";
import { readSpec } from "./specs";
import { readGigMeta } from "./meta";
import { deriveMilestone } from "@/lib/anchor/pdas";

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

/** Wallets a page wants even if they are not on a gig (e.g. /reputation/[wallet]). */
const watched = new Set<string>();

export function watchWallet(wallet: string) {
  watched.add(wallet);
}

// Indexer responses are untrusted JSON; each field is normalised below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function get(path: string): Promise<Json | null> {
  const res = await fetch(`${INDEXER_URL}${path}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Indexer ${path} failed: ${res.status}`);
  return (await res.json()) as Json;
}

function value<T>(s: { value?: T | null } | undefined | null): T | null {
  return s?.value ?? null;
}

function num(s: { value?: number | null } | undefined | null, fallback = 0): number {
  const v = value(s);
  return typeof v === "number" ? v : fallback;
}

function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function hue(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) % 360;
  return h;
}

function isSet(address: string | null | undefined): address is string {
  return !!address && address !== DEFAULT_PUBKEY && !/^0+$/.test(address);
}

async function fetchGigs(): Promise<Json[]> {
  const out: Json[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const res = await get(`/v1/gigs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!res) break;
    out.push(...((res.items as Json[]) ?? []));
    cursor = (res.nextCursor as string | null) ?? null;
    if (!cursor) break;
  }
  return out;
}

async function fetchReputation(wallet: string): Promise<Json | null> {
  return get(`/v1/reputation/${wallet}`);
}

async function fetchBalance(connection: Connection, wallet: string): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(wallet));
    const { value: balance } = await connection.getTokenAccountBalance(ata);
    return Number(balance.amount);
  } catch {
    return 0;
  }
}

function toGig(g: Json): Gig {
  const meta = readGigMeta(g.address);
  return {
    address: g.address,
    id: g.id ?? 0,
    client: g.client ?? DEFAULT_PUBKEY,
    freelancer: isSet(g.freelancer) ? g.freelancer : null,
    mint: g.mint ?? USDC_MINT,
    status: g.status ?? "published",
    createdAt: g.createdAt ?? 0,
    updatedAt: g.updatedAt ?? g.createdAt ?? 0,
    title: g.title || "Untitled gig",
    description: g.description ?? "",
    skills: g.skills?.length ? g.skills : (meta?.skills ?? []),
    category: g.category ?? "",
    budget: g.budget ?? 0,
    deadline: g.deadline ?? 0,
    applicants: g.applicants ?? [],
    ...(g.brief || meta?.brief ? { brief: g.brief ?? meta?.brief } : {}),
  };
}

function toMilestone(m: Json): Milestone {
  const stored = readSpec(m.specHash);
  return {
    address: m.address,
    gig: m.gig ?? DEFAULT_PUBKEY,
    index: m.index ?? 0,
    title: m.title || stored?.title || `Milestone ${(m.index ?? 0) + 1}`,
    amount: m.amount ?? 0,
    released: m.released ?? 0,
    feesPaid: m.feesPaid ?? 0,
    refunded: m.refunded ?? 0,
    status: m.status ?? "pendingFunding",
    specHash: m.specHash ?? ZERO_HASH,
    deliveryHash: m.deliveryHash ?? ZERO_HASH,
    reportHash: m.reportHash ?? ZERO_HASH,
    termsAccepted: Boolean(m.termsAccepted),
    createdAt: m.createdAt ?? 0,
    fundedAt: m.fundedAt ?? null,
    submittedAt: m.submittedAt ?? null,
    submittedSlot: m.submittedSlot ?? null,
    approvedAt: m.approvedAt ?? null,
    terms: m.terms ?? null,
    ...(stored?.spec ? { spec: stored.spec } : {}),
  };
}

function toProfile(wallet: string, r: Json): UserProfile {
  const p = r.profile ?? {};
  return {
    authority: value<string>(p.authority) ?? wallet,
    completedJobs: num(p.completedJobs),
    successfulJobs: num(p.successfulJobs),
    cancelledJobs: num(p.cancelledJobs),
    onTimeJobs: num(p.onTimeJobs),
    totalEarnings: num(p.totalEarnings),
    ratingSum: num(p.ratingSum),
    ratingCount: num(p.ratingCount),
    averageRating: num(p.averageRating),
    reputationScore: num(p.reputationScore),
    badgesEarned: num(p.badgesEarned),
    disputesWon: num(p.disputesWon),
    disputesLost: num(p.disputesLost),
    createdAt: num(p.createdAt),
    updatedAt: num(p.updatedAt),
    slot: r.slot ?? 0,
  };
}

function toBadge(wallet: string, b: Json): Badge {
  const assetId = value<string>(b.assetId);
  return {
    type: value<string>(b.type) as Badge["type"] ?? "FirstGig",
    profile: wallet,
    issuedAt: num(b.issuedAt),
    minted: value(b.minted) === true,
    ...(assetId ? { assetId } : {}),
    version: "v2",
  };
}

function toRating(wallet: string, r: Json): Rating {
  const gig = value<string>(r.gig) ?? DEFAULT_PUBKEY;
  const jobId = num(r.jobId);
  return {
    address: `${gig}:${jobId}`,
    jobId,
    gig,
    client: value<string>(r.client) ?? DEFAULT_PUBKEY,
    freelancer: wallet,
    score: num(r.score),
    reviewHash: value<string>(r.reviewHash) ?? ZERO_HASH,
    submittedAt: num(r.submittedAt),
  };
}

function toEvent(e: Json): ChainEvent {
  return {
    signature: e.signature,
    slot: e.slot,
    blockTime: e.blockTime,
    program: e.program,
    name: e.name,
    actors: e.actors ?? [],
    ...(e.gig ? { gig: e.gig } : {}),
    ...(e.milestone ? { milestone: e.milestone } : {}),
    ...(e.case ? { case: e.case } : {}),
    ...(e.amount != null ? { amount: e.amount } : {}),
    receipt: e.receipt ?? "",
  };
}

export interface SyncResult {
  state: ChainState;
  viewer: Address | null;
}

/**
 * Pull everything the Phase 1 routes read. Safe to call repeatedly: the caller
 * replaces the store state wholesale, so no stale gig survives a sync.
 */
export async function syncChain(connection: Connection, viewer: Address | null): Promise<SyncResult> {
  const now = Math.floor(Date.now() / 1000);
  const state = emptyState(now);
  state.persona = viewer;

  const [gigsRaw, protocolRaw, activityRaw] = await Promise.all([
    fetchGigs(),
    get("/v1/protocol").catch(() => null),
    get("/v1/activity?limit=100").catch(() => null),
  ]);

  const gigs = gigsRaw.map(toGig);
  const milestonesByGig = await Promise.all(
    gigs.map(async (g) => {
      const res = await get(`/v1/gigs/${g.address}/milestones`).catch(() => null);
      return ((res?.items as Json[]) ?? []).map(toMilestone);
    }),
  );
  const milestones = milestonesByGig.flat();

  // Specs queued until assignment are not on-chain yet, but should still show.
  const pending = readPending();
  for (const g of gigs) {
    for (const p of pending[g.address] ?? []) {
      const address = deriveMilestone(new PublicKey(g.address), p.index).toBase58();
      if (milestones.some((m) => m.address === address)) continue;
      milestones.push({
        address,
        gig: g.address,
        index: p.index,
        title: p.title || readSpec(p.specHash)?.title || `Milestone ${p.index + 1}`,
        amount: Number(p.amount),
        released: 0,
        feesPaid: 0,
        refunded: 0,
        status: "pendingFunding",
        specHash: p.specHash,
        deliveryHash: ZERO_HASH,
        reportHash: ZERO_HASH,
        termsAccepted: false,
        createdAt: now,
        fundedAt: null,
        submittedAt: null,
        submittedSlot: null,
        approvedAt: null,
        terms: null,
        ...(readSpec(p.specHash)?.spec ? { spec: readSpec(p.specHash)!.spec } : {}),
      });
    }
  }

  const participants = new Set<string>();
  for (const g of gigs) {
    if (isSet(g.client)) participants.add(g.client);
    if (isSet(g.freelancer)) participants.add(g.freelancer);
  }
  if (viewer) participants.add(viewer);
  for (const w of watched) participants.add(w);

  const [reputations, balances] = await Promise.all([
    Promise.all([...participants].map(async (w) => [w, await fetchReputation(w).catch(() => null)] as const)),
    Promise.all([...participants].slice(0, 50).map(async (w) => [w, await fetchBalance(connection, w)] as const)),
  ]);

  const clientWallets = new Set(gigs.map((g) => g.client));
  const profiles: Record<string, UserProfile> = {};
  const ratings: Rating[] = [];
  const badges: Badge[] = [];
  const people: Record<string, PersonaProfile> = {};
  const personas: Persona[] = [];

  for (const [wallet, rep] of reputations) {
    if (rep) {
      profiles[wallet] = toProfile(wallet, rep);
      for (const b of (rep.badges as Json[]) ?? []) badges.push(toBadge(wallet, b));
      for (const r of (rep.ratings as Json[]) ?? []) ratings.push(toRating(wallet, r));
    }
    const defaultRole = clientWallets.has(wallet) ? "client" : "freelancer";
    people[wallet] = {
      address: wallet,
      name: short(wallet),
      headline: "On-chain wallet",
      skills: [],
      categories: [],
      hue: hue(wallet),
    };
    personas.push({ address: wallet, name: short(wallet), description: "On-chain wallet", defaultRole });
  }

  state.gigs = Object.fromEntries(gigs.map((g) => [g.address, g]));
  state.milestones = Object.fromEntries(milestones.map((m) => [m.address, m]));
  state.profiles = profiles;
  state.ratings = ratings;
  state.badges = badges;
  state.people = people;
  state.personas = personas;
  state.balances = Object.fromEntries(balances);
  state.events = ((activityRaw?.items as Json[]) ?? []).map(toEvent);
  state.counter = gigs.length;

  if (protocolRaw) {
    const c = protocolRaw.config ?? {};
    const defaults: ProtocolConfig = state.protocol;
    state.protocol = {
      partialTimeout: num(c.partialTimeout, defaults.partialTimeout),
      fullTimeout: num(c.fullTimeout, defaults.fullTimeout),
      partialBps: num(c.partialBps, defaults.partialBps),
      feeBps: num(c.feeBps, defaults.feeBps),
      minMilestone: num(c.minMilestone, defaults.minMilestone),
      noDeliveryGrace: num(c.noDeliveryGrace, defaults.noDeliveryGrace),
    };
    state.treasury = {
      balance: num(protocolRaw.treasury?.totalFees, state.treasury.balance),
      feePool: 0,
    };
  }

  return { state, viewer };
}
