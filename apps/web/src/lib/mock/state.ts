import { DEVNET_USDC_MINT } from "@proove/config";
import type {
  Address,
  AiRegistryEntry,
  Arbitrator,
  Badge,
  ChainEvent,
  Credential,
  DisputeCase,
  DisputeConfig,
  EvidenceItem,
  Gig,
  Milestone,
  Notification,
  Persona,
  PersonaProfile,
  Proposal,
  ProtocolConfig,
  Rating,
  Receivable,
  Role,
  UserProfile,
} from "@proove/types/types";

export type AiFailureMode = "none" | "oneSeat" | "twoSeats" | "split" | "retries";

export interface DevSettings {
  failNextTx: boolean;
  aiFailure: AiFailureMode;
  /** Delivery quality knob for the mock verifier (0–1). */
  deliveryQuality: number;
  /** Real-ms delay per tx phase. */
  txLatency: number;
}

export interface ChainState {
  version: number;
  /** Seconds added to wall-clock time ("time travel"). */
  clockOffset: number;
  persona: Address | null;
  role: Role;
  personas: Persona[];
  people: Record<Address, PersonaProfile>;
  gigs: Record<Address, Gig>;
  milestones: Record<Address, Milestone>;
  profiles: Record<Address, UserProfile>;
  ratings: Rating[];
  badges: Badge[];
  cases: Record<Address, DisputeCase>;
  evidence: EvidenceItem[];
  arbitrators: Record<Address, Arbitrator>;
  protocol: ProtocolConfig;
  disputeConfig: DisputeConfig;
  aiRegistry: AiRegistryEntry[];
  proposals: Proposal[];
  /** DAO treasury (protocol fees) and arbitration fee pool (forfeited bonds). */
  treasury: { balance: number; feePool: number };
  credentials: Credential[];
  receivables: Record<Address, Receivable>;
  /** Wallet USDC balances. */
  balances: Record<Address, number>;
  events: ChainEvent[];
  notifications: Notification[];
  dev: DevSettings;
  counter: number;
  arbitratorCursor: number;
}

export const STATE_VERSION = 3;

/** Pseudo-signers for permissionless actors. */
export const KEEPER = "Keeper1111111111111111111111111111111111111";
export const AI_SERVICE = "AiSvc11111111111111111111111111111111111111";
export const ISSUER = "Proove1ssuer1111111111111111111111111111111";
export const TREASURY = "Treasury1111111111111111111111111111111111";
export const USDC_MINT = DEVNET_USDC_MINT;
