/**
 * Proove domain model.
 *
 * These types mirror the on-chain accounts (gig, escrow, reputation,
 * achievement, dispute, receivables, governance) plus the off-chain documents
 * whose hashes are committed on-chain (specs, reports, briefs, evaluations).
 * The mock data layer and, later, the indexer/chain clients both produce
 * exactly these shapes, so pages never care where the data came from.
 *
 * Conventions:
 * - Amounts are integers in token base units (USDC: 6 decimals).
 * - Times are unix seconds. Durations are seconds.
 * - Hashes are lowercase hex SHA-256 (64 chars); ZERO_HASH means "none".
 * - Rulings are the freelancer's share in basis points (0–10000).
 */

export type Address = string;
export type Hash = string;
export type Bps = number;

export const ZERO_HASH: Hash = "0".repeat(64);

// ─── Gig program ────────────────────────────────────────────────────────────

export type GigStatus =
  | "draft"
  | "published"
  | "assigned"
  | "inProgress"
  | "completed"
  | "cancelled"
  | "archived"
  | "disputed";

export interface Gig {
  address: Address;
  id: number;
  client: Address;
  /** Default pubkey (null here) until assigned. */
  freelancer: Address | null;
  mint: Address;
  status: GigStatus;
  createdAt: number;
  updatedAt: number;
  title: string;
  description: string;
  skills: string[];
  category: string;
  budget: number;
  deadline: number;
  /** Off-chain (indexer/API): wallets that expressed interest. */
  applicants: Address[];
  /** Off-chain: the original brief the Scope Compiler worked from. */
  brief?: string;
}

// ─── Escrow program ─────────────────────────────────────────────────────────

export type MilestoneStatus =
  | "pendingFunding"
  | "funded"
  | "submitted"
  | "partialReleased"
  | "completed"
  | "disputed"
  | "refunded"
  | "resolved";

/** Protocol terms snapshotted onto a milestone when it is funded. */
export interface MilestoneTerms {
  partialTimeout: number;
  fullTimeout: number;
  partialBps: Bps;
  feeBps: Bps;
}

export interface DeliveryFile {
  name: string;
  size: number;
  mime: string;
  /** SHA-256 of the plaintext; listed in the delivery manifest. */
  plaintextHash: Hash;
  /** Arweave (Irys) URI of the AES-256-GCM ciphertext. */
  uri: string;
}

export interface Milestone {
  address: Address;
  gig: Address;
  index: number;
  title: string;
  amount: number;
  released: number;
  /** Protocol fees taken so far from released amounts. */
  feesPaid: number;
  /** Amount returned to the client (refund / ruling). */
  refunded: number;
  status: MilestoneStatus;
  specHash: Hash;
  deliveryHash: Hash;
  reportHash: Hash;
  termsAccepted: boolean;
  createdAt: number;
  fundedAt: number | null;
  submittedAt: number | null;
  submittedSlot: number | null;
  approvedAt: number | null;
  terms: MilestoneTerms | null;
  /** Status the milestone had when a dispute froze it, and when. */
  statusBeforeDispute?: MilestoneStatus;
  frozenAt?: number;
  disputeCase?: Address;
  receivable?: Address;
  spec?: MilestoneSpec;
  report?: VerificationReport;
  files?: DeliveryFile[];
  deliveryNote?: string;
}

// ─── Agreement layer documents ──────────────────────────────────────────────

export type CriterionCheck = "automatic" | "sampled" | "manual";

export interface Criterion {
  id: string;
  text: string;
  check: CriterionCheck;
  weight?: number;
  sample_size?: number;
  pass_threshold?: number;
  /** Scope Compiler flag: this criterion is hard to test objectively. */
  hard_to_test?: boolean;
}

export interface Deliverable {
  id: string;
  kind: string;
  format: string;
}

export interface Provenance {
  model: string;
  prompt_version: Hash;
}

/** doodle.milestone-spec.v1 in the PRD; stored off-chain, hash on-chain. */
export interface MilestoneSpec {
  schema: "proove.milestone-spec.v1";
  gig: Address;
  index: number;
  title: string;
  amount: string;
  mint: Address;
  deliverables: Deliverable[];
  criteria: Criterion[];
  deadline: number;
  generated_by: Provenance | null;
  edited_by_client: boolean;
}

export interface EvidencePointer {
  file: string;
  /** page, timestamp, line, or item id inside the file */
  locator?: string;
}

export type CriterionVerdict = "pass" | "fail" | "unclear";

export interface CriterionFinding {
  criterion: string;
  verdict: CriterionVerdict;
  confidence: number;
  evidence: EvidencePointer[];
  note: string;
}

export interface SampleAudit {
  criterion: string;
  /** SlotHashes entry for submitted_slot + 2. */
  seedSlot: number;
  seed: Hash;
  items: string[];
  agreementRate: number;
}

