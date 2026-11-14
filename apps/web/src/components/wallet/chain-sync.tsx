"use client";

import { useEffect, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { emptyState } from "@/lib/mock/seed";
import { useChainStore } from "@/lib/mock/store";
import { syncChain } from "@/lib/chain/sync";
import { storedRole } from "@/lib/chain/mode";

export const CHAIN_REFRESH_EVENT = "proove:chain-refresh";

/**
 * Keeps the chain-mode mirror fresh. Everything downstream reads the store,
 * so one sync updates every page. A short poll catches indexer lag after a
 * transaction; the tx runner also fires CHAIN_REFRESH_EVENT for immediate
 * refreshes.
 */
export function ChainSync({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const mine = ++seq.current;
      try {
        const { state } = await syncChain(connection, publicKey?.toBase58() ?? null);
        if (cancelled || mine !== seq.current) return;
        useChainStore.getState().hydrate(state);
        useChainStore.getState().setPersona(publicKey?.toBase58() ?? null, storedRole());
      } catch (err) {
        console.error("chain sync failed", err);
        if (cancelled || mine !== seq.current) return;
        if (!useChainStore.getState().hydrated) {
          useChainStore.getState().hydrate(emptyState(Math.floor(Date.now() / 1000)));
        }
      }
    };

    void run();
    const id = setInterval(run, 10_000);
    window.addEventListener(CHAIN_REFRESH_EVENT, run);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(CHAIN_REFRESH_EVENT, run);
    };
  }, [connection, publicKey]);

  return <>{children}</>;
}
