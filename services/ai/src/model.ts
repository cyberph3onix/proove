/**
 * The one seam between the service and a model provider. Production uses
 * GeminiModelClient; tests use a fake that returns scripted output.
 */

export type ModelPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface ModelRequest {
  model: string;
  systemInstruction: string;
  parts: ModelPart[];
  /** JSON Schema the provider must constrain its output to. */
  responseJsonSchema: Record<string, unknown>;
  timeoutMs: number;
}

export interface ModelResponse {
  /** Raw JSON text produced by the model. Untrusted until validated. */
  text: string;
  modelVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelClient {
  generate(req: ModelRequest): Promise<ModelResponse>;
}

/** Used when no API key is configured: every AI job reports "unavailable". */
export class UnavailableModelClient implements ModelClient {
  async generate(): Promise<ModelResponse> {
    throw new Error("model unavailable: GEMINI_API_KEY is not set");
  }
}
