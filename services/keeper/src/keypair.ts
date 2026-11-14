import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

/** Read a `solana-keygen` JSON keypair file. */
export function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw) || raw.length !== 64) throw new Error(`${path} is not a Solana keypair file (64-byte JSON array)`);
  return Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
}
