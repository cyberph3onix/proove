# Doodle v2 — Product Requirements Document

Nov 14, 2026 · @Shreshth Raaj Gupta

## Summary

Doodle v2 keeps v1's four Solana programs and its frontend, and adds the trust layer v1 is missing: agreed terms, AI-checked deliveries, AI-assisted disputes with a human final say, DAO governance, portable credentials and tokenized receivables.

v1 already handles money well. It locks a client's payment in a vault that no one holds a key to, releases it on fixed rules, and keeps a reputation record anyone can recompute. What v1 cannot do is say what was agreed, prove what was delivered, or settle a real disagreement. Today a client with a legitimate complaint has only one outcome: the timeouts pay the freelancer anyway.

v2 closes that gap in six features:

1. **Agreement layer.** Gemini turns a client brief into milestones with testable acceptance criteria. The spec, the delivery and Gemini's check of the delivery are hashed and stored on-chain.
2. **Dispute program.** Either party can freeze the remaining funds. Three AI jurors each propose a ruling, one or two human arbitrators sign the final verdict, and the dispute program records it and settles escrow.
3. **Reliability.** Every dispute step has a deadline, retries, a fallback and a defined result if all of those fail, including when AI evaluation fails.
4. **DAO governance.** Protocol settings (timeouts, fees, arbitrator stakes, approved AI prompt versions) and the fee treasury are controlled by an on-chain DAO.
5. **Self-sovereign identity.** Work history is issued as Solana Attestation Service credentials the user carries to other apps; badges become non-transferable.
6. **Asset tokenization.** A funded milestone can be minted as a receivable NFT and sold at a discount for early payout.

The frontend keeps v1's pages and visual identity, with a refinement pass and 3D motion tied to real on-chain state.

## Baseline: what v1 has and what stays

Everything below carries into v2 with its behaviour unchanged. v2 redeploys these programs under new program IDs, with only the additive changes listed in "Required changes to existing programs".

| Component | What it does today | v2 treatment |
| --- | --- | --- |
| Gig program | Gig lifecycle Draft → Published → Assigned → InProgress → Completed → Archived, plus Cancelled. 7 instructions, 3 of them callable only by escrow. | Kept as is. One new status value for disputed gigs. |
| Escrow program | Milestone create, fund, deliver, approve. Vault owned by a PDA. 20% released 72 h after delivery, the rest after 7 days, both callable by anyone. `settle_reputation` and `rate_freelancer` call into reputation. | Kept. Gains spec and delivery hashes, a dispute freeze, ruling execution and a protocol fee. |
| Reputation program | Per-wallet `UserProfile`, one `Rating` per job, 7 badge types, score 0–1000 recomputed from stored counters. | Kept. Gains on-time delivery data so `FastDeliverer` and `TrustedFreelancer` become awardable. |
| Achievement program | User claims a Metaplex Core NFT for a badge reputation already awarded. | Kept. Badges minted non-transferable from now on. |
| Escrow → Gig and Escrow → Reputation calls | Signed by escrow's `escrow_authority` PDA, checked with `seeds::program`. | Kept. The same pattern is reused for every new cross-program call. |
| Frontend (`apps/web`) | Next.js 16, React 19, Tailwind 4, shadcn, framer-motion. Privy embedded wallets bridged into wallet-adapter. Anchor client with PDA helpers. Umbra confidential payments. 15 routes. | Kept, same routes and look. Refined, new pages added, 3D layer added. |
| Tests | 351+ Rust tests on litesvm, plus TypeScript end-to-end tests. | Kept and extended; every new instruction gets the same test categories. |

v1's four programs are live on devnet but have no verified build and no `security.txt`. v1's README still says nothing is deployed and that the frontend is a placeholder; v2 docs must describe what actually exists.

## Goals and non-goals

**Goals**

1. A client and a freelancer can agree terms, deliver, and settle a disagreement entirely on Doodle, with every step provable from on-chain data.
2. Every program is deployed with a verified build, so anyone can match the deployed bytecode to the public source.
3. Gemini makes the agreement and dispute steps faster and clearer, without ever settling a case on its own or changing a score.
4. A freelancer's track record can be read and verified by apps that have never heard of Doodle.
5. A freelancer waiting on a funded milestone can get paid early by selling the receivable.
6. The app looks and feels like v1, with 3D motion that shows what is happening to the money.

**Non-goals for v2**

- No governance token or token sale. Voting weight comes from a council and from reputation, not from a tradable token.
- No mainnet launch before an external audit. v2 targets devnet, then mainnet only after review.
- No payout decided by AI alone, and no AI-generated reputation scores or reviews.
- No change to how v1's existing instructions behave for gigs that never enter a dispute.
- No native mobile app; the web app must work well on mobile browsers.

## Design principles

v1's principles stay in force: non-custodial by construction, one responsibility per program, checked arithmetic everywhere, rules encoded in PDA seeds where possible, and an event for every state change. v2 adds five more.

