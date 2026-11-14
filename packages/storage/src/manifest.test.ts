import { describe, expect, it } from "vitest";
import { canonicalize, hashDocument } from "@proove/types/hash";
import { utf8 } from "./bytes";
import { DecryptionError, generateContentKey } from "./crypto";
import { recipientFromEd25519Secret } from "./keys";
import {
  addRecipients,
  createDelivery,
  type DeliveryEnvelope,
  type DeliveryManifest,
  ENVELOPE_SCHEMA,
  fetchDeliveryFile,
  manifestHash,
  MANIFEST_SCHEMA,
  openDelivery,
  toDeliveryFiles,
  verifyEnvelope,
  verifyRevealedFile,
} from "./manifest";
import { IrysUploader, MemoryUploader } from "./upload";

const MILESTONE = "Ms1111111111111111111111111111111111111111";
const client = recipientFromEd25519Secret(new Uint8Array(32).fill(1));
const freelancer = recipientFromEd25519Secret(new Uint8Array(32).fill(2));
const recipients = [
  { role: "client" as const, publicKey: client.publicKey },
  { role: "freelancer" as const, publicKey: freelancer.publicKey },
];
const files = [
  { name: "catalog.coco.json", mime: "application/json", data: utf8('{"images":[]}') },
  { name: "notes-1.md", mime: "text/markdown", data: utf8("# Edge cases\n") },
  { name: "blob.bin", data: new Uint8Array([0, 1, 2, 3]) },
];

async function deliver(uploader = new MemoryUploader()) {
  return { uploader, d: await createDelivery({ milestone: MILESTONE, files, recipients, uploader }) };
}

describe("createDelivery", () => {
  it("builds a manifest whose hash is the canonical SHA-256", async () => {
    const { d, uploader } = await deliver();
    expect(d.manifest.schema).toBe(MANIFEST_SCHEMA);
    expect(d.manifest.files.map((f) => f.name)).toEqual(files.map((f) => f.name));
    expect(d.manifest.files[2].mime).toBe("application/octet-stream");
    expect(d.deliveryHash).toBe(hashDocument(d.manifest));
    expect(d.deliveryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.envelope.keys.map((k) => k.role)).toEqual(["client", "freelancer"]);
    // 3 ciphertexts + the envelope.
    expect(uploader.blobs.size).toBe(4);
    const env = JSON.parse(new TextDecoder().decode(await uploader.download(d.envelopeUri!))) as DeliveryEnvelope;
    expect(env.schema).toBe(ENVELOPE_SCHEMA);
    expect(verifyEnvelope(env, d.deliveryHash)).toBe(true);
    const tags = uploader.blobs.get(d.envelopeUri!.slice(6))!.tags;
    expect(tags).toContainEqual({ name: "Proove-Delivery-Hash", value: d.deliveryHash });
  });

  it("stores only ciphertext", async () => {
    const { d, uploader } = await deliver();
    const stored = await uploader.download(d.manifest.files[1].uri);
    expect(new TextDecoder().decode(stored)).not.toContain("Edge cases");
  });

  it("both parties can open and decrypt every file; plaintext hashes are checked", async () => {
    const { d, uploader } = await deliver();
    for (const who of [client, freelancer]) {
      const key = await openDelivery(d.envelope, who.secretKey);
      for (let i = 0; i < files.length; i++) {
        const pt = await fetchDeliveryFile(d.manifest, i, key, uploader);
        expect(pt).toEqual(files[i].data);
        expect(verifyRevealedFile(d.manifest, i, pt)).toBe(true);
      }
    }
    expect(verifyRevealedFile(d.manifest, 0, utf8("forged"))).toBe(false);
    expect(verifyRevealedFile(d.manifest, 99, utf8("x"))).toBe(false);
  });

  it("a non-recipient cannot open the delivery", async () => {
    const { d } = await deliver();
    const outsider = recipientFromEd25519Secret(new Uint8Array(32).fill(9));
    await expect(openDelivery(d.envelope, outsider.secretKey)).rejects.toThrow(/no wrapped key/);
  });

  it("detects swapped or tampered ciphertext in storage", async () => {
    const { d, uploader } = await deliver();
    const key = await openDelivery(d.envelope, client.secretKey);
    const id = d.manifest.files[0].uri.slice(6);
    uploader.blobs.get(id)!.data[0] ^= 1;
    await expect(fetchDeliveryFile(d.manifest, 0, key, uploader)).rejects.toBeInstanceOf(DecryptionError);
    // Pointing file 0 at file 1's ciphertext is caught by the ciphertext hash.
    const swapped: DeliveryManifest = { ...d.manifest, files: [{ ...d.manifest.files[0], uri: d.manifest.files[1].uri }, ...d.manifest.files.slice(1)] };
    await expect(fetchDeliveryFile(swapped, 0, key, uploader)).rejects.toThrow(/does not match the manifest/);
    await expect(fetchDeliveryFile(d.manifest, 5, key, uploader)).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects a wrapped key that does not match the key commitment", async () => {
    const { d } = await deliver();
    const other = await createDelivery({ milestone: MILESTONE, files, recipients, uploader: new MemoryUploader(), uploadEnvelope: false });
    const mixed: DeliveryEnvelope = { ...d.envelope, keys: other.envelope.keys };
    await expect(openDelivery(mixed, client.secretKey)).rejects.toThrow(/key commitment/);
    expect(other.envelopeUri).toBeUndefined();
  });

  it("adds recipients later without changing delivery_hash", async () => {
    const { d, uploader } = await deliver();
    const arbitrator = recipientFromEd25519Secret(new Uint8Array(32).fill(5));
    const env = await addRecipients(d.envelope, d.contentKey, [{ role: "arbitrator", publicKey: arbitrator.publicKey }]);
    expect(env.keys).toHaveLength(3);
    expect(verifyEnvelope(env, d.deliveryHash)).toBe(true);
    const key = await openDelivery(env, arbitrator.secretKey);
    expect(await fetchDeliveryFile(env.manifest, 1, key, uploader)).toEqual(files[1].data);
    await expect(addRecipients(d.envelope, generateContentKey(), [])).rejects.toThrow(/key commitment/);
  });

  it("enforces input rules and the size cap", async () => {
    const uploader = new MemoryUploader();
    await expect(createDelivery({ milestone: MILESTONE, files: [], recipients, uploader })).rejects.toThrow(/at least one file/);
    await expect(createDelivery({ milestone: MILESTONE, files, recipients: [], uploader })).rejects.toThrow(/recipient/);
    await expect(createDelivery({ milestone: MILESTONE, files, recipients, uploader, maxBytes: 10 })).rejects.toThrow(/cap/);
  });

  it("maps to the web app's DeliveryFile shape", async () => {
    const { d } = await deliver();
    expect(toDeliveryFiles(d.manifest)[0]).toEqual({
      name: "catalog.coco.json",
      size: files[0].data.length,
      mime: "application/json",
      plaintextHash: d.manifest.files[0].sha256,
      uri: d.manifest.files[0].uri,
    });
  });
});

