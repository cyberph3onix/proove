import { sha256Hex } from "@proove/types/hash";
import type { z } from "zod";
import type { FileContentSchema } from "./schemas";

export function decodeContent(content: z.infer<typeof FileContentSchema>): Buffer {
  return content.encoding === "base64" ? Buffer.from(content.data, "base64") : Buffer.from(content.data, "utf8");
}

export function sha256Bytes(bytes: Buffer): string {
  return sha256Hex(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
