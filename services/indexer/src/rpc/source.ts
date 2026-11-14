import { Connection, PublicKey, type GetProgramAccountsFilter } from "@solana/web3.js";

/** A confirmed transaction reduced to what the indexer needs. */
export interface TxRecord {
  signature: string;
  slot: number;
  blockTime: number | null;
  /** Failed transactions emit no state changes; they are skipped. */
  failed: boolean;
  logs: string[];
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  failed: boolean;
}

export interface RawAccount {
  address: string;
  data: Buffer;
}

/**
 * Where chain data comes from. `RpcChainSource` polls JSON-RPC; a Helius
 * webhook receiver would instead turn each pushed transaction into a
 * `TxRecord` and call `ingestTransactions` directly.
 */
export interface ChainSource {
  /** Newest first, like `getSignaturesForAddress`. */
  getSignatures(program: string, opts: { before?: string; until?: string; limit: number }): Promise<SignatureInfo[]>;
  getTransaction(signature: string): Promise<TxRecord | null>;
  /** All accounts matching the filters, plus the slot the snapshot was read at. */
  getProgramAccounts(program: string, filters: GetProgramAccountsFilter[]): Promise<{ slot: number; accounts: RawAccount[] }>;
}

export class RpcChainSource implements ChainSource {
  readonly connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async getSignatures(program: string, opts: { before?: string; until?: string; limit: number }): Promise<SignatureInfo[]> {
    const sigs = await this.connection.getSignaturesForAddress(new PublicKey(program), opts, "confirmed");
    return sigs.map((s) => ({ signature: s.signature, slot: s.slot, failed: s.err !== null }));
  }

  async getTransaction(signature: string): Promise<TxRecord | null> {
    const tx = await this.connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx) return null;
    return {
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      failed: tx.meta?.err != null,
      logs: tx.meta?.logMessages ?? [],
    };
  }

  async getProgramAccounts(program: string, filters: GetProgramAccountsFilter[]) {
    const res = await this.connection.getProgramAccounts(new PublicKey(program), { filters, withContext: true });
    return {
      slot: res.context.slot,
      accounts: res.value.map((a) => ({ address: a.pubkey.toBase58(), data: Buffer.from(a.account.data) })),
    };
  }
}
