/**
 * Confidential Mode: the two privacy legs PayGig offers.
 *
 * What this does and does not hide, stated precisely, because overclaiming on
 * privacy is worse than not offering it:
 *
 *   HIDDEN. Which real wallet paid for a gig, and which wallet a freelancer's
 *   earnings end up in. Both links are severed by Umbra's Stealth Pool: a note
 *   written by one address is burned by another with nothing on-chain
 *   connecting them.
 *
 *   NOT HIDDEN. The escrow vault balance, the milestone amounts, and the fact
 *   that a payment occurred. That is deliberate -- the vault has to stay
 *   publicly verifiable or the "non-custodial and checkable" guarantee that
 *   the whole protocol rests on evaporates. Hiding the amounts too would need
 *   Token-2022 confidential transfers, which depend on the ZK ElGamal Proof
 *   program and would put encrypted balances inside the custody path.
 *
 * The escrow programs are untouched by any of this. Umbra sits entirely on the
 * approach and exit ramps.
 */

import { createU64 } from "@umbra-privacy/sdk/types";
import { getUmbraRelayer, type IUmbraSigner } from "@umbra-privacy/sdk";
import {
  getATAIntoETADirectDepositorFunction,
  getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction,
} from "@umbra-privacy/sdk/deposit";
import {
  getBurnableStealthPoolNoteScannerFunction,
  getReceiverBurnableStealthPoolNoteIntoETABurnerFunction,
} from "@umbra-privacy/sdk/burn";
import { getETAIntoATAWithdrawerFunction } from "@umbra-privacy/sdk/withdrawal";
import {
  getATAIntoStealthPoolNoteCreatorProver,
  getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver,
} from "@umbra-privacy/sdk/zk-prover";
import { address } from "@solana/kit";

import { getClientFor, ensureRegistered } from "./client";
import { endpoints, isConfidentialMintSupported, UMBRA_NETWORK } from "./config";
import {
  createStealthIdentity,
  saveStealthIdentity,
  type StealthIdentity,
} from "./stealth-identity";

export type ConfidentialStep =
  | "registering"
  | "shielding"
  | "creating-note"
  | "scanning"
  | "burning"
  | "unshielding"
  | "done";

export interface ProgressReporter {
  (step: ConfidentialStep, detail?: string): void;
}

const noop: ProgressReporter = () => {};

function assertSupported(mint: string) {
  if (!isConfidentialMintSupported(mint)) {
    throw new Error(
      `Confidential Mode is not available for mint ${mint} on ${UMBRA_NETWORK}. ` +
        `Umbra only supports a fixed set of mints per network.`,
    );
  }
}

/**
 * Moves `amount` from `payer`'s public ATA to a freshly minted stealth
 * identity's public ATA, with no on-chain link between the two.
 *
 * Route: payer ATA → payer ETA (shield) → Stealth Pool note addressed to the
 * stealth identity → stealth identity burns the note into its own ETA → stealth
 * identity unshields to its ATA.
 *
 * The burn is submitted through Umbra's relayer, which is what keeps the
 * stealth identity from needing SOL of its own to pay fees -- funding it from
 * the payer's wallet would reintroduce exactly the link this is severing.
 *
 * The returned identity is the account that must then create and fund the gig.
 * Its key is persisted under `gigRef`, because escrow's `has_one = client`
 * means losing it makes the gig unapprovable forever.
 */
export async function fundStealthIdentity(params: {
  payer: IUmbraSigner;
  mint: string;
  amount: bigint;
  gigRef: string;
  /**
   * Gets native SOL to the stealth address so it can pay for its own
   * registration transaction.
   *
   * ── PRIVACY CAVEAT ──────────────────────────────────────────────────────
   * Umbra will not accept a stealth note addressed to an unregistered
   * receiver, and registration is an ordinary on-chain transaction, so a brand
   * new address cannot register without gas from somewhere. A direct transfer
   * from the payer is the obvious source and is also exactly the link this
   * whole flow exists to break -- an observer can follow payer → stealth in
   * one hop.
   *
   * Anything that severs it (a sponsor/relayer paying registration fees, a
   * pre-seeded pool of registered identities, gas from an already-unlinked
   * address) has to be supplied here by the caller. It is deliberately not
   * defaulted, so the tradeoff is a decision rather than an accident.
   * ────────────────────────────────────────────────────────────────────────
   */
  prepareStealthGas: (stealthAddress: string) => Promise<void>;
  onProgress?: ProgressReporter;
}): Promise<StealthIdentity> {
  const { payer, mint, amount, gigRef, prepareStealthGas, onProgress = noop } = params;
  assertSupported(mint);

  const mintAddress = address(mint);
  const value = createU64({ value: amount });

  onProgress("registering", "preparing your Umbra account");
  await ensureRegistered(payer);

  const stealth = await createStealthIdentity();
  // Persist before any funds move: a crash after the note is written but
  // before we save the key would strand the money in an unrecoverable account.
  saveStealthIdentity(gigRef, stealth.secretKey);

  // The receiver must already be registered when the note is written --
  // `createNote` rejects with "Receiver is not registered" otherwise. This has
  // to happen before the deposit, not after it as part of claiming.
  onProgress("registering", "preparing the one-time payment address");
  await prepareStealthGas(stealth.signer.address);
  await ensureRegistered(stealth.signer);

  const payerClient = await getClientFor(payer);

  onProgress("shielding", "moving funds into your encrypted balance");
  const deposit = getATAIntoETADirectDepositorFunction({ client: payerClient });
  await deposit(payer.address, mintAddress, value);

  onProgress("creating-note", "writing an unlinkable stealth note");
  const createNote = getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction(
    { client: payerClient },
    { zkProver: getATAIntoStealthPoolNoteCreatorProver() },
  );
  await createNote({
    destinationAddress: stealth.signer.address,
    mint: mintAddress,
    amount: value,
  });

  await claimStealthNotes({ recipient: stealth.signer, onProgress });

  onProgress("unshielding", "moving funds to the gig's payment address");
  const stealthClient = await getClientFor(stealth.signer);
  const withdraw = getETAIntoATAWithdrawerFunction({ client: stealthClient });
  await withdraw(stealth.signer.address, mintAddress, value);

  onProgress("done");
  return stealth;
}

