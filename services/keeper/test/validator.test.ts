// Optional: a dry-run tick against a local validator with the escrow program
// deployed. Skips unless one answers at KEEPER_TEST_RPC (default 127.0.0.1:8899).
import { describe, expect, it } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { ESCROW_PROGRAM_ID } from "../src/accounts";
import { tick } from "../src/keeper";
import { silentLogger } from "../src/log";

const url = process.env.KEEPER_TEST_RPC ?? "http://127.0.0.1:8899";

async function available(): Promise<boolean> {
  try {
    const conn = new Connection(url, "confirmed");
    const info = await Promise.race([
      conn.getAccountInfo(ESCROW_PROGRAM_ID),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500)),
    ]);
    return !!info?.executable;
  } catch {
    return false;
  }
}

const up = await available();
if (!up) console.warn(`[keeper tests] no validator with the escrow program at ${url}; skipping validator test`);

describe.skipIf(!up)("validator (dry-run)", () => {
  it("scans the escrow program and reads the cluster clock", async () => {
    const conn = new Connection(url, "confirmed");
    const r = await tick(conn, Keypair.generate(), { dryRun: true, maxAttempts: 1, backoffMs: 0, priorityFeeMicroLamports: 0, commitment: "confirmed" }, silentLogger);
    const local = BigInt(Math.floor(Date.now() / 1000));
    expect(r.now > local - 3600n && r.now < local + 3600n).toBe(true);
  });
});
