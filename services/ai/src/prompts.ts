import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { hashDocument } from "@proove/types/hash";

/**
 * Versioned prompt templates and the allow-list that gates them.
 *
 * A prompt's hash is the SHA-256 of its RFC 8785 canonical JSON (the whole
 * template file), so anyone can recompute it from the repo. The service
 * refuses to run a prompt or model that is not in `allowlist.json`. In
 * Phase 2 the allow-list moves on-chain into `AiRegistry`; this file is the
 * static stand-in.
 */

export const JOBS = ["scope", "verify"] as const;
export type Job = (typeof JOBS)[number];

export const PromptTemplateSchema = z.object({
  job: z.enum(JOBS),
  version: z.int().min(1),
  system: z.string().min(1),
  task: z.string().min(1),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const AllowlistSchema = z.object({
  prompts: z.record(z.enum(JOBS), z.array(z.string().regex(/^[0-9a-f]{64}$/))),
  models: z.record(z.enum(JOBS), z.array(z.string().min(1))),
});
export type Allowlist = z.infer<typeof AllowlistSchema>;

export interface LoadedPrompt {
  template: PromptTemplate;
  hash: string;
  file: string;
}

export const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PROMPTS_DIR = join(PACKAGE_ROOT, "prompts");
export const ALLOWLIST_FILE = join(PACKAGE_ROOT, "allowlist.json");

export function hashPrompt(template: PromptTemplate): string {
  return hashDocument(template);
}

/** Loads every prompt file; the active prompt per job is the highest version. */
export function loadPrompts(dir = PROMPTS_DIR): Map<Job, LoadedPrompt> {
  const active = new Map<Job, LoadedPrompt>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const template = PromptTemplateSchema.parse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    const current = active.get(template.job);
    if (!current || template.version > current.template.version) {
      active.set(template.job, { template, hash: hashPrompt(template), file });
    }
  }
  return active;
}

export function loadAllowlist(file = ALLOWLIST_FILE): Allowlist {
  return AllowlistSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export class NotApprovedError extends Error {
  constructor(
    readonly job: Job,
    readonly reason: "prompt" | "model",
  ) {
    super(`${reason} for job "${job}" is not in the allow-list`);
  }
}

/**
 * Resolves the approved prompt and model for each job. A job whose prompt
 * hash or model ID is not approved is kept out of the registry, and every
 * attempt to run it throws NotApprovedError.
 */
export class PromptRegistry {
  private readonly approved = new Map<Job, LoadedPrompt>();
  readonly rejected: { job: Job; reason: "prompt" | "model"; hash?: string; model?: string }[] = [];

  constructor(
    prompts: Map<Job, LoadedPrompt>,
    allowlist: Allowlist,
    private readonly models: Record<Job, string>,
  ) {
    for (const job of JOBS) {
      const p = prompts.get(job);
      if (!p || !(allowlist.prompts[job] ?? []).includes(p.hash)) {
        this.rejected.push({ job, reason: "prompt", hash: p?.hash });
        continue;
      }
      if (!(allowlist.models[job] ?? []).includes(models[job])) {
        this.rejected.push({ job, reason: "model", model: models[job] });
        continue;
      }
      this.approved.set(job, p);
    }
  }

  get(job: Job): { prompt: LoadedPrompt; model: string } {
    const prompt = this.approved.get(job);
    if (!prompt) {
      const r = this.rejected.find((x) => x.job === job);
      throw new NotApprovedError(job, r?.reason ?? "prompt");
    }
    return { prompt, model: this.models[job] };
  }

  status(): Record<Job, { approved: boolean; prompt_hash?: string; model: string }> {
    const out = {} as Record<Job, { approved: boolean; prompt_hash?: string; model: string }>;
    for (const job of JOBS) {
      const p = this.approved.get(job);
      out[job] = { approved: Boolean(p), prompt_hash: p?.hash, model: this.models[job] };
    }
    return out;
  }
}
