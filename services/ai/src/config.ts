/**
 * Service configuration, read from the environment only. The Gemini API key
 * is never hardcoded or logged; without it the service still starts and the
 * AI jobs answer 503 "unavailable" (fail open for users, closed for AI).
 */

export const MB = 1024 * 1024;

export interface Config {
  host: string;
  port: number;
  logLevel: string;
  geminiApiKey: string | undefined;
  models: { scope: string; verify: string };
  /** Hard cap on one request body (deliverables included), in bytes. */
  maxPayloadBytes: number;
  rateLimit: { capacity: number; refillPerMinute: number };
  modelTimeoutMs: number;
  /** Extra attempts after the first when the model fails or its output fails validation. */
  modelRetries: number;
}

export const DEFAULT_MODEL = "gemini-3.8-flash";

function int(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${key}: expected a non-negative number`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const shared = env.GEMINI_MODEL || DEFAULT_MODEL;
  return {
    host: env.HOST || "127.0.0.1",
    port: int(env, "PORT", 3200),
    logLevel: env.LOG_LEVEL || "info",
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    models: {
      scope: env.GEMINI_MODEL_SCOPE || shared,
      verify: env.GEMINI_MODEL_VERIFY || shared,
    },
    maxPayloadBytes: int(env, "MAX_PAYLOAD_MB", 200) * MB,
    rateLimit: {
      capacity: int(env, "RATE_LIMIT_BURST", 10),
      refillPerMinute: int(env, "RATE_LIMIT_PER_MINUTE", 6),
    },
    modelTimeoutMs: int(env, "MODEL_TIMEOUT_MS", 120_000),
    modelRetries: int(env, "MODEL_RETRIES", 1),
  };
}
