# @proove/indexer

Reads the Proove Anchor programs (gig, escrow, reputation, achievement) into Postgres and serves them over HTTP.

## Run

```sh
docker compose -f infrastructure/docker-compose.yml up -d   # Postgres 16 on localhost:5433
pnpm --filter @proove/indexer migrate
pnpm --filter @proove/indexer backfill   # optional: snapshot all program accounts
pnpm --filter @proove/indexer dev        # API on :4100 + poller
```

| Env | Default |
| --- | --- |
| `DATABASE_URL` | `postgres://proove:proove@localhost:5433/proove_indexer` |
| `SOLANA_CLUSTER` | `devnet` (`localnet`, `mainnet-beta`) |
| `RPC_URL` | the cluster URL from `@proove/config` |
| `HOST` / `PORT` | `127.0.0.1` / `4100` |
| `POLL_INTERVAL_MS` | `10000` |
| `MAX_SIGNATURES_PER_POLL` | `1000` |
| `INDEXER_MODE` | `all` (`api` or `ingest` to run one half) |

## How it works

- **Events.** Per program, `getSignaturesForAddress` runs from a stored cursor (`ingest_cursors`). Each transaction's logs are walked with the CPI stack, every `Program data:` line from one of our programs is decoded with that program's IDL (`BorshCoder`), and the transaction is written atomically. Events are keyed by `(signature, event_index)`, so re-ingesting is a no-op. Failed transactions are skipped.
- **Accounts.** `backfill` runs `getProgramAccounts` per IDL account type (discriminator filter) and writes each decoded account at the RPC context slot.
- **Provenance.** Every entity row stores `slot` and `field_slots` (the slot each column was last written at). A write never overwrites a column with an older slot, so events and snapshots can arrive in any order. The reputation API returns every value as `{ value, account, slot }`.
- **Sources.** `ChainSource` (`src/rpc/source.ts`) wraps the RPC. A Helius webhook would map each pushed transaction to a `TxRecord` and call `ingestTransactions`.

## Adding a program event or field

1. Regenerate the IDLs (`pnpm --filter @proove/idl generate`); the indexer reads them from `@proove/idl` (add a new program to `src/programs.ts`).
2. Add a handler to `EVENT_HANDLERS` in `src/handlers/events.ts`: its activity row (`actors`, `gig`, `milestone`, `amount`, `receipt`) and the column writes (`set`, `inc`, `remove`). New account types go in `src/handlers/accounts.ts`.
3. New columns need a new `migrations/NNNN_*.sql` file and an entry in `TABLES` (`src/handlers/types.ts`).

`test/decode.test.ts` fails when an IDL event or account has no handler.

## API

All amounts are token base units, times unix seconds. Lists return `{ items, nextCursor }`.

- `GET /healthz`: database check plus ingest cursors.
- `GET /v1/gigs?q=&category=&skill=&minBudget=&maxBudget=&status=&client=&freelancer=&cursor=&limit=`: full-text search (`websearch_to_tsquery` over title, skills, category, description) ranked by relevance, then newest. `status` takes a comma list.
- `GET /v1/gigs/:gig`, `GET /v1/gigs/:gig/milestones`, `GET /v1/milestones/:milestone`: `Gig` / `Milestone` shapes from `@proove/types` plus `slot`. Gig detail adds `vault` (EscrowVault totals: locked, released, fees, refunded, milestone counters) once the vault account has been snapshotted, else `null`. Hashes are 64-char hex (`ZERO_HASH` = none).
- `GET /v1/activity?wallet=&gig=&milestone=&cursor=&limit=`: `ChainEvent`s, newest first. `wallet` matches named actors and events on gigs where the wallet is client or freelancer.
- `GET /v1/protocol`: the escrow `ProtocolConfig` (admin, treasury, timeouts, bps, min milestone, no-delivery grace), each value as `{ value, account, slot }`, plus `treasury.totalFees` (summed `ProtocolFeeCollected` events; `slot` is the latest one) and `feeCount`. 404 until the config is indexed.
- `GET /v1/reputation/:wallet`: the `UserProfile` counters (including `onTimeJobs`, `disputesWon`, `disputesLost`), badges and received ratings, each value as `{ value, account, slot }`.

Still `null`: milestone `title` (off-chain spec), rating `gig` (ratings carry `job_id` only), gig `mint` until a Gig or EscrowVault snapshot. Milestone `terms` are `null` before funding; at `MilestoneFunded` they are copied from the indexed `ProtocolConfig` if it was written at or before the funding slot (otherwise they wait for a Milestone account snapshot). Profile counters indexed before the extended reputation program stay `null` until re-snapshotted.

## Tests

`pnpm --filter @proove/indexer test`. Decoder and handler tests build real Anchor-encoded logs and accounts from the IDLs. DB and API tests use the docker Postgres (each run gets its own schema) and skip with a message when it is not reachable.
