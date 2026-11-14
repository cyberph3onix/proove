// In-memory stand-in for the subset of Connection the keeper uses.
import { PublicKey, type AccountInfo, type TransactionError, type VersionedTransaction } from "@solana/web3.js";
import { SYSVAR_CLOCK_ID } from "../src/accounts";
import type { KeeperRpc } from "../src/keeper";
import { clockData } from "./fixtures";

type Simulator = (tx: VersionedTransaction) => TransactionError | null | Error;

export class FakeRpc {
  accounts = new Map<string, AccountInfo<Buffer>>();
  simulations: VersionedTransaction[] = [];
  sent: VersionedTransaction[] = [];
  blockhashCalls = 0;
  /** Called for each simulation; return an error to fail it. */
  simulate: Simulator = () => null;
  /** Result of confirmation per send. */
  confirm: (n: number) => TransactionError | null | Error = () => null;
  signatureStatus: (sig: string) => { err: TransactionError | null; confirmationStatus: "confirmed" } | null = () => null;

  setClock(now: bigint) {
    this.put(SYSVAR_CLOCK_ID, clockData(now), new PublicKey("Sysvar1111111111111111111111111111111111111"));
  }

  put(address: PublicKey | string, data: Buffer, owner: PublicKey) {
    const k = typeof address === "string" ? address : address.toBase58();
    this.accounts.set(k, { data, owner, lamports: 1, executable: false, rentEpoch: 0 });
  }

  asRpc(): KeeperRpc {
    const self = this;
    const rpc = {
      async getAccountInfo(k: PublicKey) {
        return self.accounts.get(k.toBase58()) ?? null;
      },
      async getMultipleAccountsInfo(keys: PublicKey[]) {
        return keys.map((k) => self.accounts.get(k.toBase58()) ?? null);
      },
      async getProgramAccounts(program: PublicKey, cfg: { filters?: { memcmp: { offset: number; bytes: string } }[] }) {
        const bs58 = (await import("@coral-xyz/anchor")).utils.bytes.bs58;
        const out: { pubkey: PublicKey; account: AccountInfo<Buffer> }[] = [];
        for (const [k, a] of self.accounts) {
          if (!a.owner.equals(program)) continue;
          const ok = (cfg.filters ?? []).every(({ memcmp }) => {
            const want = Buffer.from(bs58.decode(memcmp.bytes));
            return a.data.subarray(memcmp.offset, memcmp.offset + want.length).equals(want);
          });
          if (ok) out.push({ pubkey: new PublicKey(k), account: a });
        }
        return out;
      },
      async getLatestBlockhash() {
        self.blockhashCalls++;
        return { blockhash: PublicKey.unique().toBase58(), lastValidBlockHeight: 100 };
      },
      async simulateTransaction(tx: VersionedTransaction) {
        self.simulations.push(tx);
        const r = self.simulate(tx);
        if (r instanceof Error) throw r;
        return { context: { slot: 1 }, value: { err: r, logs: [], accounts: null, unitsConsumed: 1234, returnData: null } };
      },
      async sendRawTransaction(raw: Buffer | Uint8Array) {
        const { VersionedTransaction } = await import("@solana/web3.js");
        self.sent.push(VersionedTransaction.deserialize(raw));
        return `sig${self.sent.length}`;
      },
      async confirmTransaction() {
        const r = self.confirm(self.sent.length);
        if (r instanceof Error) throw r;
        return { context: { slot: 2 }, value: { err: r } };
      },
      async getSignatureStatus(sig: string) {
        return { context: { slot: 3 }, value: self.signatureStatus(sig) };
      },
    };
    return rpc as unknown as KeeperRpc;
  }
}
