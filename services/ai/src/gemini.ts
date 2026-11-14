import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import type { ModelClient, ModelRequest, ModelResponse } from "./model";

/**
 * Maps a ModelRequest to Gemini generateContent parameters. Kept pure so the
 * no-retention and structured-output settings are unit-tested.
 *
 * `config.store: false` is GenerateContentConfig.store in @google/genai
 * ("Configures the logging behavior for a given request. If set, it takes
 * precedence over the project-level logging config."). It is set on every
 * call so the provider does not retain requests or responses.
 */
export function toGeminiParams(req: ModelRequest): GenerateContentParameters {
  return {
    model: req.model,
    contents: [{ role: "user", parts: req.parts }],
    config: {
      store: false,
      systemInstruction: req.systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: req.responseJsonSchema,
      temperature: 0,
      candidateCount: 1,
      abortSignal: AbortSignal.timeout(req.timeoutMs),
    },
  };
}

export class GeminiModelClient implements ModelClient {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(req: ModelRequest): Promise<ModelResponse> {
    const res = await this.ai.models.generateContent(toGeminiParams(req));
    const text = res.text;
    if (!text) throw new Error("model returned no text");
    return {
      text,
      modelVersion: res.modelVersion,
      inputTokens: res.usageMetadata?.promptTokenCount,
      outputTokens: res.usageMetadata?.candidatesTokenCount,
    };
  }
}
