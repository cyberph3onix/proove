import { loadConfig } from "./config";
import { GeminiModelClient } from "./gemini";
import { UnavailableModelClient } from "./model";
import { loadAllowlist, loadPrompts, PromptRegistry } from "./prompts";
import { buildServer } from "./server";

const config = loadConfig();
const registry = new PromptRegistry(loadPrompts(), loadAllowlist(), config.models);
const model = config.geminiApiKey ? new GeminiModelClient(config.geminiApiKey) : new UnavailableModelClient();
const app = buildServer({ config, model, registry });

if (!config.geminiApiKey) app.log.warn({ event: "startup", gemini: "no GEMINI_API_KEY; AI jobs will answer 503" });
for (const r of registry.rejected) {
  app.log.error({ event: "startup", job: r.job, not_approved: r.reason, prompt_hash: r.hash, model: r.model });
}
app.log.info({ event: "startup", jobs: registry.status() });

await app.listen({ host: config.host, port: config.port });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
