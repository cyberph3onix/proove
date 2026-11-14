export {
  UMBRA_NETWORK,
  UMBRA_ENDPOINTS,
  UMBRA_SUPPORTED_MINTS,
  endpoints,
  isConfidentialMintSupported,
  supportedMintList,
  type UmbraNetwork,
  type UmbraEndpoints,
} from "./config";

export { getClientFor, ensureRegistered, resetUmbraClients } from "./client";

export {
  createStealthIdentity,
  createEphemeralSigner,
  saveStealthIdentity,
  loadStealthIdentity,
  listStealthIdentities,
  forgetStealthIdentity,
  type StealthIdentity,
} from "./stealth-identity";

export {
  fundStealthIdentity,
  claimStealthNotes,
  privatizeEarnings,
  type ConfidentialStep,
  type ProgressReporter,
} from "./confidential-payments";
