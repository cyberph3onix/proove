import type { PrivyClientConfig } from "@privy-io/react-auth";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export const privyConfig: PrivyClientConfig = {
  appearance: {
    theme: "dark",
    accentColor: "#FF6FAF",
    logo: undefined,
  },
  loginMethods: ["email", "google"],
  embeddedWallets: {
    solana: {
      createOnLogin: "users-without-wallets",
    },
  },
  // We only ever use Privy's embedded wallet (email/Google sign-in), never an
  // external wallet connection. The WalletConnect connector Privy bootstraps
  // on mount by default throws "this.walletProvider?.on is not a function" as
  // an unhandled rejection (a bug in @privy-io/react-auth@3.35.2,
  // reproducible with zero browser extensions installed). Disabling it here
  // avoids that crash. (`externalWallets.disableAllExternalWallets` also
  // "fixes" this, but it wedges Privy's overall wallets-ready flag at false
  // forever, which breaks embedded-wallet detection too -- don't use it.)
  externalWallets: {
    walletConnect: {
      enabled: false,
    },
  },
};