export interface VerificationReport {
  schema: "proove.verification-report.v1";
  milestone: Address;
  findings: CriterionFinding[];
  summary: string;
  model: string;
  prompt_version: Hash;
  input_hashes: Hash[];
  created_at: number;
  samples: SampleAudit[];
}

// ─── Reputation & achievement ───────────────────────────────────────────────

export type BadgeType =
  | "FirstGig"
  | "TenCompletedJobs"
  | "HundredCompletedJobs"
  | "FiveStarPerformer"
  | "TrustedFreelancer"
  | "FastDeliverer"
  | "TopRated";

export interface Badge {
  type: BadgeType;
  profile: Address;
  issuedAt: number;
  /** Achievement NFT claimed? */
  minted: boolean;
  assetId?: Address;
  /** v1 badges stay transferable; v2 badges are permanently frozen. */
  version: "v1" | "v2";
}

export interface UserProfile {
  authority: Address;
  completedJobs: number;
  successfulJobs: number;
  cancelledJobs: number;
  onTimeJobs: number;
  totalEarnings: number;
  ratingSum: number;
  ratingCount: number;
  /** Scaled by 100 (450 = 4.50 stars). */
  averageRating: number;
  reputationScore: number;
  badgesEarned: number;
  disputesWon: number;
  disputesLost: number;
  createdAt: number;
  updatedAt: number;
  /** Slot the account was last written in (for provenance display). */
  slot: number;
}

export interface Rating {
  address: Address;
  jobId: number;
  gig: Address;
  client: Address;
  freelancer: Address;
  score: number;
  reviewHash: Hash;
  /** Off-chain review text whose hash is on-chain. */
  review?: string;
  submittedAt: number;
}

/** Off-chain profile details (indexer / API), not part of reputation. */
export interface PersonaProfile {
  address: Address;
  name: string;
  headline: string;
  skills: string[];
  categories: string[];
  hue: number;
}

// ─── Dispute program ────────────────────────────────────────────────────────

export type CaseMode = "aiAssisted" | "humanOnly";

export type CaseStatus =
  | "evidence"
  | "aiEvaluation"
  | "arbitration"
  | "tieBreak"
  | "appealWindow"
  | "appealed"
  | "settled"
  | "defaulted";

export type SeatId = "A" | "B" | "C";

export type AttemptOutcome = "ok" | "timeout" | "rateLimited" | "serverError" | "schemaInvalid" | "refusal";

export interface AiAttempt {
  n: number;
  model: string;
  backup: boolean;
  outcome: AttemptOutcome;
  at: number;
}

export interface AiEvaluation {
  schema: "proove.ai-evaluation.v1";
  seat: SeatId;
  ruling: Bps;
  findings: CriterionFinding[];
  confidence: number;
  reasoning: string;
  model: string;
  prompt_version: Hash;
  input_hashes: Hash[];
}

export interface AiSeat {
  seat: SeatId;
  label: string;
  model: string;
  backupModel: string;
  status: "pending" | "running" | "posted" | "failed";
  attempts: AiAttempt[];
  evaluation?: AiEvaluation;
  hash?: Hash;
}

export interface NeutralBrief {
  schema: "proove.neutral-brief.v1";
  criteria: { id: string; plain: string }[];
  claims: { party: "client" | "freelancer"; text: string; criteria: string[] }[];
  evidenceMap: { item: string; supports: string[] }[];
  contradictions: string[];
  gaps: string[];
  model: string;
  prompt_version: Hash;
  input_hashes: Hash[];
}

export interface EvidenceItem {
  address: Address;
  case: Address;
  party: Address;
  role: "client" | "freelancer" | "holder";
  index: number;
  label: string;
  text: string;
  contentHash: Hash;
  uri: string;
  submittedAt: number;
}

export interface VerdictReason {
  criterion: string;
  text: string;
}

export interface Verdict {
  arbitrator: Address;
  ruling: Bps;
  reasonHash: Hash;
  reasons: VerdictReason[];
  /** Required when the ruling is ≥2500 bps from the AI recommendation. */
  seatAnswers?: Partial<Record<SeatId, string>>;
  signedAt: number;
}

export interface CaseTimelineEntry {
  at: number;
  kind: string;
  text: string;
}

