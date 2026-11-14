import { z } from "zod";
import type { Criterion, DeliveryFile, MilestoneSpec } from "@proove/types/types";

// ─── Shared document pieces (mirror @proove/types) ──────────────────────────

const hash = z.string().regex(/^[0-9a-f]{64}$/, "lowercase hex sha-256");
const address = z.string().min(1).max(64);

export const CriterionSchema = z.object({
  id: z.string().min(1).max(32),
  text: z.string().min(1).max(2000),
  check: z.enum(["automatic", "sampled", "manual"]),
  weight: z.number().min(0).max(100).optional(),
  sample_size: z.int().min(1).max(10_000).optional(),
  pass_threshold: z.number().min(0).max(1).optional(),
  hard_to_test: z.boolean().optional(),
});

export const DeliverableSchema = z.object({
  id: z.string().min(1).max(32),
  kind: z.string().min(1).max(64),
  format: z.string().min(1).max(200),
});

export const MilestoneSpecSchema = z.object({
  schema: z.literal("proove.milestone-spec.v1"),
  gig: address,
  index: z.int().min(0),
  title: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+$/),
  mint: address,
  deliverables: z.array(DeliverableSchema).max(50),
  criteria: z.array(CriterionSchema).min(1).max(100),
  deadline: z.int().min(0),
  generated_by: z.object({ model: z.string(), prompt_version: hash }).nullable(),
  edited_by_client: z.boolean(),
});

// ─── Requests ───────────────────────────────────────────────────────────────

const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "base64");

export const FileContentSchema = z.discriminatedUnion("encoding", [
  z.object({ encoding: z.literal("utf8"), data: z.string() }),
  z.object({ encoding: z.literal("base64"), data: base64 }),
]);

/**
 * DeliveryFile (as in the mock) plus, optionally, the plaintext. The service
 * checks the plaintext against `plaintextHash` before the model sees it.
 */
export const DeliveryFileSchema = z.object({
  name: z.string().min(1).max(512),
  size: z.int().min(0),
  mime: z.string().min(1).max(200),
  plaintextHash: hash,
  uri: z.string().max(2048),
  content: FileContentSchema.optional(),
});

export const AttachmentSchema = z.object({
  name: z.string().min(1).max(512),
  mime: z.string().min(1).max(200),
  content: FileContentSchema,
});

export const ScopeCompileRequestSchema = z.object({
  brief: z.string().trim().min(1).max(50_000),
  budgetUsdc: z.number().positive().max(1e12).optional(),
  attachments: z.array(AttachmentSchema).max(20).optional(),
});

export const VerifyRequestSchema = z.object({
  milestone: address,
  spec: MilestoneSpecSchema,
  files: z.array(DeliveryFileSchema).max(500),
  note: z.string().max(10_000),
  submittedSlot: z.int().min(0),
});

export type ScopeCompileRequest = z.infer<typeof ScopeCompileRequestSchema>;
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

// ─── Model output (untrusted; validated before use) ─────────────────────────

const ModelCriterionSchema = z.object({
  text: z.string().min(1).max(500),
  check: z.enum(["automatic", "sampled", "manual"]),
  weight: z.number().min(0).max(10).optional(),
  sample_size: z.int().min(1).max(1000).optional(),
  pass_threshold: z.number().min(0).max(1).optional(),
  hard_to_test: z.boolean(),
});

export const ScopeModelOutputSchema = z.object({
  category: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  budget_usdc: z.number().positive().nullable(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        share: z.number().positive().max(1),
        deliverables: z
          .array(z.object({ kind: z.string().min(1).max(64), format: z.string().min(1).max(200) }))
          .min(1)
          .max(10),
        criteria: z.array(ModelCriterionSchema).min(1).max(12),
      }),
    )
    .min(1)
    .max(8),
});

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const VerifyModelOutputSchema = z.object({
  findings: z
    .array(
      z.object({
        criterion: z.string().min(1).max(32),
        verdict: z.enum(["pass", "fail", "unclear"]),
        confidence: z.number().min(0).max(1),
        evidence: z
          .array(z.object({ file: z.string().min(1).max(512), locator: z.string().max(200).optional() }))
          .max(20),
        note: z.string().max(1000),
      }),
    )
    .max(100),
  summary: z
    .string()
    .min(1)
    .max(1200)
    .refine((s) => words(s) <= 120, "summary must be at most 120 words"),
});

export type ScopeModelOutput = z.infer<typeof ScopeModelOutputSchema>;
export type VerifyModelOutput = z.infer<typeof VerifyModelOutputSchema>;

/**
 * JSON Schema handed to Gemini as `responseJsonSchema`. Gemini constrains
 * decoding to it; zod re-checks the result anyway.
 */
export function toResponseJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

// Compile-time checks that the request schemas stay assignable to the shared types.
type Assert<T extends true> = T;
export type _SpecMatches = Assert<z.infer<typeof MilestoneSpecSchema> extends MilestoneSpec ? true : false>;
export type _CriterionMatches = Assert<z.infer<typeof CriterionSchema> extends Criterion ? true : false>;
export type _FileMatches = Assert<z.infer<typeof DeliveryFileSchema> extends DeliveryFile ? true : false>;