describe("manifestHash", () => {
  const manifest: DeliveryManifest = {
    schema: MANIFEST_SCHEMA,
    milestone: MILESTONE,
    cipher: "AES-256-GCM",
    keyCommitment: "ab".repeat(32),
    files: [{ name: "a.txt", size: 1, mime: "text/plain", sha256: "cd".repeat(32), ciphertextSha256: "ef".repeat(32), uri: "ar://x", iv: "AAAAAAAAAAAAAAAA" }],
  };

  it("does not depend on key order", () => {
    const reordered = JSON.parse(
      JSON.stringify({
        files: [{ iv: "AAAAAAAAAAAAAAAA", uri: "ar://x", ciphertextSha256: "ef".repeat(32), sha256: "cd".repeat(32), mime: "text/plain", size: 1, name: "a.txt" }],
        keyCommitment: "ab".repeat(32),
        cipher: "AES-256-GCM",
        milestone: MILESTONE,
        schema: MANIFEST_SCHEMA,
      }),
    ) as DeliveryManifest;
    expect(manifestHash(reordered)).toBe(manifestHash(manifest));
    expect(canonicalize(reordered)).toBe(canonicalize(manifest));
  });

  it("changes with any field, and with file order", () => {
    const h = manifestHash(manifest);
    expect(manifestHash({ ...manifest, milestone: "other" })).not.toBe(h);
    expect(manifestHash({ ...manifest, files: [{ ...manifest.files[0], size: 2 }] })).not.toBe(h);
    const two = { ...manifest, files: [manifest.files[0], { ...manifest.files[0], name: "b.txt" }] };
    const swapped = { ...manifest, files: [two.files[1], two.files[0]] };
    expect(manifestHash(two)).not.toBe(manifestHash(swapped));
  });

  it("is pinned for a fixed manifest (cross-implementation vector)", () => {
    expect(canonicalize(manifest)).toBe(
      `{"cipher":"AES-256-GCM","files":[{"ciphertextSha256":"${"ef".repeat(32)}","iv":"AAAAAAAAAAAAAAAA","mime":"text/plain","name":"a.txt","sha256":"${"cd".repeat(32)}","size":1,"uri":"ar://x"}],"keyCommitment":"${"ab".repeat(32)}","milestone":"${MILESTONE}","schema":"proove.delivery-manifest.v1"}`,
    );
  });
});

describe("IrysUploader", () => {
  it("tags uploads, returns ar:// URIs and downloads through the gateway", async () => {
    const calls: { data: unknown; tags: unknown }[] = [];
    const store = new Map<string, Uint8Array>();
    const client = {
      async upload(data: Uint8Array, opts?: { tags?: { name: string; value: string }[] }) {
        calls.push({ data, tags: opts?.tags });
        store.set("tx123", data);
        return { id: "tx123" };
      },
    };
    const fakeFetch = (async (url: string) => {
      const id = url.split("/").pop()!;
      const body = store.get(id);
      return body ? new Response(body.slice()) : new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    const irys = new IrysUploader(client, { gateway: "https://gw.test", fetch: fakeFetch });
    const res = await irys.upload(new Uint8Array([9, 9]), { tags: [{ name: "Proove-Type", value: "delivery-file" }] });
    expect(res).toEqual({ id: "tx123", uri: "ar://tx123" });
    expect(calls[0].tags).toEqual([
      { name: "App-Name", value: "Proove" },
      { name: "Proove-Type", value: "delivery-file" },
    ]);
    expect(await irys.download(res.uri)).toEqual(new Uint8Array([9, 9]));
    await expect(irys.download("ar://missing")).rejects.toThrow(/404/);
  });
});
