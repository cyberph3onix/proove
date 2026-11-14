// One keeper tick: snapshot the escrow program, decide what's due by the
// cluster clock, resolve accounts, then simulate and send one transaction per
// action.
import { PublicKey, type AccountInfo, type Connection, type GetProgramAccountsFilter, type Keypair } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";
import {
  decodeClockUnixTimestamp,
  decodeConfig,
  decodeGig,
  decodeMilestone,
  decodeVault,
  DISCRIMINATORS,
  ESCROW_PROGRAM_ID,
  OFFSETS,
  profilePda,
  protocolConfigPda,
  SYSVAR_CLOCK_ID,
  TOKEN_PROGRAM_ID,
  vaultPda,
  type ConfigSnap,
  type GigSnap,
} from "./accounts";
import { actionKey, dueActions, MILESTONE_STATUSES, type MilestoneSnap, type VaultSnap } from "./due";
import { freelancerTokenAccountFor, resolve, type ResolveContext } from "./instructions";
import type { Logger } from "./log";
import { simulateAndSend, type SendOptions, type SendResult, type SendRpc } from "./send";

export type KeeperRpc = SendRpc & Pick<Connection, "getAccountInfo" | "getProgramAccounts" | "getMultipleAccountsInfo">;

export interface TickResult {
  now: bigint;
  milestonesScanned: number;
  vaultsScanned: number;
  results: { key: string; kind: string; result: SendResult }[];
}

const bs58 = utils.bytes.bs58;
const MAX_MULTIPLE = 100;

const discFilter = (d: Buffer): GetProgramAccountsFilter => ({ memcmp: { offset: 0, bytes: bs58.encode(d) } });
const byteFilter = (offset: number, value: number): GetProgramAccountsFilter => ({
  memcmp: { offset, bytes: bs58.encode(Uint8Array.of(value)) },
});

/** Cluster time from the Clock sysvar (never the local clock). */
export async function clusterNow(rpc: KeeperRpc, commitment: SendOptions["commitment"]): Promise<bigint> {
  const info = await rpc.getAccountInfo(SYSVAR_CLOCK_ID, commitment);
  if (!info) throw new Error("clock sysvar not found");
  return decodeClockUnixTimestamp(Buffer.from(info.data));
}

async function getMany(rpc: KeeperRpc, keys: PublicKey[], commitment: SendOptions["commitment"]) {
  const out = new Map<string, AccountInfo<Buffer> | null>();
  const unique = [...new Map(keys.map((k) => [k.toBase58(), k])).values()];
  for (let i = 0; i < unique.length; i += MAX_MULTIPLE) {
    const chunk = unique.slice(i, i + MAX_MULTIPLE);
    const infos = await rpc.getMultipleAccountsInfo(chunk, commitment);
    chunk.forEach((k, j) => out.set(k.toBase58(), infos[j] ?? null));
  }
  return out;
}

/** Releasable milestones only: the status byte filter keeps the scan small. */
async function fetchCandidateMilestones(rpc: KeeperRpc, commitment: SendOptions["commitment"], log: Logger): Promise<MilestoneSnap[]> {
  const statuses = [MILESTONE_STATUSES.indexOf("Submitted"), MILESTONE_STATUSES.indexOf("PartialReleased")];
  const out: MilestoneSnap[] = [];
  for (const status of statuses) {
    const accounts = await rpc.getProgramAccounts(ESCROW_PROGRAM_ID, {
      commitment,
      filters: [discFilter(DISCRIMINATORS.Milestone), byteFilter(OFFSETS.milestoneStatus, status)],
    });
    for (const { pubkey, account } of accounts) {
      try {
        out.push(decodeMilestone(pubkey.toBase58(), Buffer.from(account.data)));
      } catch (e) {
        log.warn("milestone decode failed", { milestone: pubkey.toBase58(), error: String(e) });
      }
    }
  }
  return out;
}

