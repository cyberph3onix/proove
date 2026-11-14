# PROOVE

Non-custodial milestone escrow on Solana, with the trust layer around it: agreed terms, AI-checked deliveries, disputes decided by staked human arbitrators (with AI jurors proposing), DAO-governed settings, portable credentials and tokenized receivables.

The full spec is in [`Doodle v2 — Product Requirements Document.md`](./Doodle%20v2%20—%20Product%20Requirements%20Document.md). Proove builds on the v1 codebase ([doodle-hexa](https://github.com/swarupasaha2005-hue/doodle-hexa)).

## Status

| Area | State |
| --- | --- |
| Frontend (`apps/web`) | All 20 routes built against a **mock data layer**: v1 pages refined plus `/disputes`, `/arbitrate`, `/governance`, `/credentials`, `/receivables`, with 3D scenes. Phase 1 routes can run against real programs with `NEXT_PUBLIC_DATA_MODE=chain`. |
| Mock chain (`apps/web/src/lib/mock`) | Every PRD instruction (escrow, dispute, receivables, governance, SAS) with real status checks and arithmetic, plus a keeper and an AI-pipeline simulator. 20 acceptance-flow tests. |
| Anchor programs | Phase 1 programs implemented (gig, escrow, reputation, achievement), with 313 Rust tests. Deployed to localnet; **not on devnet**. |
| Services (indexer, keeper, AI, storage) | Implemented and tested locally. The indexer API is the chain-mode read source; the AI verifier is wired into the delivery modal. |

Nothing is deployed to devnet. The phase-by-phase checklist is in [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3100
pnpm --filter @proove/web test
```

Mock mode signs you in with a demo wallet. The **Demo** button (bottom left) lets you:
- switch persona (client, freelancer, arbitrator/council, receivables buyer);
- time-travel the chain clock, so you can watch the 72 h and 7 day releases, dispute windows and timelocks fire;
- force AI juror failures, splits or retries;
- inject a failed transaction, airdrop devnet USDC, or reset the data.

### Chain mode (localnet)

```bash
scripts/localnet.sh                 # validator + Postgres (infrastructure/)
scripts/deploy-programs.sh localnet
pnpm --filter @proove/deploy setup  # protocol config, mint, treasury
pnpm --filter @proove/indexer migrate
pnpm --filter @proove/indexer dev   # indexer API on :4100
pnpm --filter @proove/ai dev        # optional: Delivery Verifier on :3200
NEXT_PUBLIC_DATA_MODE=chain \
NEXT_PUBLIC_CLUSTER=localnet \
NEXT_PUBLIC_USDC_MINT=<mint from deployments/localnet.json> \
NEXT_PUBLIC_PRIVY_APP_ID=<privy app id> \
pnpm dev
```

Chain mode covers the Phase 1 routes (`/gigs`, `/gigs/new`, `/gigs/[gigId]`, `/talent`, `/reputation/[wallet]`, `/client`, `/dashboard`, `/transactions`, `/wallet`, `/services-taken`). Disputes, governance, credentials and receivables stay mock-only until their programs ship.

## Layout

```
apps/web/
  src/app/                 routes (Next.js 16 app router)
  src/lib/mock/            mock chain: instructions, keeper, AI simulator, seed, zustand store
  src/lib/chain/           data mode, indexer/RPC sync, pending milestone specs
  src/lib/ai/              delivery-verifier client for services/ai
  src/lib/tx.ts            transaction lifecycle (idle → signing → sent → confirmed → finalized | failed)
  src/hooks/use-chain.ts   the only read API pages use; reads the mock store in both modes
  src/components/three/    3D scenes (three.js + react-three-fiber, on-demand rendering, poster fallbacks)
  src/lib/anchor, umbra, privy, wallet   v1 chain integration, kept for Phase 1
```

## Design rules carried into code

- **Motion follows state.** 3D success motion starts only when a transaction is `confirmed`.
- **Commit, then show.** Specs, deliveries, reports, briefs, evaluations and verdict reasons are hashed over canonical JSON. The UI can recompute and verify each hash in the browser.
- **AI never settles a case.** Seats only propose. Funds move on a signed verdict or the defined default outcome.
- **3D budget.** One canvas per page, DPR ≤ 1.5, renders on demand, paused off-screen, and a static poster for reduced motion or no WebGL. The 3D chunk is about 245 KB gzipped.

## License

MIT. See [LICENSE](./LICENSE).
