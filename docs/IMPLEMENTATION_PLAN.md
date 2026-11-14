# Proove implementation plan

The working checklist for building the PRD (`Doodle v2 — Product Requirements Document.md`). Each session picks up the first unchecked item in the current phase, finishes it with tests, ticks it here, and commits. A phase ends only when its exit gate passes.

## How to resume

1. Read this file, then the PRD section for the item you're on.
2. Use the mock chain as the behavioural spec: `apps/web/src/lib/mock/instructions.ts`, with its acceptance flows in `chain.test.ts`. Rust programs must match it (statuses, errors, maths). If the PRD and the mock disagree, the PRD wins: fix the mock and its test too.
3. v1 source to port from: `~/Dev/doodle-hexa-v1` (read-only; clone from https://github.com/swarupasaha2005-hue/doodle-hexa if it's missing).
4. Ask the owner before big decisions (new dependencies with lock-in, hosting, key custody, anything spending money).
5. Every commit is authored by the owner only. No AI co-author trailers or credits anywhere.

## Decisions already made

| Topic | Decision |
| --- | --- |
| Name | Proove (the PRD says Doodle). |
| Repo | pnpm monorepo: `apps/web`, `programs/*`, `services/*`, `packages/*`. |
| Order | Frontend on mocks first (done), then Phase 1 → 2 → 3. |
| Services | TypeScript (Node 24), local Postgres in Docker for dev. |
| Toolchain | Rust stable, Agave Solana 3.1.10, Anchor 1.1.2 via avm, litesvm for program tests. |
| 3D | three core + jsm add-ons only (no drei/postprocessing), 3D chunk ≤ 250 KB gzipped. |
| Dev port | Web on 3100 (3000 is used by another local app). |

## Open inputs (ask the owner when the work needs them)

- Gemini API key for `services/ai` (put in `.env`, never committed).
- RPC: public devnet, or a Helius key (Helius webhooks would replace polling in the indexer).
- Devnet USDC mint: Circle devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) or Umbra's test mint. PRD open question; the mock uses Circle's.
- Upgrade authority: a Squads multisig needs the founders' wallets.
- Irys/Arweave: devnet uploads need a funded devnet wallet.

## Toolchain notes

- Programs build with Agave 3.1.10's `cargo-build-sbf` and platform-tools **v1.52** (v1.51 bundles a cargo too old for `block-buffer 0.12`). The tools live in `~/.cache/solana/v1.52/platform-tools`; if the automatic download times out, fetch the tarball with `curl -C -` and extract it there.
- Build: `PATH=~/.local/share/solana/install/releases/3.1.10/solana-release/bin:$PATH cargo build-sbf --tools-version v1.52 --manifest-path programs/<p>/Cargo.toml --sbf-out-dir target/deploy`, then `cargo test`. Tests load `target/deploy/*.so`, so build first.
- Program keypairs are in `target/deploy/*-keypair.json` (gitignored; the owner keeps a backup). IDs are recorded in `packages/config`.
- The achievement default metadata URI is still v1's `paygig.app`; set the real one with `set_base_uri` at deploy time.

---

## Phase 0: Frontend on mock data ✅

- [x] Monorepo, v1 web app carried over and rebranded
- [x] Domain types, RFC 8785 canonical JSON + SHA-256 hashing, reputation and dispute maths
- [x] Mock chain: every PRD instruction, keeper, AI pipeline simulator, seeded demo world, demo controls
- [x] All 20 routes, transaction lifecycle, 3D scenes with poster fallbacks
- [x] 20 acceptance-flow tests on the mock chain

## Phase 1: Agreement layer, core program changes, infrastructure