async function fetchUnsyncedVaults(rpc: KeeperRpc, commitment: SendOptions["commitment"], log: Logger): Promise<VaultSnap[]> {
  const accounts = await rpc.getProgramAccounts(ESCROW_PROGRAM_ID, {
    commitment,
    filters: [discFilter(DISCRIMINATORS.EscrowVault), byteFilter(OFFSETS.vaultReputationSynced, 0)],
  });
  const out: VaultSnap[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      out.push(decodeVault(pubkey.toBase58(), Buffer.from(account.data)));
    } catch (e) {
      log.warn("vault decode failed", { vault: pubkey.toBase58(), error: String(e) });
    }
  }
  return out;
}

export async function tick(rpc: KeeperRpc, payer: Keypair, opts: SendOptions, log: Logger): Promise<TickResult> {
  const c = opts.commitment;
  const now = await clusterNow(rpc, c);
  const [milestones, unsynced] = [await fetchCandidateMilestones(rpc, c, log), await fetchUnsyncedVaults(rpc, c, log)];
  const actions = dueActions(milestones, unsynced, now);
  log.info("tick", { now, milestones: milestones.length, unsyncedVaults: unsynced.length, due: actions.length });
  const result: TickResult = { now, milestonesScanned: milestones.length, vaultsScanned: unsynced.length, results: [] };
  if (actions.length === 0) return result;

  // Gather everything the resolver needs in a few batched reads.
  const vaults = new Map<string, VaultSnap>(unsynced.map((v) => [v.gig, v]));
  const missingVaults = [...new Set(actions.map((a) => a.gig))].filter((g) => !vaults.has(g)).map((g) => vaultPda(new PublicKey(g)));
  for (const [address, info] of await getMany(rpc, missingVaults, c)) {
    if (info?.owner.equals(ESCROW_PROGRAM_ID)) {
      try {
        const v = decodeVault(address, info.data);
        vaults.set(v.gig, v);
      } catch {
        /* resolver reports the vault as missing */
      }
    }
  }

  const gigs = new Map<string, GigSnap>();
  for (const [address, info] of await getMany(rpc, actions.map((a) => new PublicKey(a.gig)), c)) {
    if (!info) continue;
    try {
      gigs.set(address, decodeGig(address, info.data));
    } catch (e) {
      log.warn("gig decode failed", { gig: address, error: String(e) });
    }
  }

  const configInfo = await rpc.getAccountInfo(protocolConfigPda(), c);
  let config: ConfigSnap | null = null;
  if (configInfo?.owner.equals(ESCROW_PROGRAM_ID)) config = decodeConfig(Buffer.from(configInfo.data));

  const tokenKeys: PublicKey[] = [];
  const profileKeys: PublicKey[] = [];
  if (config) tokenKeys.push(new PublicKey(config.treasury));
  for (const a of actions) {
    const gig = gigs.get(a.gig);
    const vault = vaults.get(a.gig);
    if (!gig) continue;
    if (a.kind === "settle_reputation") profileKeys.push(profilePda(new PublicKey(gig.freelancer)));
    else if (vault) tokenKeys.push(freelancerTokenAccountFor(gig, vault));
  }
  const tokenAccounts = new Set<string>();
  for (const [k, info] of await getMany(rpc, tokenKeys, c)) if (info?.owner.equals(TOKEN_PROGRAM_ID)) tokenAccounts.add(k);
  const profiles = new Set<string>();
  for (const [k, info] of await getMany(rpc, profileKeys, c)) if (info) profiles.add(k);

  const ctx: ResolveContext = { gigs, vaults, config, tokenAccounts, profiles };
  const sent = new Set<string>();
  for (const action of actions) {
    const key = actionKey(action);
    if (sent.has(key)) continue;
    sent.add(key);
    const alog = log.child({ action: action.kind, gig: action.gig, ...("milestone" in action ? { milestone: action.milestone } : { vault: action.vault }) });
    const plan = resolve(action, ctx);
    if (!plan.ok) {
      alog.warn("skipped", { reason: plan.reason });
      result.results.push({ key, kind: action.kind, result: { status: "skipped", reason: plan.reason, attempts: 0 } });
      continue;
    }
    const r = await simulateAndSend(rpc, payer, plan.instruction, opts, alog);
    const level = r.status === "failed" ? "error" : r.status === "skipped" ? "warn" : "info";
    alog[level](r.status, { ...r });
    result.results.push({ key, kind: action.kind, result: r });
  }
  return result;
}
