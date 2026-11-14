import { canonicalize, hashDocument, sha256Hex } from "@proove/types/hash";
import type { DeliveryFile, Hash } from "@proove/types";
import { fromBase64, toBase64, utf8 } from "./bytes";
import { DecryptionError, decryptFile, encryptFile, fileAad, generateContentKey, keyCommitment } from "./crypto";
import { findWrappedKey, type Recipient, unwrapContentKey, type WrappedKey, wrapContentKey } from "./keys";
import type { Uploader } from "./upload";
import { x25519 } from "@noble/curves/ed25519.js";

export const MANIFEST_SCHEMA = "proove.delivery-manifest.v1" as const;
export const ENVELOPE_SCHEMA = "proove.delivery-envelope.v1" as const;
/** PRD: deliveries are capped at 200 MB. */
export const MAX_DELIVERY_BYTES = 200 * 1024 * 1024;

export interface ManifestFile {
  name: string;
  size: number;
  mime: string;
  /** SHA-256 of the plaintext, so a revealed file can be checked against the commitment. */
  sha256: Hash;
  /** SHA-256 of the stored ciphertext (incl. GCM tag). */
  ciphertextSha256: Hash;
  /** Storage URI of the ciphertext (`ar://…` on Irys). */
  uri: string;
  /** base64 96-bit AES-GCM IV. */
  iv: string;
}

/**
 * The committed document. `delivery_hash` on-chain = manifestHash(manifest).
 * Wrapped keys are deliberately NOT part of it (see DeliveryEnvelope), so
 * recipients can be added in a dispute without changing the commitment.
 */
export interface DeliveryManifest {
  schema: typeof MANIFEST_SCHEMA;
  milestone: string;
  cipher: "AES-256-GCM";
  /** keyCommitment(contentKey): lets anyone holding a candidate key check it. */
  keyCommitment: Hash;
  /** Order matters: sample-audit indices refer to positions in this list. */
  files: ManifestFile[];
}

/** The manifest plus the content key wrapped for each recipient. Stored as plain JSON. */
export interface DeliveryEnvelope {
  schema: typeof ENVELOPE_SCHEMA;
  manifest: DeliveryManifest;
  keys: WrappedKey[];
}

/** SHA-256 of the RFC 8785 canonical manifest: the on-chain `delivery_hash`. */
export function manifestHash(manifest: DeliveryManifest): Hash {
  return hashDocument(manifest);
}

/** Check an envelope (e.g. fetched from storage) against the on-chain delivery_hash. */
export function verifyEnvelope(envelope: DeliveryEnvelope, deliveryHash: Hash): boolean {
  return envelope.schema === ENVELOPE_SCHEMA && manifestHash(envelope.manifest) === deliveryHash.toLowerCase();
}

/** The manifest's files in the shape the web app's `DeliveryFile` uses. */
export function toDeliveryFiles(manifest: DeliveryManifest): DeliveryFile[] {
  return manifest.files.map((f) => ({ name: f.name, size: f.size, mime: f.mime, plaintextHash: f.sha256, uri: f.uri }));
}

export interface PlainFile {
  name: string;
  mime?: string;
  data: Uint8Array;
}

export interface CreatedDelivery {
  manifest: DeliveryManifest;
  /** Goes on-chain as `delivery_hash`. */
  deliveryHash: Hash;
  envelope: DeliveryEnvelope;
  /** URI of the uploaded envelope JSON (unless `uploadEnvelope: false`). */
  envelopeUri?: string;
  /** Keep only in memory: needed to send plaintext to the verifier or add recipients. */
  contentKey: Uint8Array;
}

/**
 * Encrypt every file under a fresh content key, upload the ciphertexts, build
 * the manifest and wrap the key for each recipient (client and freelancer in
 * Phase 1). Uploads the envelope JSON too, tagged so anyone can find it by
 * milestone and verify it against `delivery_hash`.
 */
