import { sha256 } from "@noble/hashes/sha2.js";
import { toBase64Url } from "./bytes";

export interface UploadTag {
  name: string;
  value: string;
}

export interface UploadResult {
  /** Storage-native id (an Arweave transaction id for Irys). */
  id: string;
  /** URI recorded in the manifest, e.g. `ar://<id>`. */
  uri: string;
}

/** Where ciphertext (and plain JSON documents) are stored. */
export interface Uploader {
  upload(data: Uint8Array, opts?: { tags?: UploadTag[] }): Promise<UploadResult>;
  download(uri: string): Promise<Uint8Array>;
}

/** Content-addressed in-memory store for tests and the mock data mode. */
export class MemoryUploader implements Uploader {
  readonly blobs = new Map<string, { data: Uint8Array; tags: UploadTag[] }>();

  async upload(data: Uint8Array, opts: { tags?: UploadTag[] } = {}): Promise<UploadResult> {
    const id = toBase64Url(sha256(data)).slice(0, 43);
    this.blobs.set(id, { data: data.slice(), tags: opts.tags ?? [] });
    return { id, uri: `mem://${id}` };
  }

  async download(uri: string): Promise<Uint8Array> {
    const id = uri.replace(/^mem:\/\//, "");
    const blob = this.blobs.get(id);
    if (!blob) throw new Error(`not found: ${uri}`);
    return blob.data.slice();
  }
}

/**
 * The slice of the official Irys SDK this package uses. Both the browser
 * client (`@irys/web-upload` + `@irys/web-upload-solana`) and the Node client
 * (`@irys/upload` + `@irys/upload-solana`) satisfy it, so the SDK stays a
 * dependency of the app/service that builds the client, not of this package.
 *
 *   // browser
 *   const irys = await WebUploader(WebSolana).withProvider(wallet).withRpc(rpcUrl).devnet();
 *   // node
 *   const irys = await Uploader(Solana).withWallet(secretKey).withRpc(rpcUrl).devnet();
 *   const storage = new IrysUploader(irys);
 */
export interface IrysClientLike {
  // The SDKs type `data` as `string | Buffer`; Buffer is a Uint8Array subclass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upload(data: any, opts?: { tags?: UploadTag[] }): Promise<{ id: string }>;
}

export const IRYS_GATEWAY = "https://gateway.irys.xyz";

/**
 * Irys (Arweave) uploader. Uploads need a funded Irys balance (devnet: a
 * funded devnet wallet). Reads go through the public gateway.
 */
export class IrysUploader implements Uploader {
  constructor(
    private readonly client: IrysClientLike,
    private readonly opts: { gateway?: string; fetch?: typeof fetch; toUploadData?: (d: Uint8Array) => unknown } = {},
  ) {}

  async upload(data: Uint8Array, opts: { tags?: UploadTag[] } = {}): Promise<UploadResult> {
    const payload = this.opts.toUploadData ? this.opts.toUploadData(data) : data;
    const receipt = await this.client.upload(payload, { tags: [{ name: "App-Name", value: "Proove" }, ...(opts.tags ?? [])] });
    return { id: receipt.id, uri: `ar://${receipt.id}` };
  }

  async download(uri: string): Promise<Uint8Array> {
    const id = uri.replace(/^ar:\/\//, "");
    const f = this.opts.fetch ?? globalThis.fetch;
    const res = await f(`${this.opts.gateway ?? IRYS_GATEWAY}/${id}`);
    if (!res.ok) throw new Error(`Irys gateway returned ${res.status} for ${uri}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
