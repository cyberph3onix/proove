"use client";

import { useMemo } from "react";
import { AnchorProvider, Program, type Wallet } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";

import {
  achievementIdl,
  escrowIdl,
  gigIdl,
  reputationIdl,
  type Achievement,
  type Escrow,
  type Gig,
  type Reputation,
} from "./idls";

export interface AnchorPrograms {
  gig: Program<Gig>;
  escrow: Program<Escrow>;
  reputation: Program<Reputation>;
  achievement: Program<Achievement>;
}

function rejectSigning(): never {
  throw new Error("Connect a wallet to sign transactions.");
}

/**
 * Builds the four program clients. Falls back to a read-only provider (no
 * signer) when no wallet is connected, so account reads work for anyone
 * browsing -- only instruction calls (which the UI already gates on
 * `publicKey` being set) need a real connected wallet.
 */
export function useAnchorPrograms(): AnchorPrograms {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  return useMemo(() => {
    // Anchor's Wallet type requires `payer`, but it's only used for the (unused)
    // NodeWallet.local() path — a throwaway keypair satisfies the type safely.
    const wallet: Wallet =
      publicKey && signTransaction && signAllTransactions
        ? { publicKey, signTransaction, signAllTransactions, payer: Keypair.generate() }
        : {
            publicKey: Keypair.generate().publicKey,
            signTransaction: rejectSigning,
            signAllTransactions: rejectSigning,
            payer: Keypair.generate(),
          };

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    return {
      gig: new Program(gigIdl as Gig, provider),
      escrow: new Program(escrowIdl as Escrow, provider),
      reputation: new Program(reputationIdl as Reputation, provider),
      achievement: new Program(achievementIdl as Achievement, provider),
    };
  }, [connection, publicKey, signTransaction, signAllTransactions]);
}
