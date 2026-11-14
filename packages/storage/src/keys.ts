/**
 * Key wrapping: ECIES over X25519.
 *
 *   eph        = random X25519 secret
 *   shared     = X25519(eph, recipientPub)
 *   kek        = HKDF-SHA256(ikm = shared, salt = ephPub || recipientPub,
 *                            info = "proove.key-wrap.v1", 32 bytes)
 *   wrapped    = AES-256-GCM(kek, iv = random 96-bit, contentKey,
 *                            aad = "proove.key-wrap.v1|<context>|<role>")
 *
 * Recipient X25519 keys come from a deterministic wallet signature over
 * ENCRYPTION_KEY_MESSAGE (browser wallets never expose the ed25519 secret).
 * Service keypairs that do hold an ed25519 secret can use
 * recipientFromEd25519Secret instead. See README.md.
 */
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { getBase58Encoder } from "@solana/kit";
import { buf, bytesEqual, concatBytes, fromBase64, randomBytes, toBase64, utf8 } from "./bytes";
import { DecryptionError, IV_BYTES, KEY_BYTES } from "./crypto";

export const KEY_WRAP_SCHEME = "proove.key-wrap.v1" as const;

/**
 * The constant message a wallet signs to derive its Proove encryption key.
 * Never change it: a different message derives a different key and every
 * delivery wrapped for the old one becomes unreadable. Bump the version (and
 * keep the old message for decryption) if it ever must change.
 */
export const ENCRYPTION_KEY_MESSAGE =
  "Proove encryption key v1\n\n" +
  "Sign to unlock your Proove delivery encryption key.\n" +
  "This signature never leaves your device and does not authorize any transaction.";

/** Message a wallet signs to bind its address to its X25519 public key. */
export function keyAttestationMessage(wallet: string, x25519PublicKey: Uint8Array): string {
  return `Proove encryption key attestation v1\nwallet: ${wallet}\nx25519: ${toBase64(x25519PublicKey)}`;
}

/**
 * Who a content key is wrapped for. Phase 1 uses "client" and "freelancer";
 * Phase 2 adds "ai" and "arbitrator" without changing the format.
 */
export type RecipientRole = "client" | "freelancer" | "ai" | "arbitrator" | (string & {});

export interface Recipient {
  role: RecipientRole;
  /** X25519 public key (32 bytes). */
  publicKey: Uint8Array;
  /** Solana address of the recipient, informational (the key binds it, not this field). */
  wallet?: string;
}

export interface RecipientKeypair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface WrappedKey {
  scheme: typeof KEY_WRAP_SCHEME;
  role: RecipientRole;
  wallet?: string;
  /** base64 X25519 public key of the recipient. */
  recipient: string;
  /** base64 ephemeral X25519 public key. */
  epk: string;
  /** base64 96-bit IV. */
  iv: string;
  /** base64 AES-256-GCM ciphertext of the content key (32 + 16 bytes). */
  ct: string;
}

export class WrongRecipientError extends Error {
  constructor(message = "this wrapped key is not addressed to the given secret key") {
    super(message);
    this.name = "WrongRecipientError";
  }
}

