/**
 * Prints the hash of every prompt template. Approving a prompt means adding
 * its hash to allowlist.json (and, from Phase 2, to AiRegistry on-chain).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPrompt, PROMPTS_DIR, PromptTemplateSchema } from "../src/prompts";

for (const file of readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".json")).sort()) {
  const t = PromptTemplateSchema.parse(JSON.parse(readFileSync(join(PROMPTS_DIR, file), "utf8")));
  console.log(`${t.job}\tv${t.version}\t${hashPrompt(t)}\t${file}`);
}
