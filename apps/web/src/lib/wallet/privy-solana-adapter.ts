import { BaseSignerWalletAdapter, WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { useWallets } from "@privy-io/react-auth/solana";

type ConnectedStandardSolanaWallet = ReturnType<typeof useWallets>["wallets"][number];

export const PRIVY_WALLET_NAME = "Privy" as WalletName<"Privy">;

type TxLike = Transaction | VersionedTransaction;

/** Bridges a Privy embedded Solana wallet into wallet-adapter's SignerWalletAdapter interface. */
export class PrivyEmbeddedWalletAdapter extends BaseSignerWalletAdapter<"Privy"> {
  name = PRIVY_WALLET_NAME;
  url = "https://privy.io";
  icon = "";
  readyState = WalletReadyState.Loadable;
  supportedTransactionVersions = new Set(["legacy", 0] as const);

  private readonly _publicKey: PublicKey;
  connecting = false;

  constructor(private readonly wallet: ConnectedStandardSolanaWallet) {
    super();
    this._publicKey = new PublicKey(wallet.address);
  }

  get publicKey(): PublicKey {
    return this._publicKey;
  }

  async connect(): Promise<void> {
    this.emit("connect", this._publicKey);
  }

  async disconnect(): Promise<void> {
    this.emit("disconnect");
  }

  async signTransaction<T extends TxLike>(transaction: T): Promise<T> {
    const serialized =
      transaction instanceof VersionedTransaction
        ? transaction.serialize()
        : new Uint8Array(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
    const { signedTransaction } = await this.wallet.signTransaction({ transaction: serialized });
    return (
      transaction instanceof VersionedTransaction
        ? VersionedTransaction.deserialize(signedTransaction)
        : Transaction.from(signedTransaction)
    ) as T;
  }

  async signAllTransactions<T extends TxLike>(transactions: T[]): Promise<T[]> {
    return Promise.all(transactions.map((transaction) => this.signTransaction(transaction)));
  }
}
