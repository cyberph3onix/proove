"use client";

import { useEffect } from "react";
import { useChainStore } from "@/lib/mock/store";
import { isChainMode } from "@/lib/chain/mode";
import ChainProviders from "@/components/wallet/wallet-provider";
import { ChainSync } from "@/components/wallet/chain-sync";
import { Toaster } from "./toaster";
import { DevPanel } from "./dev-panel";

/**
 * Mock mode: rehydrate the persisted chain (or seed it), run the keeper and
 * mount the dev panel. Chain mode: Privy + wallet-adapter, then mirror the
 * indexer/RPC into the same store.
 */
function MockProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const store = useChainStore;
    Promise.resolve(store.persist.rehydrate()).finally(() => store.getState().init());
    const id = setInterval(() => store.getState().tick(), 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {children}
      <Toaster />
      <DevPanel />
    </>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  if (isChainMode) {
    return (
      <ChainProviders>
        <ChainSync>
          {children}
          <Toaster />
        </ChainSync>
      </ChainProviders>
    );
  }
  return <MockProviders>{children}</MockProviders>;
}