function keypairFromSecret(secretKey: Uint8Array): RecipientKeypair {
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

/**
 * Derive a recipient keypair from the wallet's signature over
 * ENCRYPTION_KEY_MESSAGE. Ed25519 signatures are deterministic (RFC 8032), so
 * the same wallet always derives the same key. Pass `walletAddress` to check
 * the signature first: a bad signature would derive a key nobody can rebuild.
 */
export function recipientFromSignature(signature: Uint8Array, walletAddress?: string): RecipientKeypair {
  if (signature.length !== 64) throw new Error("expected a 64-byte ed25519 signature");
  if (walletAddress !== undefined) {
    const pub = new Uint8Array(getBase58Encoder().encode(walletAddress));
    if (!ed25519.verify(signature, utf8(ENCRYPTION_KEY_MESSAGE), pub)) {
      throw new Error("signature does not verify against the wallet for ENCRYPTION_KEY_MESSAGE");
    }
  }
  const secret = hkdf(sha256, signature, utf8("proove.x25519-from-signature.v1"), new Uint8Array(0), 32);
  return keypairFromSecret(secret);
}

/**
 * For keypairs whose ed25519 secret is available (services, CLI, tests):
 * the standard ed25519 → X25519 birational conversion. `secretKey` is the
 * 32-byte seed (or the 64-byte Solana secret key, of which the first 32 are the seed).
 */
export function recipientFromEd25519Secret(secretKey: Uint8Array): RecipientKeypair {
  const seed = secretKey.length === 64 ? secretKey.subarray(0, 32) : secretKey;
  if (seed.length !== 32) throw new Error("expected a 32-byte ed25519 seed or 64-byte secret key");
  return keypairFromSecret(ed25519.utils.toMontgomerySecret(seed));
}

/** X25519 public key for an ed25519 address, matching recipientFromEd25519Secret. */
export function x25519PublicKeyFromEd25519(ed25519PublicKey: Uint8Array | string): Uint8Array {
  const pub = typeof ed25519PublicKey === "string" ? new Uint8Array(getBase58Encoder().encode(ed25519PublicKey)) : ed25519PublicKey;
  return ed25519.utils.toMontgomery(pub);
}

/** Verify that `wallet` signed keyAttestationMessage(wallet, x25519PublicKey). */
export function verifyKeyAttestation(wallet: string, x25519PublicKey: Uint8Array, signature: Uint8Array): boolean {
  try {
    const pub = new Uint8Array(getBase58Encoder().encode(wallet));
    return ed25519.verify(signature, utf8(keyAttestationMessage(wallet, x25519PublicKey)), pub);
  } catch {
    return false;
  }
}

function kek(shared: Uint8Array, epk: Uint8Array, recipient: Uint8Array): Uint8Array {
  return hkdf(sha256, shared, concatBytes(epk, recipient), utf8(KEY_WRAP_SCHEME), 32);
}

const wrapAad = (context: string, role: string) => utf8(`${KEY_WRAP_SCHEME}|${context}|${role}`);

async function aesKey(raw: Uint8Array, usage: KeyUsage) {
  return globalThis.crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, [usage]);
}

/**
 * Wrap `contentKey` for one recipient. `context` binds the wrap to a delivery
 * (use the milestone address) so it cannot be replayed elsewhere.
 */
export async function wrapContentKey(contentKey: Uint8Array, recipient: Recipient, context: string): Promise<WrappedKey> {
  if (contentKey.length !== KEY_BYTES) throw new Error(`content key must be ${KEY_BYTES} bytes`);
  if (recipient.publicKey.length !== 32) throw new Error("recipient X25519 public key must be 32 bytes");
  const eph = x25519.utils.randomSecretKey();
  const epk = x25519.getPublicKey(eph);
  const shared = x25519.getSharedSecret(eph, recipient.publicKey);
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(iv), additionalData: buf(wrapAad(context, recipient.role)) },
      await aesKey(kek(shared, epk, recipient.publicKey), "encrypt"),
      buf(contentKey),
    ),
  );
  return {
    scheme: KEY_WRAP_SCHEME,
    role: recipient.role,
    ...(recipient.wallet ? { wallet: recipient.wallet } : {}),
    recipient: toBase64(recipient.publicKey),
    epk: toBase64(epk),
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
}

/** Unwrap with the recipient's X25519 secret. Throws WrongRecipientError or DecryptionError. */
export async function unwrapContentKey(wrapped: WrappedKey, secretKey: Uint8Array, context: string): Promise<Uint8Array> {
  if (wrapped.scheme !== KEY_WRAP_SCHEME) throw new Error(`unsupported key-wrap scheme ${wrapped.scheme}`);
  const pub = x25519.getPublicKey(secretKey);
  const recipient = fromBase64(wrapped.recipient);
  if (!bytesEqual(pub, recipient)) throw new WrongRecipientError();
  const epk = fromBase64(wrapped.epk);
  const shared = x25519.getSharedSecret(secretKey, epk);
  try {
    return new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf(fromBase64(wrapped.iv)), additionalData: buf(wrapAad(context, wrapped.role)) },
        await aesKey(kek(shared, epk, recipient), "decrypt"),
        buf(fromBase64(wrapped.ct)),
      ),
    );
  } catch {
    throw new DecryptionError("key unwrap failed: tampered wrapped key or wrong context");
  }
}

/** The wrapped key addressed to `publicKey`, if any. */
export function findWrappedKey(keys: WrappedKey[], publicKey: Uint8Array): WrappedKey | undefined {
  const b64 = toBase64(publicKey);
  return keys.find((k) => k.recipient === b64);
}
