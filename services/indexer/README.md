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

1. Copy the new IDL into `src/idl/` (and add the program to `src/programs.ts` if it is a new program).
2. Add a handler to `EVENT_HANDLERS` in `src/handlers/events.ts`: its activity row (`actors`, `gig`, `milestone`, `amount`, `receipt`) and the column writes (`set`, `inc`, `remove`). New account types go in `src/handlers/accounts.ts`.
3. New columns need a new `migrations/NNNN_*.sql` file and an entry in `TABLES` (`src/handlers/types.ts`).

`test/decode.test.ts` fails when an IDL event or account has no handler.

## API

All amounts are token base units, times unix seconds. Lists return `{ items, nextCursor }`.

- `GET /healthz`: database check plus ingest cursors.
- `GET /v1/gigs?q=&category=&skill=&minBudget=&maxBudget=&status=&client=&freelancer=&cursor=&limit=`: full-text search (`websearch_to_tsquery` over title, skills, category, description) ranked by relevance, then newest. `status` takes a comma list.
- `GET /v1/gigs/:gig`, `GET /v1/gigs/:gig/milestones`, `GET /v1/milestones/:milestone`: `Gig` / `Milestone` shapes from `@proove/types` plus `slot`.
- `GET /v1/activity?wallet=&gig=&milestone=&cursor=&limit=`: `ChainEvent`s, newest first. `wallet` matches named actors and events on gigs where the wallet is client or freelancer.
- `GET /v1/reputation/:wallet`: the `UserProfile` counters, badges and received ratings, each value as `{ value, account, slot }`.

Fields the v1 programs do not emit yet (milestone `title`, `specHash`, `deliveryHash`, `reportHash`, `termsAccepted`, `feesPaid`, `refunded`, `terms`; profile `onTimeJobs`, `disputesWon`, `disputesLost`; rating `gig`) are `null` until the extended programs ship. `submittedSlot` is taken from the `DeliverySubmitted` transaction slot meanwhile; gig `mint` is only known after an account backfill.

## Tests

`pnpm --filter @proove/indexer test`. Decoder and handler tests build real Anchor-encoded logs and accounts from the IDLs. DB and API tests use the docker Postgres (each run gets its own schema) and skip with a message when it is not reachable.
