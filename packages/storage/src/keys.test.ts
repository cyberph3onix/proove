import { describe, expect, it } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { getBase58Decoder } from "@solana/kit";
import { DecryptionError, generateContentKey } from "./crypto";
import { fromBase64, toBase64, utf8 } from "./bytes";
import {
  ENCRYPTION_KEY_MESSAGE,
  findWrappedKey,
  keyAttestationMessage,
  recipientFromEd25519Secret,
  recipientFromSignature,
  unwrapContentKey,
  verifyKeyAttestation,
  WrongRecipientError,
  wrapContentKey,
  x25519PublicKeyFromEd25519,
} from "./keys";

/** A stand-in for a browser wallet: exposes only its address and signMessage. */
function wallet(seedByte: number) {
  const secret = new Uint8Array(32).fill(seedByte);
  const pub = ed25519.getPublicKey(secret);
  return {
    secret,
    address: getBase58Decoder().decode(pub),
    signMessage: (m: Uint8Array) => ed25519.sign(m, secret),
  };
}

const MILESTONE = "Ms1111111111111111111111111111111111111111";

describe("recipient keys", () => {
  it("derives the same X25519 key every time from the wallet signature", () => {
    const w = wallet(7);
    const a = recipientFromSignature(w.signMessage(utf8(ENCRYPTION_KEY_MESSAGE)), w.address);
    const b = recipientFromSignature(w.signMessage(utf8(ENCRYPTION_KEY_MESSAGE)), w.address);
    expect(toBase64(a.publicKey)).toBe(toBase64(b.publicKey));
    expect(a.publicKey).toEqual(x25519.getPublicKey(a.secretKey));
    const other = recipientFromSignature(wallet(8).signMessage(utf8(ENCRYPTION_KEY_MESSAGE)));
    expect(toBase64(other.publicKey)).not.toBe(toBase64(a.publicKey));
  });

  it("refuses a signature that does not verify for the wallet", () => {
    const w = wallet(7);
    expect(() => recipientFromSignature(w.signMessage(utf8("something else")), w.address)).toThrow(/does not verify/);
    expect(() => recipientFromSignature(wallet(9).signMessage(utf8(ENCRYPTION_KEY_MESSAGE)), w.address)).toThrow(/does not verify/);
    expect(() => recipientFromSignature(new Uint8Array(10))).toThrow(/64-byte/);
  });

  it("ed25519 secret conversion matches the public-key conversion", () => {
    const w = wallet(3);
    const kp = recipientFromEd25519Secret(w.secret);
    expect(x25519PublicKeyFromEd25519(w.address)).toEqual(kp.publicKey);
    const solanaSecret = new Uint8Array([...w.secret, ...ed25519.getPublicKey(w.secret)]);
    expect(recipientFromEd25519Secret(solanaSecret).publicKey).toEqual(kp.publicKey);
  });

  it("attestations bind a wallet to its X25519 key", () => {
    const w = wallet(4);
    const kp = recipientFromSignature(w.signMessage(utf8(ENCRYPTION_KEY_MESSAGE)));
    const sig = w.signMessage(utf8(keyAttestationMessage(w.address, kp.publicKey)));
    expect(verifyKeyAttestation(w.address, kp.publicKey, sig)).toBe(true);
    expect(verifyKeyAttestation(wallet(5).address, kp.publicKey, sig)).toBe(false);
    expect(verifyKeyAttestation(w.address, x25519.getPublicKey(x25519.utils.randomSecretKey()), sig)).toBe(false);
  });
});

describe("wrapContentKey / unwrapContentKey", () => {
  const client = recipientFromSignature(wallet(1).signMessage(utf8(ENCRYPTION_KEY_MESSAGE)));
  const freelancer = recipientFromSignature(wallet(2).signMessage(utf8(ENCRYPTION_KEY_MESSAGE)));

  it("each recipient unwraps the same content key", async () => {
    const key = generateContentKey();
    const keys = [
      await wrapContentKey(key, { role: "client", publicKey: client.publicKey, wallet: wallet(1).address }, MILESTONE),
      await wrapContentKey(key, { role: "freelancer", publicKey: freelancer.publicKey }, MILESTONE),
    ];
    expect(keys[0].wallet).toBe(wallet(1).address);
    expect(keys[1]).not.toHaveProperty("wallet");
    expect(await unwrapContentKey(findWrappedKey(keys, client.publicKey)!, client.secretKey, MILESTONE)).toEqual(key);
    expect(await unwrapContentKey(findWrappedKey(keys, freelancer.publicKey)!, freelancer.secretKey, MILESTONE)).toEqual(key);
    expect(keys[0].epk).not.toBe(keys[1].epk);
  });

  it("a third party cannot unwrap", async () => {
    const key = generateContentKey();
    const w = await wrapContentKey(key, { role: "client", publicKey: client.publicKey }, MILESTONE);
    const outsider = recipientFromSignature(wallet(66).signMessage(utf8(ENCRYPTION_KEY_MESSAGE)));
    await expect(unwrapContentKey(w, outsider.secretKey, MILESTONE)).rejects.toBeInstanceOf(WrongRecipientError);
    // Even if the outsider relabels the wrap as theirs, the ECDH output differs.
    await expect(unwrapContentKey({ ...w, recipient: toBase64(outsider.publicKey) }, outsider.secretKey, MILESTONE)).rejects.toBeInstanceOf(DecryptionError);
    expect(findWrappedKey([w], outsider.publicKey)).toBeUndefined();
  });

  it("detects tampering with the ciphertext, role, ephemeral key or context", async () => {
    const key = generateContentKey();
    const w = await wrapContentKey(key, { role: "client", publicKey: client.publicKey }, MILESTONE);
    const ct = fromBase64(w.ct);
    ct[0] ^= 1;
    await expect(unwrapContentKey({ ...w, ct: toBase64(ct) }, client.secretKey, MILESTONE)).rejects.toBeInstanceOf(DecryptionError);
    await expect(unwrapContentKey({ ...w, role: "arbitrator" }, client.secretKey, MILESTONE)).rejects.toBeInstanceOf(DecryptionError);
    const epk = toBase64(x25519.getPublicKey(x25519.utils.randomSecretKey()));
    await expect(unwrapContentKey({ ...w, epk }, client.secretKey, MILESTONE)).rejects.toBeInstanceOf(DecryptionError);
    await expect(unwrapContentKey(w, client.secretKey, "another-milestone")).rejects.toBeInstanceOf(DecryptionError);
  });

  it("works for future roles without format changes", async () => {
    const key = generateContentKey();
    const ai = recipientFromEd25519Secret(new Uint8Array(32).fill(42));
    const w = await wrapContentKey(key, { role: "ai", publicKey: ai.publicKey }, MILESTONE);
    expect(await unwrapContentKey(w, ai.secretKey, MILESTONE)).toEqual(key);
  });

  it("rejects malformed inputs", async () => {
    await expect(wrapContentKey(new Uint8Array(5), { role: "client", publicKey: client.publicKey }, MILESTONE)).rejects.toThrow();
    await expect(wrapContentKey(generateContentKey(), { role: "client", publicKey: new Uint8Array(31) }, MILESTONE)).rejects.toThrow();
    const w = await wrapContentKey(generateContentKey(), { role: "client", publicKey: client.publicKey }, MILESTONE);
    // @ts-expect-error unknown scheme
    await expect(unwrapContentKey({ ...w, scheme: "v0" }, client.secretKey, MILESTONE)).rejects.toThrow(/unsupported/);
  });
});