/**
 * Scans for stealth notes addressed to `recipient` and burns them into that
 * account's encrypted balance.
 *
 * Notes are inert until burned -- the funds are not spendable by the recipient
 * until this runs, which is why both legs call it rather than assuming the
 * transfer completed when the note was written.
 */
export async function claimStealthNotes(params: {
  recipient: IUmbraSigner;
  onProgress?: ProgressReporter;
}): Promise<number> {
  const { recipient, onProgress = noop } = params;

  // Registration is idempotent, and the recipient is already registered by the
  // time a note exists for them (Umbra refuses to address one otherwise), but
  // this keeps `claimStealthNotes` usable as a standalone entry point.
  onProgress("registering", "preparing the receiving account");
  await ensureRegistered(recipient);

  const client = await getClientFor(recipient);

  onProgress("scanning", "looking for incoming stealth notes");
  const scan = getBurnableStealthPoolNoteScannerFunction({ client });
  const result = await scan();

  const notes = result.etaToStealthPoolReceiverBurnable.map((n) => ({
    ...n,
    kind: "receiver-burnable" as const,
  }));
  if (notes.length === 0) return 0;

  onProgress("burning", `claiming ${notes.length} note(s)`);
  const relayer = getUmbraRelayer({
    apiEndpoint: endpoints().relayerApiEndpoint,
  });

  const burn = getReceiverBurnableStealthPoolNoteIntoETABurnerFunction(
    { client },
    {
      fetchBatchMerkleProof: client.fetchBatchMerkleProof!,
      zkProver: getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(),
      relayer: {
        submitBurn: relayer.submitClaim,
        pollBurnStatus: relayer.pollClaimStatus,
        getRelayerAddress: relayer.getRelayerAddress,
      },
    },
  );

  await burn(notes);
  return notes.length;
}

/**
 * The payout leg: a freelancer takes a milestone payment that just landed in
 * their public ATA and makes its onward flow untraceable.
 *
 * This runs *after* escrow releases funds, never instead of it. The release is
 * still a public transfer to the freelancer's gig address -- that has to stay
 * public, since it is the same address their reputation accrues to. What this
 * does is stop the money being followable from there: it is shielded, sent
 * through the Stealth Pool to a destination the freelancer controls, and
 * claimed there.
 *
 * Net effect: reputation stays public and verifiable, earnings stop being a
 * public ledger of what any given freelancer is worth.
 */
export async function privatizeEarnings(params: {
  freelancer: IUmbraSigner;
  destination: string;
  mint: string;
  amount: bigint;
  onProgress?: ProgressReporter;
}): Promise<void> {
  const { freelancer, destination, mint, amount, onProgress = noop } = params;
  assertSupported(mint);

  const mintAddress = address(mint);
  const value = createU64({ value: amount });

  onProgress("registering", "preparing your Umbra account");
  await ensureRegistered(freelancer);

  const client = await getClientFor(freelancer);

  onProgress("shielding", "shielding your payout");
  const deposit = getATAIntoETADirectDepositorFunction({ client });
  await deposit(freelancer.address, mintAddress, value);

  onProgress("creating-note", "sending to your private wallet");
  const createNote = getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction(
    { client },
    { zkProver: getATAIntoStealthPoolNoteCreatorProver() },
  );
  await createNote({
    destinationAddress: address(destination),
    mint: mintAddress,
    amount: value,
  });

  onProgress("done");
}
