import type { ModelPart } from "./model";

/**
 * Content is data. Every piece of user-supplied text reaches the model as a
 * JSON value inside an <untrusted_data> element. JSON.stringify escapes
 * quotes, backslashes and control characters, and we additionally escape
 * < > & and the JS line separators, so no input can produce a closing
 * `</untrusted_data>` tag, a fake `<system>` tag, or break out of the string.
 */
export function escapeData(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const ATTR_SAFE = /[^A-Za-z0-9._:-]/g;

/** Attribute values are labels we choose (ids, kinds); still sanitised. */
function attr(value: string): string {
  return value.replace(ATTR_SAFE, "_").slice(0, 64);
}

export function dataBlock(kind: string, label: string, content: unknown): string {
  return `<untrusted_data kind="${attr(kind)}" label="${attr(label)}">\n${escapeData(content)}\n</untrusted_data>`;
}

/** Mime types sent to the model as text (escaped inside a data block). */
export function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    /^application\/(json|xml|javascript|typescript|x-yaml|yaml|toml|x-sh|sql|csv|x-ndjson|ld\+json)$/.test(mime) ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  );
}

/** Mime types Gemini accepts inline as binary parts. */
export function isInlineMime(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/") || mime === "application/pdf";
}

export interface FilePayload {
  /** Index-based label so file names (user input) never appear in attributes. */
  label: string;
  name: string;
  mime: string;
  bytes: Buffer;
}

/**
 * Builds the parts for one file. The file's metadata goes in a data block;
 * text files are decoded and escaped into it; binaries follow as an inline
 * part announced by the block, so the model can tell which file it is.
 */
export function fileParts(kind: string, f: FilePayload): ModelPart[] {
  if (isTextMime(f.mime)) {
    const meta = { name: f.name, mime: f.mime, bytes: f.bytes.length, content: f.bytes.toString("utf8") };
    return [{ text: dataBlock(kind, f.label, meta) }];
  }
  const meta = { name: f.name, mime: f.mime, bytes: f.bytes.length, content: "attached as the next part" };
  if (isInlineMime(f.mime)) {
    return [{ text: dataBlock(kind, f.label, meta) }, { inlineData: { mimeType: f.mime, data: f.bytes.toString("base64") } }];
  }
  const skipped = { name: f.name, mime: f.mime, bytes: f.bytes.length, content: "not readable by the verifier" };
  return [{ text: dataBlock(kind, f.label, skipped) }];
}
