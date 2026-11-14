"use client";

import { useEffect, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { useWallets as usePrivySolanaWallets } from "@privy-io/react-auth/solana";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";
import { PRIVY_APP_ID, privyConfig } from "@/lib/privy/config";
import { PrivyEmbeddedWalletAdapter } from "@/lib/wallet/privy-solana-adapter";

/**
 * Privy's embedded wallet lives outside wallet-adapter-react entirely, so
 * without this every useWallet() call site in the app (dashboard, gig
 * actions, the anchor program client) would see publicKey: null even after a
 * successful Privy sign-in. This wraps it in a SignerWalletAdapter and keeps
 * it selected so the rest of the app can keep using useWallet() unchanged.
 */
function PrivyWalletBridge({ adapter }: { adapter: PrivyEmbeddedWalletAdapter | null }) {
  const { select, disconnect, connected } = useWallet();

  useEffect(() => {
    if (adapter) {
      select(adapter.name);
    } else if (connected) {
      disconnect().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter?.publicKey.toBase58()]);

  return null;
}

function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const { wallets: privyWallets } = usePrivySolanaWallets();
  const solanaWallet = privyWallets[0] ?? null;

  const adapter = useMemo(
    () => (solanaWallet ? new PrivyEmbeddedWalletAdapter(solanaWallet) : null),
    [solanaWallet],
  );
  const wallets = useMemo(() => (adapter ? [adapter] : []), [adapter]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <PrivyWalletBridge adapter={adapter} />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// Privy's embedded-wallet bootstrapping (@privy-io/react-auth@3.35.2) replays
// queued event subscriptions against its internal wallet-provider proxy on
// mount, and that proxy doesn't always implement `.on` -- throwing an
// unhandled rejection that doesn't affect auth or wallet state, just noisy in
// dev. It fires during PrivyProvider's own init effect, which (as a child of
// AppProviders) runs *before* a useEffect placed in AppProviders would --
// so the listener has to be registered at module load, not via a hook.
// No fixed release exists upstream yet; swallow this specific signature.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof TypeError && event.reason.message.includes("walletProvider?.on is not a function")) {
      event.preventDefault();
    }
  });
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <SolanaProvider>{children}</SolanaProvider>
    </PrivyProvider>
  );
}
