import { describe, expect, it } from "vitest";
import { sha256Hex } from "@proove/types/hash";
import { DecryptionError, decryptFile, encryptFile, fileAad, generateContentKey, IV_BYTES, keyCommitment, TAG_BYTES } from "./crypto";
import { fromBase64, toBase64, toBase64Url, utf8 } from "./bytes";

const text = utf8("Pilot batch of 50 images, labeled per guideline v3.");

describe("encryptFile / decryptFile", () => {
  it("round-trips and reports both hashes", async () => {
    const key = generateContentKey();
    const enc = await encryptFile(text, key);
    expect(enc.iv).toHaveLength(IV_BYTES);
    expect(enc.ciphertext).toHaveLength(text.length + TAG_BYTES);
    expect(enc.plaintextSha256).toBe(sha256Hex(text));
    expect(enc.ciphertextSha256).toBe(sha256Hex(enc.ciphertext));
    expect(await decryptFile(enc.ciphertext, key, enc.iv)).toEqual(text);
  });

  it("round-trips an empty file and a 1 MiB file", async () => {
    const key = generateContentKey();
    const empty = await encryptFile(new Uint8Array(0), key);
    expect(await decryptFile(empty.ciphertext, key, empty.iv)).toHaveLength(0);
    const big = new Uint8Array(1 << 20).map((_, i) => (i * 31) & 0xff);
    const enc = await encryptFile(big, key);
    expect(await decryptFile(enc.ciphertext, key, enc.iv)).toEqual(big);
  });

  it("uses a fresh IV and key every time", async () => {
    const key = generateContentKey();
    const a = await encryptFile(text, key);
    const b = await encryptFile(text, key);
    expect(toBase64(a.iv)).not.toBe(toBase64(b.iv));
    expect(a.ciphertextSha256).not.toBe(b.ciphertextSha256);
    expect(toBase64(generateContentKey())).not.toBe(toBase64(generateContentKey()));
  });

  it("detects a flipped ciphertext bit, a flipped tag bit and a wrong IV", async () => {
    const key = generateContentKey();
    const enc = await encryptFile(text, key);
    const body = enc.ciphertext.slice();
    body[3] ^= 1;
    await expect(decryptFile(body, key, enc.iv)).rejects.toBeInstanceOf(DecryptionError);
    const tag = enc.ciphertext.slice();
    tag[tag.length - 1] ^= 0x80;
    await expect(decryptFile(tag, key, enc.iv)).rejects.toBeInstanceOf(DecryptionError);
    const iv = enc.iv.slice();
    iv[0] ^= 1;
    await expect(decryptFile(enc.ciphertext, key, iv)).rejects.toBeInstanceOf(DecryptionError);
    await expect(decryptFile(enc.ciphertext.slice(0, -1), key, enc.iv)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails with the wrong key", async () => {
    const enc = await encryptFile(text, generateContentKey());
    await expect(decryptFile(enc.ciphertext, generateContentKey(), enc.iv)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("binds the milestone through the AAD", async () => {
    const key = generateContentKey();
    const enc = await encryptFile(text, key, { aad: fileAad("milestoneA") });
    expect(await decryptFile(enc.ciphertext, key, enc.iv, { aad: fileAad("milestoneA") })).toEqual(text);
    await expect(decryptFile(enc.ciphertext, key, enc.iv, { aad: fileAad("milestoneB") })).rejects.toBeInstanceOf(DecryptionError);
    await expect(decryptFile(enc.ciphertext, key, enc.iv)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("rejects bad key and IV lengths", async () => {
    await expect(encryptFile(text, new Uint8Array(16))).rejects.toThrow(/32 bytes/);
    await expect(encryptFile(text, generateContentKey(), { iv: new Uint8Array(16) })).rejects.toThrow(/12 bytes/);
  });

  it("key commitment is stable per key and distinct across keys", () => {
    const k = generateContentKey();
    expect(keyCommitment(k)).toBe(keyCommitment(k.slice()));
    expect(keyCommitment(k)).toMatch(/^[0-9a-f]{64}$/);
    expect(keyCommitment(k)).not.toBe(keyCommitment(generateContentKey()));
  });
});

describe("bytes helpers", () => {
  it("base64 round-trips binary data, including large buffers", () => {
    const b = new Uint8Array(100_000).map((_, i) => i & 0xff);
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});
