import { PublicKey } from "@solana/web3.js";
import type { Plain } from "../decode";

export const DEFAULT_PUBKEY = "11111111111111111111111111111111";

export function str(v: Plain | undefined): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function num(v: Plain | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "") return Number(v);
  return 0;
}

/** Unix timestamp where 0 means "not set". */
export function time(v: Plain | undefined): number | null {
  const n = num(v);
  return n === 0 ? null : n;
}

/** Pubkey where the default (all-zero) key means "none". */
export function pubkeyOrNull(v: Plain | undefined): string | null {
  const s = str(v);
  return s === "" || s === DEFAULT_PUBKEY ? null : s;
}

/** Anchor enum variant name -> domain status ("InProgress" -> "inProgress"). */
export function lowerFirst(v: Plain | undefined): string {
  const s = str(v);
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function hex(v: Plain | undefined): string {
  return Array.isArray(v) ? Buffer.from(v.map((b) => Number(b))).toString("hex") : str(v);
}

/** A `[u8; 32]` commitment as the `@proove/types` `Hash` (64 hex chars; all zeros = none, like `ZERO_HASH`). */
export function hash32(v: Plain | undefined): string {
  return hex(v).padStart(64, "0");
}

/** On-chain skills are a single comma-separated string. */
export function parseSkills(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Escrow `ProtocolConfig` singleton PDA. */
export function protocolConfigPda(escrowProgram: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("protocol_config")], new PublicKey(escrowProgram))[0].toBase58();
}

/** Escrow `EscrowVault` PDA for a gig. */
export function vaultPda(gig: string, escrowProgram: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), new PublicKey(gig).toBuffer()], new PublicKey(escrowProgram))[0].toBase58();
}

export function profilePda(authority: string, reputationProgram: string): string {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("profile"), new PublicKey(authority).toBuffer()],
    new PublicKey(reputationProgram),
  )[0].toBase58();
}