### Programs (port v1 into `programs/`, then make the additive changes)
- [x] Copy v1's `programs/{gig,escrow,reputation,achievement}`, `Anchor.toml`, `Cargo.toml` and the tests. Generate new program keypairs and update the `ESCROW_PROGRAM_ID` constants and compile-time assertions. All v1 tests pass unchanged (269 in `cargo test`; the earlier "351+" figure counted differently).
- [x] `security_txt!` in every program; `solana-verify build` works locally. (`scripts/verify-build.sh`, pinned to the `solana-verifiable-build:3.1.10` image; solana-verify's default image has cargo 1.84, which can't build edition-2024 crates. Deploy the Docker-built `.so`, which differs from a local build.)
- [x] New `protocol_config` account (owned by escrow, or a small `config` program; decide and note it here). **Decided: a PDA owned by escrow** (`[b"protocol_config"]`), with `init_protocol_config` (first caller becomes admin, so the deploy script runs it straight away), `update_protocol_config`, `set_protocol_admin` (DAO handoff) and a `treasury` token account. Also enforces `full_timeout >= partial_timeout`, which the mock doesn't. Holds `partialTimeout`, `fullTimeout`, `partialBps`, `feeBps`, `minMilestone`, `noDeliveryGrace`, with the ranges from `apps/web/src/lib/mock/ranges.ts` enforced in code. Admin is an upgrade-authority-held key until Phase 2 moves it to the DAO.
- [x] Escrow `Milestone` gains `spec_hash`, `delivery_hash`, `report_hash`, `terms_accepted`, `submitted_slot`, snapshotted terms, `fees_paid`, `refunded`. `create_milestone(amount, spec_hash)`; `submit_delivery(delivery_hash, report_hash)`.
- [x] `accept_terms` (freelancer signs, must match `spec_hash`); `fund_milestone` requires it when `spec_hash ≠ 0`; `MIN_MILESTONE_AMOUNT` from config.
- [x] Protocol fee on every release path (approve, partial, full), sent to the treasury token account.
- [x] `refund_after_deadline` (client; Funded, after gig deadline + grace). When every milestone is closed, the gig becomes Completed if anything was paid, otherwise Cancelled. Not ported yet: the mock's `ExceedsBudget` check (milestone total ≤ gig budget) in `create_milestone`.
- [x] Reputation: `update_completion(delivered_on_time, disputed_outcome)`, counters `on_time_jobs`, `disputes_won`, `disputes_lost`; `FastDeliverer` and `TrustedFreelancer` made awardable (thresholds as in `apps/web/src/lib/domain/reputation.ts`). Escrow counts late deliveries per gig (`EscrowVault.late_deliveries`, so `submit_delivery` now takes the vault); a job is on time if something was paid and nothing was late. `disputed_outcome` is always `None` until Phase 2.
- [x] Achievement: mint with the Metaplex Core permanent freeze plugin. (`PermanentFreezeDelegate { frozen: true }` with authority `None`. Tested end to end against Metaplex Core dumped from devnet into `programs/achievement/tests/fixtures/mpl_core.so`, plus a control test proving the plugin is what blocks the transfer.)
- [x] Gig: `GigStatus::Disputed` (escrow-signed only). Unused until Phase 2 but added now to keep the layout stable. (Plus `mark_disputed_by_escrow` / `clear_dispute_by_escrow`, both escrow-PDA-signed.)
- [x] Tests for every new instruction in v1's five categories (authorization, PDA forgery, state transitions, timing boundaries, arithmetic), plus the invariant: released + refunded + fees + locked = amount. (313 Rust tests: `escrow/tests/agreement_layer.rs`, `achievement/tests/soulbound.rs`, `gig/tests/disputed_status.rs`, plus unit tests.)
- [ ] Deploy to devnet with verified builds; record program IDs in `packages/config`.

### Packages
- [x] `packages/idl`: IDLs + generated TS clients (Codama or Anchor TS), with a CI drift check. (Anchor TS types via `scripts/gen-idl.sh`; `pnpm --filter @proove/idl check` is the drift check, to be wired into CI. Regenerate after every program change.)
- [x] `packages/types`: move `apps/web/src/lib/domain/*` here so services share it.
- [x] `packages/config`: cluster → RPC URL, program IDs, USDC mint.

