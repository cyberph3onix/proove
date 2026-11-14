"use client";

import { useEffect } from "react";
import { useChainStore } from "@/lib/mock/store";
import { Toaster } from "./toaster";
import { DevPanel } from "./dev-panel";

/**
 * Mock-mode providers: rehydrate the persisted mock chain (or seed it), run
 * the keeper every few seconds, and mount toasts and the dev panel.
 *
 * Chain mode (Phase 1+) will mount Privy + wallet-adapter here instead
 * (see components/wallet/wallet-provider.tsx, kept from v1).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
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
