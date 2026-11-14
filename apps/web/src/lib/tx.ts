"use client";

import { useCallback, useRef, useState } from "react";
import { create } from "zustand";
import type { TxPhase } from "@/lib/domain/types";
import { useChainStore } from "@/lib/mock/store";
import { ProgramError, type InstructionArgs, type InstructionName } from "@/lib/mock/instructions";

/**
 * Transaction lifecycle: idle → signing → sent → confirmed → finalized | failed.
 * UI motion keys off these phases: success animations start only at
 * `confirmed`, so nothing ever shows money moving that hasn't moved.
 *
 * In mock mode the instruction is preflighted (like a simulation), then
 * applied at `confirmed`. In chain mode this hook will wrap
 * sendTransaction + confirmTransaction with the same phases.
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
  return e instanceof Error ? e.message : String(e);
}

export function useTransaction() {
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async <K extends InstructionName>(name: K, args: InstructionArgs<K>, label?: string): Promise<{ ok: boolean; result?: unknown }> => {
    if (running.current) return { ok: false };
    running.current = true;
    const store = useChainStore.getState();
    const latency = store.chain.dev.txLatency;
    const id = ++toastSeq;
    const toast = useToasts.getState();
    const text = label ?? String(name);
    const update = (p: TxPhase, err?: string) => {
      setPhase(p);
      toast.upsert({ id, label: text, phase: p, error: err });
    };
    setError(null);
    try {
      update("signing");
      store.simulate(name, args);
      await sleep(latency);
      if (useChainStore.getState().chain.dev.failNextTx) {
        useChainStore.getState().setDev({ failNextTx: false });
        throw new Error("Transaction expired: blockhash not found (injected failure)");
      }
      update("sent");
      await sleep(latency);
      const result = useChainStore.getState().exec(name, args);
      update("confirmed");
      setTimeout(() => {
        update("finalized");
        setTimeout(() => useToasts.getState().dismiss(id), 2200);
      }, 900);
      return { ok: true, result };
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      update("failed", msg);
      setTimeout(() => useToasts.getState().dismiss(id), 6000);
      return { ok: false };
    } finally {
      running.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, run, reset, busy: phase === "signing" || phase === "sent" };
}

export const PHASE_LABEL: Record<TxPhase, string> = {
  idle: "",
  signing: "Waiting for signature…",
  sent: "Sent, confirming…",
  confirmed: "Confirmed",
  finalized: "Finalized",
  failed: "Failed",
};
