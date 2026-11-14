"use client";

import { useCallback, useState } from "react";
import type { IUmbraSigner } from "@umbra-privacy/sdk";

import {
  fundStealthIdentity,
  privatizeEarnings,
  claimStealthNotes,
  type ConfidentialStep,
  type StealthIdentity,
} from "@/lib/umbra";

const STEP_LABELS: Record<ConfidentialStep, string> = {
  registering: "Preparing your private account",
  shielding: "Shielding funds",
  "creating-note": "Writing an unlinkable transfer",
  scanning: "Scanning for incoming notes",
  burning: "Claiming funds",
  unshielding: "Releasing to the payment address",
  done: "Done",
};

export interface ConfidentialProgress {
  step: ConfidentialStep;
  label: string;
  detail?: string;
}

/**
 * Drives the Umbra flows and surfaces their progress.
 *
 * These flows are slow -- each leg generates a Groth16 proof in a Web Worker
 * and waits on Arcium, so a full funding run is tens of seconds. The UI has to
 * show step-by-step progress or it reads as a hang, which is why every call
 * threads a reporter rather than just returning a promise.
 */
export function useConfidentialPayments() {
  const [progress, setProgress] = useState<ConfidentialProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const report = useCallback((step: ConfidentialStep, detail?: string) => {
    setProgress({ step, label: STEP_LABELS[step], detail });
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * Funds a fresh stealth identity for a gig. The returned signer is the
   * account that must create and fund the gig on-chain -- escrow ties the
   * payer to the gig creator, so the two cannot be different accounts.
   */
  const fundConfidentially = useCallback(
    (params: {
      payer: IUmbraSigner;
      mint: string;
      amount: bigint;
      gigRef: string;
      /** See `fundStealthIdentity`'s doc comment: deliberately not defaulted. */
      prepareStealthGas: (stealthAddress: string) => Promise<void>;
    }): Promise<StealthIdentity | null> =>
      run(() => fundStealthIdentity({ ...params, onProgress: report })),
    [run, report],
  );

  /** Post-payout: makes a freelancer's earnings untraceable onward. */
  const privatizePayout = useCallback(
    (params: {
      freelancer: IUmbraSigner;
      destination: string;
      mint: string;
      amount: bigint;
    }) => run(() => privatizeEarnings({ ...params, onProgress: report })),
    [run, report],
  );

  /** Claims any stealth notes waiting for `recipient`. */
  const claimIncoming = useCallback(
    (recipient: IUmbraSigner) =>
      run(() => claimStealthNotes({ recipient, onProgress: report })),
    [run, report],
  );

  return {
    busy,
    progress,
    error,
    fundConfidentially,
    privatizePayout,
    claimIncoming,
    reset: () => {
      setProgress(null);
      setError(null);
    },
  };
}
