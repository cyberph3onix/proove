/**
 * Umbra client construction and account registration.
 *
 * Every Umbra operation runs against a client bound to one signer. Confidential
 * Mode uses two different signers, so it needs two clients:
 *
 *   - the user's real wallet, which shields funds it already holds; and
 *   - a per-gig stealth identity, which receives them and pays the escrow.
 *
 * Clients are cached by signer address because `getUmbraClient` opens RPC and
 * indexer connections, and rebuilding one per render would leak sockets.
 */

import { getUmbraClient, type IUmbraClient, type IUmbraSigner } from "@umbra-privacy/sdk";
import { getUserRegistrationFunction } from "@umbra-privacy/sdk/registration";
import { getUserRegistrationProver } from "@umbra-privacy/sdk/zk-prover";

import { endpoints, UMBRA_NETWORK, type UmbraNetwork } from "./config";

const clientCache = new Map<string, Promise<IUmbraClient>>();

export function getClientFor(
  signer: IUmbraSigner,
  network: UmbraNetwork = UMBRA_NETWORK,
): Promise<IUmbraClient> {
  const key = `${network}:${signer.address}`;
  const cached = clientCache.get(key);
  if (cached) return cached;

  const { rpcUrl, rpcSubscriptionsUrl, indexerApiEndpoint } = endpoints(network);
  const client = getUmbraClient({
    signer,
    network,
    rpcUrl,
    rpcSubscriptionsUrl,
    indexerApiEndpoint,
  });

  clientCache.set(key, client);
  return client;
}

/**
 * Registers an Umbra account for `signer`.
 *
 * Registration is a prerequisite for holding an EncryptedTokenAccount, and it
 * is idempotent per address -- calling it for an already-registered signer is
 * safe, so callers do not need to track whether they have run it. `anonymous`
 * keeps the registration itself unlinkable, which matters for stealth
 * identities: a registration traceable to the funding wallet would undo the
 * privacy the stealth identity exists to provide.
 */
export async function ensureRegistered(signer: IUmbraSigner): Promise<void> {
  const client = await getClientFor(signer);
  const register = getUserRegistrationFunction(
    { client },
    { zkProver: getUserRegistrationProver() },
  );
  await register({ confidential: true, anonymous: true });
}

/** Drops cached clients. Call on wallet disconnect. */
export function resetUmbraClients(): void {
  clientCache.clear();
}
