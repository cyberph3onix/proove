import Fastify, { LogController, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { hashDocument } from "@proove/types/hash";
import type { Config } from "./config";
import type { ModelClient } from "./model";
import { NotApprovedError, type Job, type PromptRegistry } from "./prompts";
import { RateLimiter } from "./rate-limit";
import { JobUnavailable, runJob, type AttemptLog } from "./run-job";
import { ScopeCompileRequestSchema, ScopeModelOutputSchema, VerifyModelOutputSchema, VerifyRequestSchema } from "./schemas";
import { buildScopePrompt, finalizeScope } from "./scope";
import { assembleReport, buildVerifyPrompt, checkVerifyOutput, InvalidInput, prepareFiles } from "./verify";

export const WALLET_HEADER = "x-proove-wallet";
const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface ServerDeps {
  config: Config;
  model: ModelClient;
  registry: PromptRegistry;
  /** Where log lines go (tests capture them). Defaults to stdout. */
  logStream?: NodeJS.WritableStream;
  now?: () => number;
}

/**
 * Log lines carry hashes, sizes, timings, token counts and the wallet only.
 * Fastify's own request logging is off, and the error handler logs codes,
 * never messages (JSON parse errors quote the body they failed on).
 */
interface JobLog {
  event: "job";
  job: Job;
  wallet: string;
  status: number;
  outcome: string;
  request_hash?: string;
  request_bytes?: number;
  prompt_hash?: string;
  model?: string;
  document_hash?: string;
  latency_ms: number;
  attempts?: AttemptLog[];
}

function walletOf(req: FastifyRequest): string {
  return String(req.headers[WALLET_HEADER] ?? "");
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config, model, registry } = deps;
  const now = deps.now ?? Date.now;
  const limiter = new RateLimiter(config.rateLimit.capacity, config.rateLimit.refillPerMinute, now);

  const app = Fastify({
    bodyLimit: config.maxPayloadBytes,
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: config.logLevel,
      ...(deps.logStream ? { stream: deps.logStream } : {}),
      // Never log a request body or an error message; methods, routes and codes only.
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  });

  // Reject before the body is read: size first, then identity, then rate.
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/v1/")) return;
    const length = Number(req.headers["content-length"] ?? 0);
    if (length > config.maxPayloadBytes) {
      return reply.code(413).send({ error: "payload_too_large", limit_bytes: config.maxPayloadBytes });
    }
    const wallet = walletOf(req);
    if (!WALLET_RE.test(wallet)) {
      return reply.code(401).send({ error: "wallet_required", header: WALLET_HEADER });
    }
    const wait = limiter.take(wallet);
    if (wait > 0) {
      return reply.code(429).header("retry-after", String(wait)).send({ error: "rate_limited", retry_after_s: wait });
    }
  });

  app.setErrorHandler((err: Error & { code?: string; statusCode?: number }, req, reply) => {
    req.log.warn({ event: "error", code: err.code ?? err.name, status: err.statusCode ?? 500, wallet: walletOf(req) });
    if (err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({ error: "payload_too_large", limit_bytes: config.maxPayloadBytes });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: "bad_request", code: err.code ?? "invalid_body" });
    }
    return reply.code(500).send({ error: "internal" });
  });

  app.get("/healthz", async () => ({ ok: true, jobs: registry.status() }));

  /** Shared wrapper: validation, approval, model call, logging, error mapping. */
  async function handle<T>(
    job: Job,
    req: FastifyRequest,
    reply: FastifyReply,
    schema: z.ZodType<T>,
    run: (body: T, approved: ReturnType<PromptRegistry["get"]>) => Promise<{ doc: unknown; attempts: AttemptLog[] }>,
  ) {
    const started = performance.now();
    const log: JobLog = { event: "job", job, wallet: walletOf(req), status: 0, outcome: "", latency_ms: 0 };
    const finish = (status: number, outcome: string, body: unknown) => {
      log.status = status;
      log.outcome = outcome;
      log.latency_ms = Math.round(performance.now() - started);
      req.log.info(log);
      return reply.code(status).send(body);
    };

    log.request_bytes = Number(req.headers["content-length"] ?? 0) || undefined;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      // Paths and codes only: messages can quote the rejected input.
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.code }));
      return finish(400, "invalid_request", { error: "invalid_request", issues });
    }
    log.request_hash = hashDocument(parsed.data);

    let approved: ReturnType<PromptRegistry["get"]>;
    try {
      approved = registry.get(job);
    } catch (err) {
      if (!(err instanceof NotApprovedError)) throw err;
      return finish(503, `not_approved_${err.reason}`, { error: "unavailable", reason: `${err.reason}_not_approved` });
    }
    log.prompt_hash = approved.prompt.hash;
    log.model = approved.model;

    try {
      const { doc, attempts } = await run(parsed.data, approved);
      log.attempts = attempts;
      log.document_hash = hashDocument(doc);
      reply.header("x-proove-document-hash", log.document_hash);
      reply.header("x-proove-prompt-hash", approved.prompt.hash);
      reply.header("x-proove-model", approved.model);
      return finish(200, "ok", doc);
    } catch (err) {
      if (err instanceof InvalidInput) {
        return finish(422, "invalid_input", { error: "invalid_input", message: err.message });
      }
      if (err instanceof JobUnavailable) {
        log.attempts = err.attempts;
        const reason = err.attempts.every((a) => a.failure === "model_error") ? "model_error" : "model_output_invalid";
        return finish(503, "model_unavailable", { error: "unavailable", reason });
      }
      throw err;
    }
  }

  app.post("/v1/scope/compile", (req, reply) =>
    handle("scope", req, reply, ScopeCompileRequestSchema, async (body, { prompt, model: modelId }) => {
      const { systemInstruction, parts } = buildScopePrompt(prompt, body);
      const result = await runJob({
        client: model,
        model: modelId,
        systemInstruction,
        parts,
        schema: ScopeModelOutputSchema,
        check: (out) => finalizeScope(out, body, modelId, prompt.hash),
        retries: config.modelRetries,
        timeoutMs: config.modelTimeoutMs,
      });
      return { doc: result.output, attempts: result.attempts };
    }),
  );

  app.post("/v1/delivery/verify", (req, reply) =>
    handle("verify", req, reply, VerifyRequestSchema, async (body, { prompt, model: modelId }) => {
      const files = prepareFiles(body);
      const { systemInstruction, parts } = buildVerifyPrompt(prompt, body, files);
      const result = await runJob({
        client: model,
        model: modelId,
        systemInstruction,
        parts,
        schema: VerifyModelOutputSchema,
        check: (out) => checkVerifyOutput(out, body, files),
        retries: config.modelRetries,
        timeoutMs: config.modelTimeoutMs,
      });
      const report = assembleReport({ req: body, ...result.output, model: modelId, promptHash: prompt.hash, now });
      return { doc: report, attempts: result.attempts };
    }),
  );

  return app;
}