1. **AI never settles a case alone.** AI jurors propose rulings, but funds move only on a verdict signed by registered human arbitrators, or by the predefined default outcome. No instruction takes AI output as input to a score.
2. **Commit, then show.** Anything a later dispute might rely on (the spec, the delivery, the verification report, each side's evidence, the brief, each AI evaluation, each verdict reason) is hashed on-chain at the moment it is created. Nobody can quietly edit it afterwards.
3. **Anyone can rerun the AI.** Every Gemini document records the model ID, the prompt version hash and the hashes of its inputs. With the same inputs, anyone can regenerate it and compare. Approved prompt versions are set by the DAO.
4. **Escrow is the only program that moves funds.** New programs (dispute, receivables) never hold or transfer the milestone money. The dispute program settles a case by calling escrow, and escrow makes every transfer itself.
5. **Motion follows state.** A 3D animation plays because something happened on-chain (a deposit confirmed, a vote revealed), never as decoration that could suggest something happened when it didn't.

## System architecture

v2 runs eight Solana programs (four kept from v1, four new) and four off-chain services; escrow remains the only program that holds or moves milestone money.

&#91;embedded content: v2 architecture · 8 programs, 4 services\]

Only the dispute program calls into escrow, to settle a case, signed by its own PDA, which escrow checks with seeds::program as v1 does for escrow's own calls. Escrow reads the other new accounts (a receivable, the protocol config) with an owner check. The AI service writes only AI juror evaluations and brief hashes on-chain; the keeper sends only instructions anyone could send; the indexer only reads.

## Required changes to existing programs

The core cannot stay byte-for-byte identical: a dispute means nothing if the timeouts still pay out while a case is open. The changes below are the minimum, all additive. No existing instruction changes behaviour for a gig that is never disputed, and every v1 test must still pass unchanged.

| Program | Change | Why it is unavoidable |
| --- | --- | --- |
| Escrow | `Milestone` gains `spec_hash`, `delivery_hash`, `report_hash` (32 bytes each, zero by default). `create_milestone` takes `spec_hash`; `submit_delivery` takes `delivery_hash` and `report_hash`. | Without them there is no on-chain record of what was agreed or delivered, so the AI jurors and arbitrators have nothing to judge. |
| Escrow | New status `MilestoneStatus::Disputed`. New instruction `raise_dispute` (client or freelancer signs, posts a bond). | Puts the remaining funds out of reach of every release path. |
| Escrow | `partial_timeout_release`, `full_timeout_release` and `approve_milestone` must reject `Disputed`. | Otherwise a timeout pays the freelancer in the middle of a case. Funds already released before the dispute stay released. |
| Escrow | New instruction `execute_ruling`, called only by the dispute program, signed by its dispute\_authority PDA. Takes a settled `DisputeCase` (owner checked = dispute program), splits the frozen amount by its ruling, and returns or forfeits bonds. | Keeps escrow the only program that moves milestone money (principle 4). |
| Escrow | Protocol fee: on every release, `fee_bps` of the amount goes to the DAO treasury token account. Read from the governed `ProtocolConfig` account; v2 default 50 bps (0.5%). | The fee funds arbitrators, AI costs and the DAO. v1's product plan already specified 0.5%. |
| Escrow | `MIN_MILESTONE_AMOUNT`, governed, default 5 USDC. | Stops two wallets farming reputation with tiny gigs. |
| Escrow | `release_destination(milestone)`: pays the current holder of a receivable NFT if one exists, otherwise the freelancer. | Needed for receivables (Feature 6). Phase 3 only. |
| Gig | New status `GigStatus::Disputed`, set and cleared only by escrow's PDA signer, like `InProgress`. | So gig pages, search and the indexer show the dispute. |
| Reputation | `update_completion` takes `delivered_on_time: bool` and `disputed_outcome: Option<u16>` from escrow. New counters `on_time_jobs`, `disputes_won`, `disputes_lost`. | Makes `FastDeliverer` and `TrustedFreelancer` earnable from real data. Today they can never be awarded. |
| Achievement | Mint with Metaplex Core's permanent freeze plugin, so badge NFTs cannot be transferred. | A credential you can sell is not a credential. |
| All | `security_txt!` macro, verified (deterministic) builds, `ESCROW_PROGRAM_ID` constants and compile-time assertions updated for the new IDs. | Track-level requirement for verifiable source. |
| Escrow | New instruction accept\_terms (freelancer signs). Milestone gains terms\_accepted and submitted\_slot. fund\_milestone requires terms\_accepted when spec\_hash is non-zero. | An arbitrator can only hold the freelancer to terms the freelancer signed. submitted\_slot seeds the random sample audit. |
| Escrow | New instruction refund\_after\_deadline (client signs): a Funded milestone with no delivery by gig deadline + grace period (governed, default 3 days) returns the funds to the client. | In v1, once a milestone is funded and the freelancer never delivers, the money is locked forever. No instruction can return it. |

The hardcoded constants `PARTIAL_TIMEOUT`, `FULL_TIMEOUT` and `PARTIAL_RELEASE_PERCENT` move into `ProtocolConfig` with v1's values as defaults. A milestone stores the values that applied when it was funded, so a later DAO vote can never change the terms of money already locked.

## Feature 1: Agreement layer

Before money is locked, both sides agree on a spec with testable acceptance criteria; after delivery, Gemini checks the work against it. Both documents are hashed on-chain, so they become the evidence if anything goes wrong.

### User stories

- As a client, I describe what I need in a few sentences, a voice note or a screenshot, and get back milestones with amounts and criteria I can edit.
- As a freelancer, I see exactly what "done" means before I accept, and I sign the terms on-chain.
- As a client, when work arrives I get a criterion-by-criterion report instead of having to check everything myself.
- As a data-labeling client, I get a quality score from a random sample that neither side could pick.

### Flow

1. **Scope** (`/gigs/new`). Client enters a brief. Gemini Scope Compiler returns a `MilestoneSpec` per milestone (schema below). Client edits freely; the UI flags criteria Gemini marks as hard to test.
2. **Commit spec.** The app canonicalises the spec JSON (RFC 8785), hashes it with SHA-256, stores the document, and calls `create_milestone(amount, spec_hash)`.
3. **Accept terms.** New escrow instruction `accept_terms`, signed by the assigned freelancer, records that they saw that exact `spec_hash`. If a milestone has a non-zero `spec_hash`, `fund_milestone` requires `terms_accepted`. Milestones with no spec behave as in v1.
4. **Deliver** (`/gigs/[gigId]`). Freelancer uploads files. The app encrypts them, stores them, and sends the plaintext to Gemini Delivery Verifier, which returns a `VerificationReport`.
5. **Commit delivery.** `submit_delivery(delivery_hash, report_hash)`; escrow also records `submitted_slot`.
6. **Review.** Client sees the report next to the files, then approves, waits, or raises a dispute.

### MilestoneSpec (stored off-chain, hash on-chain)

```json
{
  "schema": "doodle.milestone-spec.v1",
  "gig": "<gig pubkey>", "index": 0,
  "title": "Label 500 product images",
  "amount": "120000000", "mint": "<USDC mint>",
  "deliverables": [{"id": "d1", "kind": "dataset", "format": "COCO JSON"}],
  "criteria": [
    {"id": "c1", "text": "Every image has at least one bounding box", "check": "automatic", "weight": 2},
    {"id": "c2", "text": "Labels follow the attached guideline v3", "check": "sampled", "sample_size": 50, "pass_threshold": 0.9}
  ],
  "deadline": 1795000000,
  "generated_by": {"model": "<model id>", "prompt_version": "<sha256>"},
  "edited_by_client": true
}
```

### VerificationReport

One verdict per criterion: `pass`, `fail` or `unclear`, a confidence from 0 to 1, and evidence pointers (file, page, timestamp or item ID). Plus a summary of at most 120 words, the model ID, the prompt version and the input hashes. The report is advice to the client. It has no effect on any instruction.

### Random sample audits

For criteria with `check: "sampled"`, the items to audit are chosen from a seed neither side controls: the slot hash of `submitted_slot + 2`, read from the `SlotHashes` sysvar. The freelancer cannot know it when submitting, and the client cannot re-roll it. Gemini relabels the sampled items against the guideline and reports the agreement rate. Anyone can recompute which items were sampled from the seed.

### Storage

- Deliverables are encrypted in the browser (AES-256-GCM, a fresh key per milestone). The key is wrapped for the client and the freelancer, and later for the AI service and the arbitrators of a dispute.
- Ciphertext goes to permanent storage (Arweave through Irys); specs and reports, which are not secret, are stored in plain JSON.
- `delivery_hash` is the SHA-256 of a manifest listing each file's plaintext hash, so a revealed file can be checked against the commitment.

## Feature 2: Dispute program — AI jurors, human arbitration

Three AI jurors evaluate every case independently and each proposes a ruling; one or two human arbitrators sign the final verdict; the dispute program accepts only a verdict signed by the assigned arbitrators, records it, and settles escrow once the appeal window closes.

### Who can raise a dispute, and when

| Raised by | Milestone status | Typical reason |
| --- | --- | --- |
| Client | `Submitted` or `PartialReleased` | Delivery does not meet the agreed criteria. |
| Freelancer | `Submitted` or `PartialReleased` | Client is withholding approval of work that meets the criteria. |
| Client | `Funded`, past deadline | Freelancer delivered nothing but claims partial work exists. |

The raiser posts a bond of 5% of the frozen amount, minimum 2 USDC. It is returned if the verdict gives the raiser at least half, and otherwise goes to the arbitration fee pool. Funds already released by the 72-hour partial release stay released.

### Roles

| Role | Who | Can | Cannot |
| --- | --- | --- | --- |
| AI juror seats A, B, C | AI service, one registered signer key per seat | Post a signed evaluation with a proposed ruling | Settle a case. No AI output moves funds on its own |
| Arbitrator | A person in the DAO's arbitrator registry, staked | Sign the final verdict with a written reason | Decide a case they are a party to or conflicted on |
| Fallback arbitrator | Next eligible arbitrator in rotation | Take over a case whose arbitrator missed the deadline, or break a tie | Invent a ruling in a tie-break: they pick one of the two |
| Parties | Client and freelancer; receivable holder for evidence | Submit evidence, choose human-only arbitration, appeal once | See the verdict before the arbitrator signs it |
| Keeper | Anyone | Advance deadlines, trigger fallbacks, settle | Change any outcome |

### Three seats, three opinions

Three calls to the same model with the same prompt are one opinion counted three times. The seats are configured to differ, and the DAO approves each seat's configuration in `AiRegistry`:

- **Seat A:** the most capable approved Gemini model, neutral rubric.
- **Seat B:** a different Gemini model, same neutral rubric.
- **Seat C:** a "skeptic" prompt that must write the strongest case against its own first conclusion before it rules.

All seats get identical committed inputs: the spec, the delivery report, every evidence item and the neutral brief. No seat sees another seat's output.

### The neutral brief

Before the seats run, Gemini writes a brief from the committed inputs: each criterion in plain words, each side's claims mapped to the criteria, an evidence map, the points the two sides contradict each other on (phrased as questions), and gaps in the evidence. The brief recommends nothing; its schema has no ruling field. `submit_brief` posts its hash before any seat posts, so the seats and the arbitrators all start from the same summary. Either party can file a written objection to it as an evidence item. On appeal, a new brief adds the round-1 verdict and the appellant's grounds.

### AI evaluation

Each evaluation contains a ruling (the freelancer's share: 0, 2500, 5000, 7500 or 10000 basis points), a finding per acceptance criterion with evidence pointers, a confidence, and a reasoning summary of at most 200 words. The full document goes to storage; its hash and the ruling go on-chain.

- **Recommendation** = the median ruling of the valid seats.
- **Split** = the gap between the highest and lowest valid ruling is 5000 bps or more. A split case needs two arbitrators.
- With exactly two valid seats, they must agree for a recommendation; if they disagree, the case is treated as split.

### Human arbitration

- **One arbitrator** by default.
- **Two arbitrators** when the frozen amount is 500 USDC or more, the AI jurors split, AI evaluation failed, a party chose human-only arbitration, or the case is on appeal. Both must sign the same ruling.
- **Disagreement.** If two arbitrators sign different rulings, a fallback arbitrator picks one of the two within 24 hours.
- **Reasons are required.** `submit_verdict(ruling_bps, reason_hash)` stores the hash of a written reason mapped to the criteria. A verdict 2500 bps or more away from the AI recommendation must answer each AI juror's main finding; the app will not let the arbitrator sign without it.
- **Evidence first.** The arbitrator page shows the raw evidence and the brief before the AI evaluations, to reduce simple copying of the AI result.
- **Assignment.** Round-robin among eligible arbitrators, skipping anyone the indexer flags as a past counterparty of either party. Arbitrators can recuse.
- **Pay and accountability.** Arbitration fee of 3% of the frozen amount, minimum 3 USDC, split among the arbitrators who sign. Arbitrators stake 200 USDC; a missed deadline marks a no-show and costs 10% of stake; 3 no-shows in 90 days removes them from the registry.

### Human-only arbitration

Either party can choose it when the dispute is raised, or the other party within 24 hours. No deliverable or evidence is sent to Gemini, which suits confidential work. It always uses two arbitrators, a 96-hour window and a 5% fee. A case also switches to human-only automatically when AI evaluation fails (Feature 3).

### Case lifecycle

1. **Open.** `escrow::raise_dispute` and `dispute::open_case` in one transaction. Funds freeze; timeouts pause.
2. **Evidence, 72 h.** Up to 10 evidence items per side. The deliverable key is wrapped for the AI service (unless human-only) and, later, for the assigned arbitrators.
3. **AI evaluation, 12 h.** Brief, then the three seats. Skipped in human-only mode.
4. **Arbitration, 48 h** (72 h with two arbitrators). Verdict recorded on-chain with its reason hash.
5. **Appeal window, 48 h.** Either side may appeal once, with a bond twice the original. Two fresh arbitrators decide round 2 using the same AI evaluations plus the appellant's written grounds. Round 2 is final. Both parties can waive the window to settle at once.
6. **Settle.** `settle_case` (anyone, usually the keeper) marks the verdict final and calls `escrow::execute_ruling`, signed by the dispute program's `dispute_authority` PDA. Escrow checks that signer with `seeds::program`, the same pattern v1 uses for escrow's own calls, and makes every transfer: the split, the fee, the bond.

Every case also carries a hard deadline 21 days after opening; Feature 3 defines what happens if it is reached.

### Accounts

| Account | Seeds | Key fields |
| --- | --- | --- |
| `DisputeConfig` | `["dispute_config"]` | Windows, bond and fee rules, high-value threshold, AI seat signer keys, retry limits, hard deadline. Written only by the DAO. |
| `Arbitrator` | `["arbitrator", authority]` | stake, status, active\_cases, cases\_decided, overturned\_on\_appeal, no\_shows, cooldown\_until |
| `DisputeCase` | `["case", milestone, round]` | parties, frozen\_amount, bond, mode (AI-assisted or human-only), spec/delivery/report/brief hashes, three AI evaluation slots (status, ruling, hash, attempts), recommendation, split flag, arbitrators, fallback, verdicts with reason hashes, final ruling, status, every deadline |
| `EvidenceItem` | `["evidence", case, party, index]` | content hash, storage URI, label, submitted\_at |

### Instructions

`register_arbitrator`, `add_stake`, `request_withdrawal`, `withdraw_stake`, `set_arbitrator_status` (DAO), `open_case`, `choose_human_only`, `submit_evidence`, `submit_brief`, `submit_ai_evaluation` (seat key), `mark_ai_seat_failed`, `close_ai_phase`, `assign_arbitrators`, `recuse`, `submit_verdict`, `reassign_arbitrator`, `break_tie`, `appeal`, `waive_appeal`, `settle_case`, `apply_default_outcome`, `claim_fees`. Every one emits an event, uses checked arithmetic and gets the v1 test categories: authorization, PDA forgery, state transitions, timing boundaries and arithmetic.

## Feature 3: Reliability — retries, deadlines, fallbacks, failure outcomes

Every step of a dispute has a deadline, a bounded number of retries, a fallback, and a defined result if the fallback fails too, so no case can keep funds frozen longer than its 21-day hard deadline.

### Step by step

| Step | Deadline | Retries | Fallback | If the fallback also fails |
| --- | --- | --- | --- | --- |
| Neutral brief | 6 h after evidence closes | 3 attempts | Backup model from `AiRegistry`, 2 attempts | Seats and arbitrators proceed without a brief |
| Each AI seat | 12 h after evidence closes | 3 attempts, backoff 1, 5 and 20 min, 120 s timeout per call | Seat's backup model, 2 attempts | Seat recorded as `Failed` and abstains |
| Posting a result on-chain | Before the AI deadline | Up to 10 resubmits with a fresh blockhash; posting is idempotent per seat | Keeper resubmits from the stored document | Seat recorded as `Failed` |
| AI phase as a whole | 12 h | — | 2 valid seats that agree still give a recommendation | **AI evaluation failed** (below) |
| Arbitrator verdict | 48 h, or 72 h with two arbitrators | Reminders at 24 h, 6 h and 1 h | `reassign_arbitrator` (anyone, after the deadline) hands the case to a fallback with a fresh 24 h; the original is marked no-show | One more reassignment; after that, the hard deadline applies |
| Two arbitrators disagree | 24 h | — | Fallback arbitrator picks one of the two rulings | The ruling closer to the AI recommendation wins; with no recommendation, the one closer to 5000 bps |
| Settlement | After the appeal window | Keeper retries every 5 min; `settle_case` is permissionless and idempotent | Anyone can call it | Funds stay frozen but settleable; no state is lost |
| Whole case | 21 days after opening | — | — | **Default outcome** (below) |

### What counts as an AI seat failure

- The API errors, rate-limits or times out on every attempt.
- Output fails the JSON schema twice.
- The ruling is not one of the five allowed values.
- A finding of `pass` or `fail` cites no evidence pointer that exists in the inputs.
- The model ID or prompt hash is not approved in `AiRegistry`.
- The result is not on-chain by the AI deadline.

Only transient errors (timeouts, 429s, 5xx) are retried. A safety refusal or a second schema failure goes straight to the backup model. Every attempt uses an idempotency key of case, seat and attempt number, and the attempt count is stored in the case so retries are visible to everyone.

### Defined outcome when AI evaluation fails

If fewer than two seats are valid, or two valid seats disagree, the AI phase ends as **failed**:

1. The case switches to human-only arbitration with two arbitrators.
2. The arbitration window becomes 96 h, the same as a chosen human-only case.
3. The fee stays at the standard 3%: the parties did not choose the slower path, so they do not pay the 5% human-only rate.
4. Any valid seat's evaluation is still shown to the arbitrators, labelled as incomplete.

AI failure never blocks a case and never decides one.

### Default outcome at the hard deadline

If a case reaches its 21-day hard deadline without a settled verdict, anyone can call `apply_default_outcome`:

- **Round 2 failed but round 1 has a verdict:** the round-1 verdict stands.
- **No verdict at all:** the milestone reverts to the v1 rules both sides signed up for. A delivered milestone resumes its timeout schedule with the time it had left when frozen; an undelivered one past its deadline is refunded to the client.
- Bonds and arbitration fees are refunded, the reputation dispute counters do not change, and every arbitrator who missed a deadline is marked no-show.

The default is the outcome the parties would have got with no dispute. Any other default would reward one side for the system's failure.

### Worst-case timeline

Worst case: evidence 3 days, AI phase 0.5, human-only arbitration after an AI failure 4, two reassignments 2, tie-break 1, appeal window 2, then round 2 with its own reassignments and tie-break about 6. That is about 18.5 days, inside the 21-day hard deadline. A case with no failures settles in about 7.5 days, or 5.5 if both sides waive the appeal window.

### Monitoring

Alerts when an AI seat fails two cases in a row, when any case is within 48 h of its hard deadline, and when the arbitrator queue has more open cases than active arbitrators can cover in one window.

## Feature 4: DAO governance

The Doodle DAO runs on SPL Governance (Realms) and owns every protocol setting and the fee treasury; voting power comes from a council in early phases and from on-chain reputation later, never from a tradable token.

Building a custom governance program would add a large audit surface for little gain. SPL Governance already provides proposals, voting, timelocks, a treasury and a UI, and its [plugin system](https://docs.realms.today/developer-resources/custom-plugin) lets a separate program decide each voter's weight. Doodle writes only that plugin.

### What the DAO controls

| Setting | Account | v2 default | Allowed range |
| --- | --- | --- | --- |
| Partial / full release delay | `ProtocolConfig` | 72 h / 7 days | 24 h–14 days |
| Partial release share | `ProtocolConfig` | 20% | 0–50% |
| Protocol fee | `ProtocolConfig` | 0.5% | 0–2% |
| Minimum milestone | `ProtocolConfig` | 5 USDC | 1–100 USDC |
| No-delivery grace period | `ProtocolConfig` | 3 days | 1–14 days |
| Evidence / AI / arbitration / appeal windows | `DisputeConfig` | 72 / 12 / 48 / 48 h | 12 h–7 days each |
| Dispute bond, arbitration fee, no-show slash | `DisputeConfig` | 5% (min 2 USDC) / 3% / 10% | bounded in code |
| Arbitrator registry and stake | `DisputeConfig` | DAO-approved people, 200 USDC | — |
| Arbitrators (Phase 2) | `DisputeConfig` | 1 or 2 council-appointed people | — |
| AI seat keys and brief signer | `DisputeConfig` | One AI service key per seat | — |
| Approved Gemini prompt versions and model IDs | `AiRegistry` | Scope, Verify, Brief, Seats A to C, a backup per seat | — |
| Treasury spending | Realms treasury | — | Proposal per payment |
| Threshold for two arbitrators | DisputeConfig | 500 USDC | 50–10,000 USDC |
| Retry limits and hard deadline | DisputeConfig | As in Feature 3; 21 days | Hard deadline 14–30 days |

Each range is enforced in program code, so even a captured DAO cannot set a 0-second timeout or a 100% fee. Every change goes through a timelock of at least 48 hours, and it applies only to milestones funded after it takes effect.

### Voting power

- **Phase 2: council only.** A council mint held by the founding wallets in a 2-of-3 multisig. Fast to set up; honest about being centralised.
- **Phase 3: reputation-weighted community vote.** A Doodle voter-weight plugin reads each voter's `UserProfile` and sets weight = floor(sqrt(reputation\_score)) × min(completed\_jobs, 50) / 50. The square root limits how much one top account can dominate, and the job factor limits fresh accounts. The council keeps a veto for the first 6 months, then the DAO votes on removing it.
- Realms requires a community token mint; Doodle creates one and never distributes it. All community weight comes from the plugin.

### AI prompt governance

`AiRegistry` stores the hash of every approved prompt template and model ID. The AI service refuses to run a prompt whose hash is not approved, and the scope, verify and brief documents each record the hash they used. Changing how the AI jurors evaluate a case is therefore a public proposal, not a silent server deploy.

### Treasury

The protocol fee flows into the DAO's USDC treasury account. Expected uses: arbitrator fees when a forfeited bond does not cover them, Gemini API costs, audits and keeper transaction fees. Each payment is its own proposal.

## Feature 5: Self-sovereign identity

A freelancer's Doodle record becomes a set of credentials held by their wallet, in a standard format other apps can verify without integrating with Doodle.

v1 already gets half of this right: `UserProfile` is a PDA seeded by the user's own wallet, and anyone can recompute the score. What v1 lacks is a format other apps already read, a way to share only part of the record, and badges that cannot be sold.

### Credentials on the Solana Attestation Service

[Solana Attestation Service](https://solana.com/docs/tools/attestations/overview) (SAS) is a live, permissionless registry where an issuer defines a schema and signs attestations about a wallet. Doodle registers one credential (issuer) and three schemas.

| Schema | Fields | Issued when |
| --- | --- | --- |
| `doodle.work-summary.v1` | completed\_jobs, successful\_jobs, on\_time\_jobs, average\_rating, reputation\_score, disputes\_won, disputes\_lost, top categories, as\_of\_slot | User clicks "Issue credential" on `/credentials` |
| `doodle.work-full.v1` | Everything above plus total\_earnings | Same, if the user opts in to sharing earnings |
| `doodle.arbitrator.v1` | cases\_decided, overturned\_on\_appeal, no\_shows, stake | User requests it from `/arbitrate` |

Rules:

- Credentials are issued only when the user asks. Nothing is attested about a wallet automatically.
- Every value is copied from on-chain accounts at `as_of_slot`, so a verifier who distrusts the issuer key can read the PDAs at that slot and compare.
- Credentials expire after 90 days; the user re-issues for fresh numbers. The user can revoke any credential at any time from `/credentials`.
- Earnings are excluded unless the user picks the full schema.

### Portable export

`/credentials` also exports a W3C Verifiable Credential (JSON) with the wallet as subject (`did:pkh:solana:…`), signed by the issuer key. This covers verifiers outside Solana, such as an employer's HR tool.

### Public reputation API

The indexer serves `GET /v1/reputation/{wallet}`, returning the profile, ratings, badges and active credentials, each with the account address and slot it came from. It is a convenience: every response can be checked against chain data.

### Non-transferable badges

From v2, the achievement program mints each badge with Metaplex Core's permanent freeze, so it can never leave the wallet that earned it. Badges minted under v1 stay transferable; the new reputation page labels them "v1 badge".

### Selective disclosure (stretch)

Let a user prove a threshold claim ("score at least 700", "20+ jobs, under 5% disputes lost") without revealing the exact numbers, using a small zero-knowledge circuit over the attested values. `snarkjs` is already a frontend dependency. This is a Phase 3 stretch goal and must not block anything else.

## Feature 6: Asset tokenization

A freelancer who has delivered can mint the milestone's pending payout as a receivable NFT and sell it at a discount, getting paid today instead of in up to 7 days; whoever holds the NFT is paid when escrow releases.

This is invoice factoring, with one advantage over the off-chain kind: the money behind the receivable is already locked in a vault, so the buyer's only risk is the outcome of a dispute, not whether the client will pay.

### Rules

- A receivable can be minted only for a milestone in `Submitted` status with accepted terms and no open dispute. Before delivery, the payout is too uncertain to sell.
- One receivable per milestone. Face value = remaining locked amount minus the protocol fee.
- The NFT is a Metaplex Core asset in a "Doodle Receivables" collection. Its metadata links the spec, the delivery report and the milestone account.
- Escrow's release paths pay the token account of the NFT's current owner (Required changes, Phase 3 row). Approval, timeouts and dispute rulings all apply to the holder exactly as they would to the freelancer.
- On full release, the receivable is burned.
- Reputation, ratings and badges stay with the freelancer. Selling a receivable never moves reputation.
- After a sale, only the client can raise a dispute. The holder may submit evidence in a case the client raises.

### Program

New `receivables` program with `mint_receivable`, `list(price)`, `delist`, `buy` and `burn_settled`. `buy` swaps USDC for the NFT atomically; the program never holds milestone funds. Because the asset is standard Metaplex Core, it can also trade on any marketplace that supports Core.

### Buyer view (`/receivables`)

A list of open receivables showing face value, asking price, implied discount, time until the 7-day release, the verification report's pass rate, and the client's dispute history (cases raised, cases won). All facts, no AI rating: Doodle does not tell buyers what a receivable is worth.

### Risks

- **Weaker defence.** A freelancer who has sold the receivable has less reason to defend the work. Their `disputes_lost` counter still moves, which keeps some incentive.
- **Regulation.** Selling receivables can count as factoring or a regulated financial product in some jurisdictions. Devnet only until reviewed by someone qualified; I am not a lawyer and this is not legal advice.

## Missing infrastructure from v1

v1's README lists ten components as empty or absent; v2 builds all of them, because the dispute and identity features depend on an indexer, a keeper and storage that v1 never had.

| Component | v1 state | v2 requirement |
| --- | --- | --- |
| Indexer (`services/indexer`) | Empty folders | Streams program events (Helius webhooks or Yellowstone gRPC), decodes them with the IDLs, writes Postgres (Supabase). Serves the public reputation API, gig search, dispute timelines and arbitrator conflict checks. |
| Gig search | Frontend calls `getProgramAccounts` with a byte filter | Postgres full-text search through the indexer, with category, budget and skill filters. The chain stays the source of truth. |
| Keeper (`services/keeper`) | None | Every 5 minutes, sends the permissionless instructions that are due: partial and full releases, `settle_reputation`, `mark_ai_seat_failed`, `reassign_arbitrator`, `settle_case`. Anyone can run one; Doodle runs the default, paid from the treasury. |
| AI service (`services/ai`) | None | All Gemini calls, prompt registry checks, wrapped-key handling for deliverables, the AI seat signer keys and the brief signer key. The only component holding the Gemini API key. |
| Delivery and evidence storage | Planned (Shadow Drive), not built | Arweave through Irys for permanence. Encrypted deliverables, plain specs, reports and briefs. |
| API routes (`apps/web/src/app/api`) | Empty | Thin layer: upload signing, auth for AI service calls, notification preferences. No business logic. |
| Shared packages | Empty | `packages/idl` (IDLs and generated TS clients), `packages/types`, `packages/config` (program IDs per cluster). Replaces v1's hand-copied IDLs. |
| Notifications | None | Email and in-app alerts for: delivery received, 24 h before each release, dispute opened, arbitrator assigned, AI phase finished, verdict deadlines, fallback reassignment. Arbitrators who get no reminder become no-shows. |
| CI | None | GitHub Actions on every PR: `cargo fmt`, `clippy`, all Rust tests, `anchor build`, `solana-verify build`, IDL drift check, `npm run lint` and `build`, end-to-end tests on a local validator. |
| Verified builds and `security.txt` | Missing on all 4 deployed programs | Required for every program on every cluster. Deploy script refuses to deploy an unverifiable build. |
| Cluster config | Frontend hardcodes devnet | RPC endpoint and program IDs from `packages/config` by environment. |
| Upgrade authority | Single wallet | Squads multisig in Phase 1; moved under the DAO in Phase 3. |
| Monitoring | None | Dashboard for value locked, open disputes, keeper lag, AI service errors and Gemini spend. |
| Fiat off-ramp | Planned (MoonPay), not built | Optional, Phase 3. Link out to a provider; Doodle never touches fiat. |
| README and docs | Out of date | Rewritten to match what is deployed, with an implementation matrix generated from CI. |

## Frontend: same pages, refined, with 3D

Every v1 route stays with its layout and identity; v2 adds five routes, a refinement pass, and one 3D scene per page that shows what is happening to the money or the case.

### Visual identity (unchanged)

- Background `#050505`, text `#F5F5F5`, muted text `#D4D4D8`, accent pink `#FF6FAF`.
- Glass cards: `rgba(255,255,255,0.04)` fill, `rgba(255,255,255,0.08)` border, rounded corners, `GlassCard`, `Pill` and `Eyebrow` components.
- 3D materials follow the same palette: frosted glass for vaults and cards, pink emission for anything active, soft bloom, one shared environment map so every scene is lit the same way.

### Pages

| Route | Status | Refinement | 3D moment | Triggered by |
| --- | --- | --- | --- | --- |
| `/` | Kept | Hero stays; add a scroll section explaining the flow | Glass vault with milestone coins orbiting; on scroll, the story plays: fund, lock, deliver, release | Scroll position |
| `/role`, `/sign-in` | Kept | Polish only | Light particle field in accent pink | Page load |
| `/client`, `/dashboard` | Kept | Cards for "action needed" (approve, respond to dispute, sign a verdict) | Small vault per active gig, filled to its locked amount | Indexer data |
| `/gigs` | Kept | Real search and filters through the indexer | None (keep it fast) | — |
| `/gigs/new` | Kept | Scope Compiler panel: brief in, editable milestones and criteria out | Criteria cards assemble into a stack as Gemini streams them | AI service response |
| `/gigs/[gigId]` | Kept | Milestone timeline; verification report beside files; accept terms, approve, raise dispute, release buttons | Milestone track with countdown rings for the 72 h and 7 day releases | Chain state and clock |
| `/gigs/[gigId]/hire` | Kept | Shows spec hash and terms status before funding | Coin drops into the vault and the lid seals | Funding transaction **confirmed** |
| `/talent` | Kept | Filters by badges, on-time rate, dispute history | Hover tilt on talent cards | Pointer |
| `/reputation/[wallet]` | Kept | Shows source account and slot for every number | Score crystal whose facets size to the score components; badges as rotating medals | Profile data |
| `/transactions`, `/services-taken`, `/wallet` | Kept | Plain-language receipts (Gemini) under each event | Token stack on `/wallet` sized to balance | Chain data |
| `/disputes/[caseId]` | Rebuilt (was placeholder) | Evidence, brief and three AI evaluations with hash checks, arbitrator verdict and reason, every deadline and fallback | Chamber with three AI seats and an arbitrator bench: seats light as evaluations land, scales settle when the verdict is signed | AI evaluation and verdict events |
| `/disputes` | New | Cases you are party to or arbitrating | None | — |
| `/arbitrate` | New | Assigned cases with deadlines, verdict editor with a reason per criterion, stake, history, fees earned | Stake shown as a glowing column | Stake account |
| `/governance` | New | Proposals, current settings and their ranges, treasury, approved AI prompts | Settings as dials that move when a proposal executes | Governance events |
| `/credentials` | New | Issue, view, export, revoke credentials | ID card that flips to show the attested fields | Attestation state |
| `/receivables` | New (Phase 3) | Buyer list and freelancer minting flow | Receivable card that hands over between wallets on purchase | Purchase confirmed |

### 3D stack

- `three`, `@react-three/fiber` and `@react-three/drei`, plus `@react-three/postprocessing` for bloom. `framer-motion`, already installed, keeps handling 2D motion.
- Models made in Blender, exported as GLB with Draco or meshopt compression and KTX2 textures. Each model under 500 KB.
- New components: `Scene3D` (canvas wrapper with fallbacks), `VaultModel`, `CoinDrop`, `TimerRing`, `ScoreCrystal`, `BadgeMedal`, `DisputeChamber`, `CredentialCard3D`.

### Motion follows state

Transaction hooks expose `idle → signing → sent → confirmed → finalized | failed`. A success animation starts only at `confirmed`; `failed` plays a short reversal and shows the error. A 3D scene never shows money moving that has not moved.

### Performance and accessibility budget

- Canvases load with `next/dynamic` and `ssr: false`, one canvas per page, rendering only on change (`frameloop="demand"`) except during an animation, and paused when off screen.
- Device pixel ratio capped at 1.5. 3D code in its own chunk, at most 250 KB gzipped.
- Largest contentful paint at most 2.5 s on a mid-range Android phone over 4G; the page's text and buttons never wait for 3D.
- `prefers-reduced-motion` or no WebGL: a static poster render of the same scene.
- Every animated state also appears as text. No flashing more than 3 times a second.

## Gemini integration spec and guardrails

Gemini runs six jobs, all inside the AI service, all returning schema-checked JSON; four of them produce documents whose hashes go on-chain, and none can block a transaction if Gemini is down.

### The six jobs

| Job | Input | Output | Model tier | On-chain |
| --- | --- | --- | --- | --- |
| Scope Compiler | Brief text, optional voice note, screenshots, reference files | `MilestoneSpec[]` with testability flags | Flash | `spec_hash` (after client edits) |
| Delivery Verifier | Spec, deliverable files (images, PDF, code, video, datasets), sampled items | `VerificationReport` | Flash; sample audits sent as one batch | `report_hash` |
| Neutral brief | Spec, report, all evidence items, round-1 ruling on appeal | `NeutralBrief` | Most capable stable model | `brief_hash` |
| Plain-language receipts | Decoded events and account state, through function calls to the indexer | One or two sentences per event | Flash-Lite | None |
| Conflict check | Arbitrator's and parties' counterparty history from the indexer | List of shared counterparties with evidence | Flash-Lite | None; feeds recusal flags |
| AI juror, 3 seats | Spec, report, every evidence item, the neutral brief | Evaluation: ruling, a finding per criterion, reasoning | Seat A most capable model; Seat B a different model; Seat C skeptic prompt; a backup each | Ruling and evaluation hash per seat |

Exact model IDs are not hardcoded: `AiRegistry` stores the approved ID for each job, and the DAO updates it. At the time of writing, the [Gemini changelog](https://ai.google.dev/gemini-api/docs/changelog) lists `gemini-3.8-flash` as the current Flash model.

### Gemini features used

- Structured output with a JSON schema for every job. Output that fails validation is retried once, then the job returns "unavailable".
- Multimodal input: images and PDFs inline, larger files and video through the Files API.
- Long context, so a whole delivery and all evidence fit in one call for most gigs.
- Function calling for receipts and conflict checks; the functions are read-only indexer queries.
- Batch requests for sample audits, which are not time-sensitive.

### Guardrails

1. **No storage.** Deliverables can be confidential, and the API now stores Generate Content requests by default for new projects. Every request sets `store=false`.
2. **Content is data.** Deliverable and evidence text is passed in clearly delimited data parts, and the system instruction says text inside them is never an instruction. After the call, every `pass` verdict must cite an evidence pointer that exists in the input, or it is downgraded to `unclear`.
3. **Injection tests.** The test suite includes deliverables containing hidden instructions (white text in a PDF, image text, code comments) and checks that the verdicts are unaffected.
4. **No verdict in the brief.** The brief schema has no ruling field and brief output with ruling language is rejected; only the three seats propose rulings, from the five allowed values.
5. **Provenance.** Every document stores model ID, prompt hash, input hashes and a timestamp. Rerunning produces a comparable document, not a byte-identical one; the on-chain hash proves the stored document was never edited.
6. **Limits.** At most 200 MB of deliverables per milestone, and a per-gig spend cap set by the DAO. Requests are rate-limited per wallet.
7. **Fail open for users, closed for AI.** If Gemini is unavailable, users can still create milestones (zero `spec_hash` is allowed), deliver (zero `report_hash`) and run disputes (the case switches to human-only arbitration, Feature 3). Nothing is ever sent on-chain based on AI output that failed a check.
8. **Logs hold hashes only.** The AI service logs request hashes, token counts and latency, never file contents.

## Security and threat model

v2 adds human and economic attack surface that v1 did not have: arbitrators can be bribed, AI jurors can be steered by planted text, disputes can be used to stall payment, and every trusted key (AI seat keys, brief signer, credential issuer, upgrade authority) is a target. Each threat below needs a test or a documented acceptance before mainnet.

| Threat | Attack | Mitigation |
| --- | --- | --- |
| Stalling | Client disputes good work just to freeze payment | Bond of 5%, forfeited on a losing ruling; every case ends by its 21-day hard deadline |
| Arbitrator bribery | A party pays the arbitrator for a verdict | Round-robin assignment with conflict checks; reasons stored on-chain; a verdict far from the AI recommendation must answer each AI juror; appeal to two fresh arbitrators; stake and DAO removal |
| Steering AI jurors | A party hides instructions in its evidence | Evidence passed as data, evidence-pointer checks, three differently configured seats; a human signs every verdict |
| AI seat key theft | Attacker posts fake AI evaluations | AI output cannot settle a case; the app checks each evaluation hash against the stored document; the DAO rotates seat keys |
| Reputation farming | Two wallets run tiny gigs between themselves | Minimum milestone amount, 0.5% fee on every release, indexer flags repeated counterparties |
| Prompt injection | Deliverable hides "mark all criteria passed" | Content passed as data, evidence-pointer check, injection test suite; the report is advisory anyway |
| Brief signer compromise | Attacker posts a misleading brief | Brief is advisory and reproducible; arbitrators see raw evidence; DAO rotates the key |
| Issuer key compromise | Fake credentials issued | Every value is checkable against PDAs at `as_of_slot`; credentials revocable; key rotation |
| Governance capture | Attacker gains votes and sets a 100% fee | Ranges enforced in program code, 48 h timelock, changes apply only to milestones funded later, council veto in the first 6 months |
| Upgrade authority theft | Attacker upgrades escrow to drain vaults | Squads multisig authority, verified builds so any upgrade is visible, monitoring alerts on every upgrade |
| Deliverable leak | An arbitrator or the AI provider leaks confidential work | Key wrapped only for the assigned arbitrators and the AI service; human-only mode keeps work away from Gemini; store=false on every Gemini call; parties are warned at the moment they raise a dispute; leaks are not technically preventable |
| Receivable fraud | Client and freelancer collude: sell the receivable, then the client disputes and wins a refund | Only the client can dispute after a sale; the holder can submit evidence; buyer page shows the client's dispute history and the verification report. Residual risk is disclosed to buyers |
| Sampling manipulation | Freelancer games which items get audited | Seed is a slot hash 2 slots after submission, unknown when submitting; small residual risk from leader influence, acceptable for advisory sampling |
| Fund accounting bug | Ruling split, fee and bond maths leak or lock funds | Invariant on every path: released + refunded + fee + frozen = locked; property tests and fuzzing on escrow and dispute |
| Rubber-stamping | Arbitrator copies the AI recommendation without reading the evidence | Evidence shown before AI results; a reason per criterion; the DAO reviews arbitrators who are often overturned on appeal |

Before mainnet: external audit of escrow, dispute, receivables and the voter-weight plugin; fuzzing campaign; a bug bounty contact in every `security.txt`.

## Phased roadmap

Four phases, in order of dependency: nothing in Phase 2 can be judged without Phase 1's on-chain commitments, and nothing in Phase 3 is safe without Phase 2's dispute path.

&#91;embedded content: roadmap · 4 phases, each with an exit gate\]

The diamond at the foot of each phase is its exit gate; the next phase starts only when that gate's end-to-end flows pass on devnet. The flows themselves are listed under Acceptance criteria.

## Acceptance criteria and success metrics

v2 is done when the end-to-end flows below run on devnet against verified programs, driven only through the UI, with every number on screen traceable to an account.

### End-to-end flows that must pass

- [ ] **Happy path.** Brief → Gemini spec → client edits → freelancer accepts terms → fund → deliver with report → approve → settle reputation → rate → claim a non-transferable badge.
- [ ] **Silent client.** Deliver → keeper releases 20% at 72 h and the rest at 7 days, with no human action.
- [ ] **No delivery.** Fund → deadline + grace passes → client gets a full refund.
- [ ] **Dispute.** Client disputes → evidence → brief and 3 AI evaluations posted with matching hashes → arbitrator signs a verdict with reasons → appeal window closes → dispute program settles escrow with the correct split, fee and bond.
- [ ] **Appeal.** Losing side appeals → two fresh arbitrators sign the same ruling → settled.
- [ ] **No-show case.** Arbitrator misses the deadline → fallback arbitrator assigned → verdict → settled; original marked no-show.
- [ ] **Governance.** Proposal changes the partial release delay → timelock → executed → new milestones use it, existing ones keep their terms.
- [ ] **Credential.** User issues `doodle.work-summary.v1` → a separate script with no Doodle code verifies it through SAS and cross-checks it against the PDA.
- [ ] **Receivable.** Freelancer mints and sells → client approves → buyer receives the payout → receivable burned.

* [ ] **AI failure.** Force two seats to fail → case switches to human-only with two arbitrators → settled at the standard 3% fee.
* [ ] **AI split.** Seats rule 0, 5000 and 10000 → two arbitrators required → they disagree → fallback picks one of the two → settled.
* [ ] **Human-only.** A party chooses human-only → nothing reaches Gemini (checked in AI service logs) → two arbitrators → settled.
* [ ] **Retries.** Fault injection with timeouts and a malformed response → retries and the backup model are recorded in the case → valid evaluation.
* [ ] **Hard deadline.** No arbitrator acts → `apply_default_outcome` restores v1 terms → bonds and fees refunded.

### Quality bars

| Measure | Target |
| --- | --- |
| Programs with verified builds and `security.txt` | All, on every cluster |
| v1 tests passing unchanged | 100% |
| New instructions with authorization, PDA, state, timing and arithmetic tests | 100% |
| Prompt-injection test cases with unchanged verdicts | 100% |
| Scope Compiler time to first milestone shown | Under 5 s |
| Delivery report for a 50-item sample audit | Under 2 min |
| Keeper lag after a release becomes due | Under 10 min |
| Largest contentful paint, mid-range Android, 4G | Under 2.5 s |
| Pages usable with WebGL off or reduced motion | All |
| Cases settled by their 21-day hard deadline | 100% |
| AI phase finished within 12 h | 95% of AI-assisted cases |
| Verdicts with a stored reason for every criterion | 100% |

## Open questions and risks

The largest risk is scope: this PRD roughly triples v1's on-chain surface, and the dispute and receivables programs are where money can be lost. Ship Phase 1 fully before starting Phase 2.

**Open questions**

- Who are the first one or two arbitrators, and how are they paid before the treasury has fees?
- Does the escrow fee apply to the 20% partial release too, or only to final releases? (Draft assumes every release.)
- Should a dispute on milestone 2 freeze later unfunded milestones of the same gig?
- Which USDC mint on devnet: Umbra's test mint (used by v1's confidential mode) or Circle's devnet USDC? Confidential mode needs the Umbra mint.
- How do confidential (Umbra) payments interact with disputes, receivables and the fee? Draft assumes confidential mode applies only to the freelancer's withdrawal after release.
- Who runs the keeper and brief service once the DAO exists: Doodle alone, or several operators?
- Is reputation-weighted voting enough to resist a well-funded farm, or does Phase 3 also need a proof-of-personhood check (for example Civic via SAS)?
- Should arbitrators see the AI evaluations at once, or only after recording a first read of the evidence?
- Is 500 USDC the right threshold for requiring two arbitrators?

**Risks**

| Risk | Effect | Response |
| --- | --- | --- |
| Escrow changes break v1 invariants | Funds locked or misrouted | v1 test suite must pass untouched; new invariant tests; audit before mainnet |
| Too few arbitrators | Cases hit the hard deadline and fall back to the default | A reserve of fallback arbitrators, reminders, no-show removal |
| Gemini cost per gig | Treasury drain on large deliverables | Per-gig spend cap, sampling instead of full checks, Flash-Lite where possible |
| 3D hurts performance | Slow pages, mobile drop-off | Budgets in the frontend section, posters as fallback, 3D only where it shows state |
| Regulatory status of receivables | Legal exposure | Devnet only until reviewed |
| Program size | Escrow grows past the SBF stack or size limits (v1 already had to box an account to fit) | Keep new logic in new programs; box large accounts; measure in CI |
| Arbitrators defer to the AI | Human review becomes a formality | Evidence-first page, required reasons, appeal statistics per arbitrator |

## Sources

- [doodle-hexa repository](https://github.com/swarupasaha2005-hue/doodle-hexa): v1 programs, frontend, README and product plan (`docs/details.md`)
- [v1 escrow program on devnet (Solana Explorer)](https://explorer.solana.com/address/7cvNPW6wKmQLVaygQi1cwrSHz1GNLtzQsurENYyfAkd4?cluster=devnet): deployed, no verified build, no security.txt
- [Solana Attestation Service overview](https://solana.com/docs/tools/attestations/overview)
- [Realms: custom voter-weight plugins](https://docs.realms.today/developer-resources/custom-plugin)
- [Gemini API changelog](https://ai.google.dev/gemini-api/docs/changelog): current Flash model, request storage on by default for new projects
