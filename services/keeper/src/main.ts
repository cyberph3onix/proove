// Entry point: `tsx src/main.ts [--once] [--dry-run]`.
import { Connection } from "@solana/web3.js";
import { loadEnv } from "./env";
import { tick } from "./keeper";
import { loadKeypair } from "./keypair";
import { createLogger } from "./log";

async function main() {
  const env = loadEnv();
  const log = createLogger(env.logLevel, { service: "keeper" });
  const payer = loadKeypair(env.keypairPath);
  const rpc = new Connection(env.cluster.rpcUrl, { commitment: env.commitment, wsEndpoint: env.cluster.wsUrl });
  const opts = {
    dryRun: env.dryRun,
    maxAttempts: env.maxAttempts,
    backoffMs: env.backoffMs,
    priorityFeeMicroLamports: env.priorityFeeMicroLamports,
    commitment: env.commitment,
  };
  log.info("start", {
    cluster: env.cluster.cluster,
    rpc: env.cluster.rpcUrl,
    payer: payer.publicKey.toBase58(),
    intervalSec: env.intervalSec,
    once: env.once,
    dryRun: env.dryRun,
  });

  const runOnce = async () => {
    try {
      const r = await tick(rpc, payer, opts, log);
      const counts: Record<string, number> = {};
      for (const x of r.results) counts[x.result.status] = (counts[x.result.status] ?? 0) + 1;
      log.info("tick done", { now: r.now, ...counts });
      return true;
    } catch (e) {
      log.error("tick failed", { error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  };

  if (env.once) {
    process.exitCode = (await runOnce()) ? 0 : 1;
    return;
  }

  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  const stop = () => {
    stopping = true;
    if (timer) clearTimeout(timer);
    log.info("stopping");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Ticks never overlap: the next one is scheduled after the previous finishes.
  const loop = async () => {
    if (stopping) return;
    await runOnce();
    if (!stopping) timer = setTimeout(loop, env.intervalSec * 1000);
  };
  await loop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
