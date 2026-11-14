import type { Criterion, MilestoneSpec } from "@proove/types/types";
import { dataBlock, fileParts } from "./data-block";
import type { ModelPart } from "./model";
import type { LoadedPrompt } from "./prompts";
import { OutputRejected } from "./run-job";
import { decodeContent } from "./content";
import type { ScopeCompileRequest, ScopeModelOutput } from "./schemas";

/** Same shape as `ScopeResult` in apps/web/src/lib/mock/ai.ts. */
export interface ScopeResult {
  category: string;
  title: string;
  milestones: { title: string; amount: number; deliverables: MilestoneSpec["deliverables"]; criteria: Criterion[] }[];
  model: string;
  prompt_version: string;
}

/** The mock's fallback when neither the request nor the brief states a budget. */
export const DEFAULT_BUDGET_USDC = 500;

export function buildScopePrompt(prompt: LoadedPrompt, req: ScopeCompileRequest): { systemInstruction: string; parts: ModelPart[] } {
  const parts: ModelPart[] = [{ text: prompt.template.task }, { text: dataBlock("brief", "brief", req.brief) }];
  if (req.budgetUsdc !== undefined) {
    // A number we validated, not user prose; still delivered as data.
    parts.push({ text: dataBlock("budget", "budget_usdc", req.budgetUsdc) });
  }
  (req.attachments ?? []).forEach((a, i) => {
    parts.push(...fileParts("attachment", { label: `attachment-${i + 1}`, name: a.name, mime: a.mime, bytes: decodeContent(a.content) }));
  });
  return { systemInstruction: prompt.template.system, parts };
}

/**
 * Turns validated model output into a ScopeResult. Ids are assigned here,
 * not by the model; amounts come from normalised shares of the budget, with
 * the rounding remainder on the last milestone so they add up exactly.
 */
export function finalizeScope(out: ScopeModelOutput, req: ScopeCompileRequest, model: string, promptHash: string): ScopeResult {
  const budget = req.budgetUsdc ?? out.budget_usdc ?? DEFAULT_BUDGET_USDC;
  const totalShare = out.milestones.reduce((s, m) => s + m.share, 0);
  if (!(totalShare > 0)) throw new OutputRejected("milestone shares must be positive");
  let allocated = 0;
  const milestones = out.milestones.map((m, mi) => {
    const last = mi === out.milestones.length - 1;
    const amount = last ? Math.round((budget - allocated) * 100) / 100 : Math.round(budget * (m.share / totalShare));
    allocated += amount;
    return {
      title: m.title,
      amount,
      deliverables: m.deliverables.map((d, di) => ({ id: `d${di + 1}`, kind: d.kind, format: d.format })),
      criteria: m.criteria.map((c, ci): Criterion => {
        const criterion: Criterion = { id: `c${ci + 1}`, text: c.text, check: c.check };
        if (c.weight !== undefined) criterion.weight = c.weight;
        if (c.check === "sampled") {
          criterion.sample_size = c.sample_size ?? 50;
          criterion.pass_threshold = c.pass_threshold ?? 0.9;
        }
        if (c.hard_to_test) criterion.hard_to_test = true;
        return criterion;
      }),
    };
  });
  if (milestones.some((m) => m.amount < 0)) throw new OutputRejected("milestone amounts must not be negative");
  return { category: out.category, title: out.title.slice(0, 80), milestones, model, prompt_version: promptHash };
}