export async function createDelivery(params: {
  milestone: string;
  files: PlainFile[];
  recipients: Recipient[];
  uploader: Uploader;
  uploadEnvelope?: boolean;
  maxBytes?: number;
}): Promise<CreatedDelivery> {
  const { milestone, files, recipients, uploader } = params;
  if (files.length === 0) throw new Error("a delivery needs at least one file");
  if (recipients.length === 0) throw new Error("a delivery needs at least one recipient");
  const total = files.reduce((n, f) => n + f.data.length, 0);
  const max = params.maxBytes ?? MAX_DELIVERY_BYTES;
  if (total > max) throw new Error(`delivery is ${total} bytes; the cap is ${max}`);

  const contentKey = generateContentKey();
  const aad = fileAad(milestone);
  const out: ManifestFile[] = [];
  for (const f of files) {
    const enc = await encryptFile(f.data, contentKey, { aad });
    const { uri } = await uploader.upload(enc.ciphertext, {
      tags: [
        { name: "Content-Type", value: "application/octet-stream" },
        { name: "Proove-Type", value: "delivery-file" },
        { name: "Proove-Milestone", value: milestone },
      ],
    });
    out.push({
      name: f.name,
      size: f.data.length,
      mime: f.mime || "application/octet-stream",
      sha256: enc.plaintextSha256,
      ciphertextSha256: enc.ciphertextSha256,
      uri,
      iv: toBase64(enc.iv),
    });
  }
  const manifest: DeliveryManifest = { schema: MANIFEST_SCHEMA, milestone, cipher: "AES-256-GCM", keyCommitment: keyCommitment(contentKey), files: out };
  const keys = await Promise.all(recipients.map((r) => wrapContentKey(contentKey, r, milestone)));
  const envelope: DeliveryEnvelope = { schema: ENVELOPE_SCHEMA, manifest, keys };
  const deliveryHash = manifestHash(manifest);

  let envelopeUri: string | undefined;
  if (params.uploadEnvelope !== false) {
    ({ uri: envelopeUri } = await uploader.upload(utf8(canonicalize(envelope)), {
      tags: [
        { name: "Content-Type", value: "application/json" },
        { name: "Proove-Type", value: "delivery-envelope" },
        { name: "Proove-Milestone", value: milestone },
        { name: "Proove-Delivery-Hash", value: deliveryHash },
      ],
    }));
  }
  return { manifest, deliveryHash, envelope, envelopeUri, contentKey };
}

/**
 * Wrap the content key for more recipients (Phase 2: AI service, arbitrators).
 * The manifest, and so `delivery_hash`, does not change.
 */
export async function addRecipients(envelope: DeliveryEnvelope, contentKey: Uint8Array, recipients: Recipient[]): Promise<DeliveryEnvelope> {
  if (keyCommitment(contentKey) !== envelope.manifest.keyCommitment) throw new Error("content key does not match the manifest's key commitment");
  const added = await Promise.all(recipients.map((r) => wrapContentKey(contentKey, r, envelope.manifest.milestone)));
  return { ...envelope, keys: [...envelope.keys, ...added] };
}

/** Recover the content key with a recipient's X25519 secret, checked against the manifest. */
export async function openDelivery(envelope: DeliveryEnvelope, secretKey: Uint8Array): Promise<Uint8Array> {
  const wrapped = findWrappedKey(envelope.keys, x25519.getPublicKey(secretKey));
  if (!wrapped) throw new Error("no wrapped key in this delivery for the given secret key");
  const key = await unwrapContentKey(wrapped, secretKey, envelope.manifest.milestone);
  if (keyCommitment(key) !== envelope.manifest.keyCommitment) throw new DecryptionError("unwrapped key does not match the manifest's key commitment");
  return key;
}

/** Decrypt one manifest file from its ciphertext bytes, checking both hashes. */
export async function decryptManifestFile(manifest: DeliveryManifest, index: number, ciphertext: Uint8Array, contentKey: Uint8Array): Promise<Uint8Array> {
  const f = manifest.files[index];
  if (!f) throw new RangeError(`file index ${index} out of range (${manifest.files.length} files)`);
  if (sha256Hex(ciphertext) !== f.ciphertextSha256) throw new DecryptionError(`ciphertext of ${f.name} does not match the manifest`);
  const pt = await decryptFile(ciphertext, contentKey, fromBase64(f.iv), { aad: fileAad(manifest.milestone) });
  if (sha256Hex(pt) !== f.sha256 || pt.length !== f.size) throw new DecryptionError(`plaintext of ${f.name} does not match the manifest`);
  return pt;
}

/** Download and decrypt one manifest file. */
export async function fetchDeliveryFile(manifest: DeliveryManifest, index: number, contentKey: Uint8Array, uploader: Uploader): Promise<Uint8Array> {
  const f = manifest.files[index];
  if (!f) throw new RangeError(`file index ${index} out of range (${manifest.files.length} files)`);
  return decryptManifestFile(manifest, index, await uploader.download(f.uri), contentKey);
}

/** Check a revealed plaintext (e.g. evidence in a dispute) against the manifest commitment. */
export function verifyRevealedFile(manifest: DeliveryManifest, index: number, plaintext: Uint8Array): boolean {
  const f = manifest.files[index];
  return !!f && f.size === plaintext.length && sha256Hex(plaintext) === f.sha256;
}

