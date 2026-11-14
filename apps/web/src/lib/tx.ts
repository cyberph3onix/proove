"use client";

import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { TxPhase } from "@proove/types/types";
import { useChainStore } from "@/lib/mock/store";
import { ProgramError, type InstructionArgs, type InstructionName } from "@/lib/mock/instructions";
import { isChainMode } from "@/lib/chain/mode";
import { chainBuilder } from "@/lib/anchor/actions";
import { useAnchorPrograms } from "@/lib/anchor/client";
import { CHAIN_REFRESH_EVENT } from "@/components/wallet/chain-sync";

/**
 * Transaction lifecycle: idle → signing → sent → confirmed → finalized | failed.
 * UI motion keys off these phases: success animations start only at
 * `confirmed`, so nothing ever shows money moving that hasn't moved.
 *
 * Mock mode preflights and applies the instruction in the store. Chain mode
 * builds real transactions, signs with the connected wallet, confirms each
 * step, then refreshes the indexer mirror.
 */

export interface Toast {
  id: number;
  label: string;
  phase: TxPhase;
  error?: string;
}

interface ToastStore {
  toasts: Toast[];
  upsert: (t: Toast) => void;
  dismiss: (id: number) => void;
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  upsert: (t) =>
    set((st) => {
      const exists = st.toasts.some((x) => x.id === t.id);
      return { toasts: exists ? st.toasts.map((x) => (x.id === t.id ? t : x)) : [...st.toasts, t].slice(-4) };
    }),
  dismiss: (id) => set((st) => ({ toasts: st.toasts.filter((x) => x.id !== id) })),
}));

let toastSeq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function errorMessage(e: unknown): string {
  if (e instanceof ProgramError) return `${e.message} (${e.program}::${e.code})`;
  const anchor = e as { error?: { errorMessage?: string } } | null;
  if (anchor?.error?.errorMessage) return anchor.error.errorMessage;
  return e instanceof Error ? e.message : String(e);
}

type Update = (phase: TxPhase, error?: string) => void;
type Work = (update: Update) => Promise<unknown>;

/** Shared lifecycle + toast bookkeeping. */
function useTxRunner() {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const runWith = useCallback(async (name: string, label: string | undefined, work: Work) => {
    if (running.current) return { ok: false as const };
    running.current = true;
    const id = ++toastSeq;
    const text = label ?? name;
    const update: Update = (p, err) => {
      setPhase(p);
      useToasts.getState().upsert({ id, label: text, phase: p, error: err });
    };
    setError(null);
    try {
      const result = await work(update);
      update("confirmed");
      setTimeout(() => {
        update("finalized");
        setTimeout(() => useToasts.getState().dismiss(id), 2200);
      }, 900);
      return { ok: true as const, result };
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      update("failed", msg);
      setTimeout(() => useToasts.getState().dismiss(id), 6000);
      return { ok: false as const };
    } finally {
      running.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, runWith, reset, busy: phase === "signing" || phase === "sent" };
}

function useMockTransaction() {
  const { phase, error, runWith, reset, busy } = useTxRunner();

  const run = useCallback(
    async <K extends InstructionName>(name: K, args: InstructionArgs<K>, label?: string) =>
      runWith(String(name), label, async (update) => {
        const store = useChainStore.getState();
        const latency = store.chain.dev.txLatency;
        update("signing");
        store.simulate(name, args);
        await sleep(latency);
        if (useChainStore.getState().chain.dev.failNextTx) {
          useChainStore.getState().setDev({ failNextTx: false });
          throw new Error("Transaction expired: blockhash not found (injected failure)");
        }
        update("sent");
        await sleep(latency);
        return useChainStore.getState().exec(name, args);
      }),
    [runWith],
  );

  return { phase, error, run, reset, busy };
}

function useChainTransaction() {
  const programs = useAnchorPrograms();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { phase, error, runWith, reset, busy } = useTxRunner();

  const run = useCallback(
    async <K extends InstructionName>(name: K, args: InstructionArgs<K>, label?: string) =>
      runWith(String(name), label, async (update) => {
        const builder = chainBuilder(name);
        if (!publicKey) throw new Error("Connect a wallet to sign transactions.");
        if (!signTransaction) throw new Error("This wallet cannot sign transactions.");
        if (!builder) throw new Error(`${name} is not available on-chain in Phase 1.`);

        update("signing");
        const plan = await builder(programs, args);

        if (plan.steps.length === 0) {
          update("sent");
          await sleep(200);
          return plan.result;
        }

        let result = plan.result;
        for (const step of plan.steps) {
          if (step.signers?.length) step.tx.partialSign(...step.signers);
          const signed = await signTransaction(step.tx);
          const signature = await connection.sendRawTransaction(signed.serialize(), { maxRetries: 3 });
          update("sent");
          const confirmation = await connection.confirmTransaction(
            { signature, blockhash: step.tx.recentBlockhash!, lastValidBlockHeight: step.lastValidBlockHeight },
            "confirmed",
          );
          if (confirmation.value.err) throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          update("confirmed");
          result = result ?? signature;
        }

        window.dispatchEvent(new Event(CHAIN_REFRESH_EVENT));
        return result;
      }),
    [programs, connection, publicKey, signTransaction, runWith],
  );

  return { phase, error, run, reset, busy };
}

/** Mock or chain implementation, chosen once at module load. */
export const useTransaction = isChainMode ? useChainTransaction : useMockTransaction;

export const PHASE_LABEL: Record<TxPhase, string> = {
  idle: "",
  signing: "Waiting for signature…",
  sent: "Sent, confirming…",
  confirmed: "Confirmed",
  finalized: "Finalized",
  failed: "Failed",
};
