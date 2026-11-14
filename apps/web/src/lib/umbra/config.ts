/**
 * Umbra network configuration.
 *
 * Umbra is Arcium-backed: shielding moves tokens from a public ATA into an
 * EncryptedTokenAccount (ETA), and the Stealth Pool lets a note be written by
 * one wallet and burned by another with no on-chain link between them.
 *
 * Everything here is devnet-first. Mainnet endpoints are included so the shape
 * is right, but PayGig has only ever been exercised against devnet.
 */

export type UmbraNetwork = "devnet" | "mainnet";

export const UMBRA_NETWORK: UmbraNetwork =
  (process.env.NEXT_PUBLIC_UMBRA_NETWORK as UmbraNetwork) ?? "devnet";

export interface UmbraEndpoints {
  rpcUrl: string;
  rpcSubscriptionsUrl: string;
  indexerApiEndpoint: string;
  relayerApiEndpoint: string;
}

export const UMBRA_ENDPOINTS: Record<UmbraNetwork, UmbraEndpoints> = {
  devnet: {
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
    rpcSubscriptionsUrl:
      process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    relayerApiEndpoint: "https://relayer.api-devnet.umbraprivacy.com",
  },
  mainnet: {
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    rpcSubscriptionsUrl:
      process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.mainnet-beta.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api.umbraprivacy.com",
    relayerApiEndpoint: "https://relayer.api.umbraprivacy.com",
  },
};

/**
 * Mints Umbra supports, per network.
 *
 * This is the hard constraint on Confidential Mode: a gig can only be funded
 * confidentially if its mint is in this list. Umbra's devnet coverage is much
 * narrower than mainnet's, so the toggle is disabled for anything else rather
 * than failing halfway through a shield.
 */
export const UMBRA_SUPPORTED_MINTS: Record<UmbraNetwork, Record<string, string>> = {
  devnet: {
    // Umbra's own devnet test USDC, from the SDK quickstart.
    dUSDC: "4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7",
    wSOL: "So11111111111111111111111111111111111111112",
  },
  mainnet: {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    wSOL: "So11111111111111111111111111111111111111112",
  },
};

export function endpoints(network: UmbraNetwork = UMBRA_NETWORK): UmbraEndpoints {
  return UMBRA_ENDPOINTS[network];
}

export function isConfidentialMintSupported(
  mint: string,
  network: UmbraNetwork = UMBRA_NETWORK,
): boolean {
  return Object.values(UMBRA_SUPPORTED_MINTS[network]).includes(mint);
}

export function supportedMintList(network: UmbraNetwork = UMBRA_NETWORK) {
  return Object.entries(UMBRA_SUPPORTED_MINTS[network]).map(([symbol, mint]) => ({
    symbol,
    mint,
  }));
}
