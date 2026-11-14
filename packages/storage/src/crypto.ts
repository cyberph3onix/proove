import { sha256Hex } from "@proove/types/hash";
import type { Hash } from "@proove/types";
import { buf, concatBytes, randomBytes, utf8 } from "./bytes";

/** AES-256-GCM: 32-byte keys, 96-bit IVs, 128-bit tags. */
export const KEY_BYTES = 32;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor(message = "decryption failed: wrong key, wrong IV or tampered ciphertext") {
    super(message);
    this.name = "DecryptionError";
  }
}

/** A fresh random content key. One per delivery; never reused. */
export function generateContentKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/**
 * Commitment to a content key, stored in the manifest. Lets a recipient (or
 * an arbitrator in Phase 2) check that an unwrapped key is the delivery's key
 * without decrypting anything. Safe to publish: the key is 256-bit random.
 */
export function keyCommitment(key: Uint8Array): Hash {
  return sha256Hex(concatBytes(utf8("proove.key-commitment.v1\0"), key));
}

async function importKey(key: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  if (key.length !== KEY_BYTES) throw new Error(`content key must be ${KEY_BYTES} bytes`);
  return globalThis.crypto.subtle.importKey("raw", buf(key), { name: "AES-GCM" }, false, [usage]);
}

export interface EncryptedFile {
  /** AES-256-GCM ciphertext with the 16-byte tag appended (WebCrypto layout). */
  ciphertext: Uint8Array;
  iv: Uint8Array;
  plaintextSha256: Hash;
  ciphertextSha256: Hash;
}

/** File-level AAD: binds every ciphertext to its milestone. */
export function fileAad(milestone: string): Uint8Array {
  return utf8(`proove.delivery-file.v1:${milestone}`);
}

/** Encrypt one file with AES-256-GCM under `key` and a random 96-bit IV. */
export async function encryptFile(
  plaintext: Uint8Array,
  key: Uint8Array,
  opts: { aad?: Uint8Array; iv?: Uint8Array } = {},
): Promise<EncryptedFile> {
  const iv = opts.iv ?? randomBytes(IV_BYTES);
  if (iv.length !== IV_BYTES) throw new Error(`IV must be ${IV_BYTES} bytes`);
  const ck = await importKey(key, "encrypt");
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(iv), ...(opts.aad ? { additionalData: buf(opts.aad) } : {}) },
      ck,
      buf(plaintext),
    ),
  );
  return { ciphertext: ct, iv, plaintextSha256: sha256Hex(plaintext), ciphertextSha256: sha256Hex(ct) };
}

/** Decrypt and authenticate. Throws DecryptionError on any mismatch. */
export async function decryptFile(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  opts: { aad?: Uint8Array } = {},
): Promise<Uint8Array> {
  const ck = await importKey(key, "decrypt");
  try {
    return new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buf(iv), ...(opts.aad ? { additionalData: buf(opts.aad) } : {}) },
        ck,
        buf(ciphertext),
      ),
    );
  } catch {
    throw new DecryptionError();
  }
}
