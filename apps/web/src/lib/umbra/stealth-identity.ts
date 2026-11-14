/**
 * Stealth identities for Confidential Mode.
 *
 * The escrow program pins a gig's payer: `fund_milestone` and
 * `approve_milestone` both carry `has_one = client`, so whoever created the
 * gig is the only account that can fund or approve it. Privacy on the funding
 * side therefore cannot come from paying *into* the escrow from a fresh
 * address -- it has to come from the gig being created by a fresh address in
 * the first place.
 *
 * So a confidential gig is created and funded by a throwaway keypair (the
 * "stealth identity"). The client's real treasury reaches that keypair through
 * Umbra's Stealth Pool, which leaves no on-chain link between the two. An
 * observer sees an address with no history creating and funding a gig.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEMO-GRADE KEY HANDLING
 *
 * The stealth key is the *only* way to approve milestones on that gig. It is
 * persisted to localStorage here, which is fine for a devnet demo and is not
 * acceptable for real money: clearing site data loses control of the gig and
 * anything still sitting in its vault. A production version derives this key
 * deterministically from a wallet signature so it is always recoverable.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  createInMemorySigner,
  createSignerFromPrivateKeyBytes,
  type IUmbraSigner,
} from "@umbra-privacy/sdk";
import { ed25519 } from "@noble/curves/ed25519.js";

const STORAGE_PREFIX = "paygig.stealth.v1";

function storageKey(gigRef: string) {
  return `${STORAGE_PREFIX}.${gigRef}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}

export interface StealthIdentity {
  signer: IUmbraSigner;
  /** Raw key bytes, so the caller can persist the identity. */
  secretKey: Uint8Array;
}

/**
 * Mints a fresh, unlinked signer for one confidential gig.
 *
 * `createInMemorySigner` does not expose its key material, so we generate the
 * bytes ourselves and build the signer from them -- otherwise the identity
 * could never be reloaded after a page refresh and the gig would be stranded.
 *
 * The SDK expects the 64-byte `seed || publicKey` layout that Solana keypair
 * files use, not a bare 32-byte seed; passing 32 fails with
 * "Key pair bytes must be of length 64".
 */
export async function createStealthIdentity(): Promise<StealthIdentity> {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = ed25519.getPublicKey(seed);

  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);

  const signer = await createSignerFromPrivateKeyBytes(secretKey);
  return { signer, secretKey };
}

/**
 * An ephemeral signer with no persistence, for flows that never need to be
 * resumed (e.g. a one-shot relayer-submitted burn).
 */
export async function createEphemeralSigner(): Promise<IUmbraSigner> {
  return createInMemorySigner();
}

/** Persists a stealth key against a caller-chosen reference (e.g. the gig id). */
export function saveStealthIdentity(gigRef: string, secretKey: Uint8Array): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(gigRef), toBase64(secretKey));
}

/** Rehydrates a previously saved stealth signer, or null if none is stored. */
export async function loadStealthIdentity(
  gigRef: string,
): Promise<IUmbraSigner | null> {
  if (typeof window === "undefined") return null;
  const encoded = window.localStorage.getItem(storageKey(gigRef));
  if (!encoded) return null;
  return createSignerFromPrivateKeyBytes(fromBase64(encoded));
}

/** Every gig reference this browser holds a stealth key for. */
export function listStealthIdentities(): string[] {
  if (typeof window === "undefined") return [];
  return Object.keys(window.localStorage)
    .filter((k) => k.startsWith(`${STORAGE_PREFIX}.`))
    .map((k) => k.slice(STORAGE_PREFIX.length + 1));
}

export function forgetStealthIdentity(gigRef: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(gigRef));
}
