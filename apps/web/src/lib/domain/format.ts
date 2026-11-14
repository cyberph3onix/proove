import type { Address, Bps, Hash } from "./types";
import { ZERO_HASH } from "./types";

export const USDC_DECIMALS = 6;
export const USDC = 10 ** USDC_DECIMALS;

export const HOUR = 3_600;
export const DAY = 86_400;

/** 120_000_000 → "120.00 USDC" (or "120.00" with unit=false). */
export function formatUsdc(base: number, opts: { unit?: boolean; compact?: boolean } = {}): string {
  const { unit = true, compact = false } = opts;
  const value = base / USDC;
  const str = compact && Math.abs(value) >= 10_000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return unit ? `${str} USDC` : str;
}

export function usdcToBase(input: string | number): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * USDC);
}

export function shortAddress(address: Address | null | undefined, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function shortHash(hash: Hash | undefined, chars = 6): string {
  if (!hash || hash === ZERO_HASH) return "none";
  return `${hash.slice(0, chars)}…${hash.slice(-4)}`;
}

export function isZeroHash(hash: Hash | undefined): boolean {
  return !hash || hash === ZERO_HASH;
}

export function formatBps(bps: Bps): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Ruling → "Freelancer 75% · Client 25%". */
export function formatRuling(bps: Bps): string {
  return `Freelancer ${formatBps(bps)} · Client ${formatBps(10_000 - bps)}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / DAY);
  const h = Math.floor((s % DAY) / HOUR);
  const m = Math.floor((s % HOUR) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** "in 3d 4h" / "2h ago" relative to `now`. */
export function formatRelative(at: number, now: number): string {
  const diff = at - now;
  if (Math.abs(diff) < 60) return "just now";
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
}

export function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(at: number): string {
  return new Date(at * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStars(averageRatingX100: number): string {
  return (averageRatingX100 / 100).toFixed(1);
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
