import type { z } from "zod";
import { sha256Hex } from "@proove/types/hash";
import type { ModelClient, ModelPart } from "./model";
import { toResponseJsonSchema } from "./schemas";

/** Output that parsed but broke a rule the schema cannot express. */
export class OutputRejected extends Error {}

/** The job could not produce valid output; the caller answers "unavailable". */
export class JobUnavailable extends Error {
  constructor(readonly attempts: AttemptLog[]) {
    super("model output unavailable");
  }
}

/** What one attempt leaves in the logs: hashes, sizes and timings only. */
export interface AttemptLog {
  attempt: number;
  ok: boolean;
  /** "model_error" | "invalid_json" | "schema" | "rejected" */
  failure?: string;
  output_hash?: string;
  output_bytes?: number;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms: number;
}

export interface JobResult<T> {
  output: T;
  modelVersion?: string;
  attempts: AttemptLog[];
}

/**
 * Calls the model and accepts only output that is valid JSON, passes the zod
 * schema and passes `check`. Anything else is retried, then the job is
 * unavailable. Nothing the model says is used unless it validated.
 */
export async function runJob<S extends z.ZodType, R>(opts: {
  client: ModelClient;
  model: string;
  systemInstruction: string;
  parts: ModelPart[];
  schema: S;
  check: (output: z.infer<S>) => R;
  retries: number;
  timeoutMs: number;
}): Promise<JobResult<R>> {
  const responseJsonSchema = toResponseJsonSchema(opts.schema);
  const attempts: AttemptLog[] = [];
  for (let attempt = 1; attempt <= opts.retries + 1; attempt++) {
    const started = performance.now();
    const log: AttemptLog = { attempt, ok: false, latency_ms: 0 };
    attempts.push(log);
    let res: Awaited<ReturnType<ModelClient["generate"]>>;
    try {
      res = await opts.client.generate({
        model: opts.model,
        systemInstruction: opts.systemInstruction,
        parts: opts.parts,
        responseJsonSchema,
        timeoutMs: opts.timeoutMs,
      });
    } catch {
      log.failure = "model_error";
      log.latency_ms = Math.round(performance.now() - started);
      continue;
    }
    log.latency_ms = Math.round(performance.now() - started);
    log.output_hash = sha256Hex(res.text);
    log.output_bytes = Buffer.byteLength(res.text);
    log.input_tokens = res.inputTokens;
    log.output_tokens = res.outputTokens;

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      log.failure = "invalid_json";
      continue;
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      log.failure = "schema";
      continue;
    }
    try {
      const output = opts.check(parsed.data);
      log.ok = true;
      return { output, modelVersion: res.modelVersion, attempts };
    } catch (err) {
      if (!(err instanceof OutputRejected)) throw err;
      log.failure = "rejected";
    }
  }
  throw new JobUnavailable(attempts);
}