export interface DisputeCase {
  address: Address;
  milestone: Address;
  gig: Address;
  round: 1 | 2;
  /** Round-1 case when this is an appeal round. */
  previousRound?: Address;
  raisedBy: Address;
  raiserRole: "client" | "freelancer";
  client: Address;
  freelancer: Address;
  holder?: Address;
  reason: string;
  frozenAmount: number;
  bond: number;
  mode: CaseMode;
  humanOnlyReason?: "chosen" | "aiFailed";
  status: CaseStatus;
  openedAt: number;
  deadlines: {
    evidence: number;
    ai: number;
    arbitration: number;
    appeal: number;
    hard: number;
    tieBreak?: number;
  };
  hashes: { spec: Hash; delivery: Hash; report: Hash; brief: Hash };
  brief?: NeutralBrief;
  briefStatus: "pending" | "posted" | "failed" | "skipped";
  seats: AiSeat[];
  aiPhase: "pending" | "running" | "done" | "failed" | "skipped";
  recommendation: Bps | null;
  split: boolean;
  requiredArbitrators: 1 | 2;
  arbitrators: Address[];
  noShows: Address[];
  reassignments: number;
  fallback?: Address;
  verdicts: Verdict[];
  tieBreakPick?: Bps;
  finalRuling: Bps | null;
  appeal?: { by: Address; grounds: string; bond: number; at: number };
  /** Set on a round-1 case once it is appealed. */
  appealedTo?: Address;
  waivedBy: Address[];
  feeBps: Bps;
  feeAmount: number;
  timeline: CaseTimelineEntry[];
  settledAt?: number;
}

export interface Arbitrator {
  authority: Address;
  stake: number;
  status: "active" | "cooldown" | "withdrawing" | "removed";
  activeCases: number;
  casesDecided: number;
  overturnedOnAppeal: number;
  noShows: number;
  cooldownUntil: number | null;
  feesEarned: number;
  joinedAt: number;
}

// ─── Governance ─────────────────────────────────────────────────────────────

export interface ProtocolConfig {
  partialTimeout: number;
  fullTimeout: number;
  partialBps: Bps;
  feeBps: Bps;
  minMilestone: number;
  noDeliveryGrace: number;
}

export interface DisputeConfig {
  evidenceWindow: number;
  aiWindow: number;
  arbitrationWindow: number;
  appealWindow: number;
  humanOnlyWindow: number;
  bondBps: Bps;
  bondMin: number;
  feeBps: Bps;
  feeMin: number;
  humanOnlyFeeBps: Bps;
  noShowSlashBps: Bps;
  arbitratorStake: number;
  highValueThreshold: number;
  hardDeadline: number;
  aiAttempts: number;
  backupAttempts: number;
}

export type AiJob = "scope" | "verify" | "brief" | "seatA" | "seatB" | "seatC" | "receipts" | "conflicts";

export interface AiRegistryEntry {
  job: AiJob;
  label: string;
  model: string;
  promptHash: Hash;
  backupModel: string | null;
  approvedAt: number;
}

export interface SettingChange {
  account: "ProtocolConfig" | "DisputeConfig" | "AiRegistry" | "Treasury";
  key: string;
  from: string | number;
  to: string | number;
}

export type ProposalStatus = "voting" | "succeeded" | "defeated" | "timelock" | "executed" | "vetoed";

export interface Proposal {
  id: number;
  title: string;
  description: string;
  author: Address;
  changes: SettingChange[];
  status: ProposalStatus;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorum: number;
  createdAt: number;
  votingEndsAt: number;
  timelockEndsAt: number | null;
  executedAt: number | null;
  votes: Record<Address, "for" | "against" | "abstain">;
}

// ─── Identity ───────────────────────────────────────────────────────────────

export type CredentialSchema = "proove.work-summary.v1" | "proove.work-full.v1" | "proove.arbitrator.v1";

export interface Credential {
  address: Address;
  schema: CredentialSchema;
  subject: Address;
  issuer: Address;
  fields: Record<string, string | number>;
  /** PDAs the values were copied from, for independent verification. */
  sources: { account: Address; label: string }[];
  asOfSlot: number;
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
}

// ─── Receivables ────────────────────────────────────────────────────────────

export interface ReceivableSale {
  from: Address;
  to: Address;
  price: number;
  at: number;
}

export interface Receivable {
  address: Address;
  milestone: Address;
  gig: Address;
  freelancer: Address;
  owner: Address;
  faceValue: number;
  askPrice: number | null;
  status: "active" | "settled" | "burned";
  mintedAt: number;
  sales: ReceivableSale[];
}

// ─── Activity ───────────────────────────────────────────────────────────────

export type ProgramName = "gig" | "escrow" | "reputation" | "achievement" | "dispute" | "receivables" | "governance" | "sas";

export interface ChainEvent {
  signature: string;
  slot: number;
  blockTime: number;
  program: ProgramName;
  name: string;
  actors: Address[];
  gig?: Address;
  milestone?: Address;
  case?: Address;
  amount?: number;
  /** Plain-language receipt (Gemini Flash-Lite in production). */
  receipt: string;
}

export interface Notification {
  id: string;
  to: Address;
  at: number;
  text: string;
  href?: string;
  read: boolean;
}

// ─── Session ────────────────────────────────────────────────────────────────

export type Role = "client" | "freelancer";

export interface Persona {
  address: Address;
  name: string;
  description: string;
  defaultRole: Role;
  council?: boolean;
}

export type TxPhase = "idle" | "signing" | "sent" | "confirmed" | "finalized" | "failed";
