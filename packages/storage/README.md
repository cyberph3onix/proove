# @proove/storage

Delivery storage for Proove: browser-side encryption, the delivery manifest whose hash goes on-chain as `delivery_hash`, key wrapping for the parties, uploads (Irys), and the random sample audit. Runs in browsers and Node 24 (WebCrypto + `@noble/*`, no Node-only APIs).

```ts
import { createDelivery, openDelivery, fetchDeliveryFile, recipientFromSignature,
         ENCRYPTION_KEY_MESSAGE, computeAuditSample, fetchAuditSeed } from "@proove/storage";
```

## Delivery flow

1. Each party derives its encryption keypair once per session: `recipientFromSignature(await wallet.signMessage(utf8(ENCRYPTION_KEY_MESSAGE)), walletAddress)`.
2. The freelancer calls `createDelivery({ milestone, files, recipients: [client, freelancer], uploader })`. It
   - generates a fresh 256-bit content key for this delivery,
   - encrypts each file with AES-256-GCM (random 96-bit IV, AAD `proove.delivery-file.v1:<milestone>`),
   - uploads each ciphertext,
   - builds the manifest and wraps the content key for every recipient,
   - uploads the envelope (manifest + wrapped keys) as JSON tagged `Proove-Type: delivery-envelope`, `Proove-Milestone`, `Proove-Delivery-Hash`.
3. `deliveryHash` goes on-chain in `submit_delivery(delivery_hash, report_hash)`.
4. A recipient fetches the envelope (by URI or by tag), checks `verifyEnvelope(env, onchainDeliveryHash)`, then `openDelivery(env, secretKey)` and `fetchDeliveryFile(manifest, i, key, uploader)`. Every file is checked against both its ciphertext and plaintext hash.

## Manifest

```jsonc
{
  "schema": "proove.delivery-manifest.v1",
  "milestone": "<milestone address>",
  "cipher": "AES-256-GCM",
  "keyCommitment": "<sha256('proove.key-commitment.v1\\0' || contentKey)>",
  "files": [
    { "name": "…", "size": 123, "mime": "…",
      "sha256": "<plaintext sha256>", "ciphertextSha256": "…",
      "uri": "ar://<id>", "iv": "<base64>" }
  ]
}
```

`delivery_hash = SHA-256(RFC 8785 canonical JSON of the manifest)` via `@proove/types/hash`. The plaintext `sha256` per file is what the PRD asks for: a file revealed in a dispute can be checked against the commitment (`verifyRevealedFile`). File order matters: audit indices point into `files`.

Wrapped keys sit in the envelope, outside the hashed manifest, so recipients can be added later (`addRecipients`: the AI service and arbitrators in Phase 2) without changing `delivery_hash`. The `keyCommitment` stops anyone from slipping in a wrapped key for a different content key: `openDelivery` checks every unwrapped key against it.

## Key wrapping

ECIES over X25519, one wrap per recipient:

```
eph    = random X25519 secret,  epk = X25519(eph, G)
shared = X25519(eph, recipientPub)
kek    = HKDF-SHA256(ikm = shared, salt = epk || recipientPub, info = "proove.key-wrap.v1", L = 32)
ct     = AES-256-GCM(kek, iv = random 96-bit, contentKey, aad = "proove.key-wrap.v1|<milestone>|<role>")
```

A `WrappedKey` is `{ scheme, role, wallet?, recipient, epk, iv, ct }` (base64 fields). Roles are free strings (`client`, `freelancer`, later `ai`, `arbitrator`); the role and milestone are bound through the AAD.

### Where recipient keys come from: signature-derived (chosen)

```
signature = wallet.signMessage(ENCRYPTION_KEY_MESSAGE)        // 64-byte ed25519 signature
x25519Secret = HKDF-SHA256(ikm = signature, salt = "proove.x25519-from-signature.v1", info = "", L = 32)
```

`ENCRYPTION_KEY_MESSAGE` is a constant in `src/keys.ts`. Never edit it: a new message derives a new key and every delivery wrapped for the old key becomes unreadable. If it must change, add a v2 message and keep v1 for decryption.

Why this and not the ed25519 → X25519 conversion: the conversion lets anyone wrap to a bare wallet address, but unwrapping then needs the ed25519 secret, and Phantom, Solflare, Backpack and Ledger never expose it. Wallets do sign messages, and ed25519 signatures are deterministic (RFC 8032), so the same wallet derives the same key on any device. The signature is the secret, so it must never leave the browser or be logged. `recipientFromSignature(sig, address)` verifies the signature first, because a broken wallet signature would derive a key that can't be rebuilt.

What this costs: a sender can't derive a recipient's public key from the address alone. Each party publishes its X25519 public key with an attestation, which is the wallet's signature over `keyAttestationMessage(wallet, x25519Pub)`, checked with `verifyKeyAttestation`. Places to publish it: the client's milestone spec or the indexer profile, for example. Wallets that randomize signatures (non-RFC 8032) would break determinism. Check at setup time by signing twice and comparing.

Services that hold a raw ed25519 keypair (AI service, CLI, tests) can use `recipientFromEd25519Secret` / `x25519PublicKeyFromEd25519` (standard birational conversion) instead. The wrap format is the same.

## Uploads

`Uploader` has two methods, `upload(bytes, { tags }) → { id, uri }` and `download(uri)`. Two implementations:

- `MemoryUploader`: content-addressed and in-memory. Tests use it, and so can the mock data mode.
- `IrysUploader(client)`: wraps an official Irys SDK client, `@irys/web-upload` + `@irys/web-upload-solana` in the browser or `@irys/upload` + `@irys/upload-solana` in Node. URIs are `ar://<id>`, and reads go through `https://gateway.irys.xyz`. The SDK is a dependency of whichever app builds the client, not of this package, which keeps the SDK's large dependency tree out of it. Devnet uploads need a funded Irys balance, so no test runs against the real network yet.

## Random sample audit

**Seed.** Read the `SlotHashes` sysvar at `finalized` commitment and take the entry for `submitted_slot + 2`.

**Skipped slots.** SlotHashes only lists slots that produced a bank. Use the entry with the **smallest slot ≥ submitted_slot + 2**. The seed is unavailable in two cases:
- No entry ≥ target exists yet: `AuditSeedNotYetAvailableError`. Retry.
- The oldest entry is already newer than the target: `AuditSeedExpiredError`. The window has moved past the target, so the skipped-slot rule can no longer be proven.

SlotHashes keeps 512 slots, roughly 3.5 minutes. The verifier must read the seed promptly and record `seedSlot` and `seed` in the report's `SampleAudit`.

**Sample.** `computeAuditSample(slotHash, population, sampleSize, { domain? })` returns ascending indices. It is a partial Fisher-Yates shuffle over `[0, n)`. Random integers come from 32-bit big-endian words of
`SHA-256("proove.sample-audit.v1" ‖ 0x00 ‖ domain ‖ 0x00 ‖ slotHash ‖ counter_u32_be)`, eight words per block, with counters 0, 1, 2 and so on. A word `x` is accepted for range `m` only if `x < 2^32 − (2^32 mod m)`, and then gives `x mod m`. That rejection step removes modulo bias. Step `i` swaps position `i` with `i + uniform(n − i)`. When `sampleSize ≥ n` the result is every index, and when `n = 0` it is `[]`. The test suite pins vectors that an independent implementation must reproduce.

## Scripts

`pnpm --filter @proove/storage test` · `pnpm --filter @proove/storage typecheck`
