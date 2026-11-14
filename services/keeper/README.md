# @proove/keeper

Sends the permissionless escrow instructions once they are due:

| Instruction | Due when |
| --- | --- |
| `partial_timeout_release` | milestone `Submitted`, cluster time ≥ `submitted_at + partial_timeout`, and the `partial_bps` share is non-zero |
| `full_timeout_release` | milestone `Submitted` or `PartialReleased`, cluster time ≥ `submitted_at + full_timeout`, and something is still locked |
| `settle_reputation` | vault `milestone_count > 0`, `active + cancelled + refunded ≥ milestone_count`, and `!reputation_synced` |

Anyone can run it, and several copies can run at once. The keeper holds no authority; it only pays transaction fees.

## Run

```sh
pnpm --filter @proove/keeper once -- --dry-run   # one tick, simulate only
pnpm --filter @proove/keeper once                # one tick, send
pnpm --filter @proove/keeper start               # tick every KEEPER_INTERVAL_SEC
```

| Env | Default |
| --- | --- |
| `SOLANA_CLUSTER` | `devnet` (`localnet`, `mainnet-beta`) |
| `RPC_URL` | the cluster URL from `@proove/config` |
| `KEEPER_KEYPAIR` | `~/.config/solana/id.json` (fee payer) |
| `KEEPER_INTERVAL_SEC` | `300` |
| `KEEPER_DRY_RUN` | off (`1` = same as `--dry-run`) |
| `KEEPER_MAX_ATTEMPTS` | `4` per action |
| `KEEPER_BACKOFF_MS` | `1000` (doubles per retry) |
| `KEEPER_PRIORITY_FEE` | `0` micro-lamports per compute unit |
| `KEEPER_COMMITMENT` | `confirmed` |
| `LOG_LEVEL` | `info` |

Logs are JSON lines: one `tick` line, then one line per action with its status (`sent`, `noop`, `skipped`, `dry-run`, `failed`).

## How a tick works

1. Read the cluster time from the Clock sysvar. The local clock is never used.
2. `getProgramAccounts` on escrow: `Milestone` accounts with status `Submitted` or `PartialReleased`, and `EscrowVault` accounts with `reputation_synced = false` (discriminator and byte memcmp filters).
3. Decide what's due with the pure functions in `src/due.ts`. One action per milestone: if the keeper was down past the full timeout, only the full release is sent, since it pays out everything still locked. A vault whose last milestone is released in a tick is settled on the next tick.
4. Batch-read the gigs, the `ProtocolConfig` (treasury), the freelancer USDC associated token accounts and reputation profiles, and build the instruction (`src/instructions.ts`). An action whose accounts are missing (no freelancer ATA, no profile, no config) is skipped with a logged reason and retried on the next tick.
5. For each action, one transaction: simulate, then sign and send, then confirm. Retries use a fresh blockhash and exponential backoff, and check whether the previous attempt landed first.

Idempotency comes from the programs: every action changes the status the next attempt is checked against. A simulation or confirmation failing with `InvalidStatus`, `TimeoutNotReached` or `InsufficientFunds` means another keeper got there first (or the action is not due by the cluster clock) and is logged as `noop`.

## Tests

```sh
pnpm --filter @proove/keeper test
```

`test/due.test.ts` covers the due rules at their boundaries; `test/instructions.test.ts` checks account order, writability and discriminators against `@proove/idl`; `test/keeper.test.ts` runs whole ticks against an in-memory RPC. `test/validator.test.ts` runs a dry-run tick against a local validator when one with the escrow program is reachable at `KEEPER_TEST_RPC` (default `http://127.0.0.1:8899`) and skips otherwise.