### Services
- [x] `services/indexer`: decode program events, write Postgres (Docker compose in `infrastructure/`). APIs: gig search (full text plus category, budget, skill), gig and milestone detail, activity feed, `GET /v1/reputation/{wallet}` with account + slot for every value. (API on port 4100, Postgres on 5433. Built against the v1 IDLs: the new milestone/profile fields are nullable columns until the indexer switches to `packages/idl`.)
- [x] `services/keeper`: every 5 min sends due `partial_timeout_release`, `full_timeout_release` and `settle_reputation`. Idempotent; anyone can run it. (Unit-tested against an in-memory RPC; no real sends until the programs are on devnet.)
- [x] `services/ai`: Scope Compiler and Delivery Verifier on Gemini with structured output, `store=false`, the prompt-hash allow-list (static file until the Phase 2 `AiRegistry`), logs that hold hashes only, the injection test suite, per-wallet rate limits and the 200 MB cap. (Runs on a fake model until `GEMINI_API_KEY` is set. Not done: authenticating the `x-proove-wallet` header, the Gemini Files API for large files, and moving `ScopeResult` into `@proove/types`.)
- [x] Storage: browser-side AES-256-GCM encryption, upload via Irys, delivery manifest hash. Key wrapping for client and freelancer. (`packages/storage`; Irys uploads still need a funded wallet, and the delivery modal isn't wired yet.)
- [x] Random sample audit: seed from `SlotHashes` at `submitted_slot + 2`; anyone can recompute the sample. (`packages/storage`. The seed is only on-chain for ~512 slots, so the report records it; a follow-up could store it on the milestone.)

### Frontend wiring
- [ ] Add a data-mode switch (`NEXT_PUBLIC_DATA_MODE=mock|chain`). In chain mode, restore Privy + wallet-adapter (`components/wallet/wallet-provider.tsx`) and back `hooks/use-chain.ts` with indexer + RPC.
- [ ] `lib/tx.ts` chain mode: build, sign, send and confirm with the same phases; map Anchor errors to messages.
- [ ] Scope Compiler and verifier call `services/ai` instead of `lib/mock/ai.ts`.

### Exit gate (devnet, UI only)
- [ ] Happy path: brief → spec → edit → accept terms → fund → deliver with report → approve → settle reputation → rate → claim a non-transferable badge.
- [ ] Silent client: the keeper releases 20% at 72 h and the rest at 7 days.
- [ ] No delivery: refund after deadline + grace.
- [ ] CI (GitHub Actions): fmt, clippy, Rust tests, `anchor build`, `solana-verify build`, IDL drift, web lint/build/test, e2e on a local validator.

## Phase 2: Disputes, reliability, DAO

- [ ] `dispute` program: `DisputeConfig`, `Arbitrator`, `DisputeCase` (boxed), `EvidenceItem`; all instructions listed in the PRD's Feature 2. Mirror `instructions.ts` (raiseDispute … applyDefaultOutcome).
- [ ] Escrow: `MilestoneStatus::Disputed`, `raise_dispute` (with bond), release paths reject Disputed, and `execute_ruling` callable only by the dispute program's `dispute_authority` PDA (checked with `seeds::program`).
- [ ] Reliability: every deadline, retry and fallback from the Feature 3 table; `mark_ai_seat_failed`, `close_ai_phase`, `reassign_arbitrator`, tie-break default, `apply_default_outcome`; the 21-day hard deadline.
- [ ] AI service: neutral brief + seats A/B/C (differently configured), retries with backoff and a backup model, idempotency keys, schema/ruling/evidence-pointer validation, signed on-chain posting.
- [ ] Indexer conflict check (counterparty history) for assignment; reminder notifications at 24 h, 6 h and 1 h.
- [ ] Key wrapping for the AI service and assigned arbitrators; human-only mode sends nothing to Gemini (assert from the logs).
- [ ] Governance: SPL Governance (Realms) council 2-of-3, 48 h timelock, treasury account. Config accounts are owned by the DAO; `AiRegistry` holds approved prompt and model hashes.
- [ ] Monitoring dashboard and alerts (from the PRD).
- [ ] Exit gate: the dispute, appeal, no-show, AI failure, AI split, human-only, retries, hard-deadline and governance flows on devnet.

## Phase 3: Identity, receivables, community governance

- [ ] SAS: register the issuer + three schemas; issue/revoke from `/credentials`; W3C VC export signed by the issuer key; an external verification script with no Proove code.
- [ ] `receivables` program: `mint_receivable`, `list`, `delist`, `buy`, `burn_settled`; escrow `release_destination` pays the NFT holder.
- [ ] Voter-weight plugin: floor(√score) × min(jobs, 50)/50; council veto for 6 months.
- [ ] Move upgrade authority under the DAO.
- [ ] Stretch: selective disclosure ZK proofs (snarkjs); fiat on/off-ramp link-out.
- [ ] Exit gate: credential and receivable flows on devnet; external audit before any mainnet talk.
