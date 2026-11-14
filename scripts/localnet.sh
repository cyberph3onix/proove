#!/usr/bin/env bash
# Local validator with Metaplex Core preloaded (from the test fixture), for
# rehearsing deploys and e2e runs. Ledger lives in .localnet/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
AGAVE_BIN="${AGAVE_BIN:-$HOME/.local/share/solana/install/releases/3.1.10/solana-release/bin}"
export PATH="$AGAVE_BIN:$PATH"
exec solana-test-validator --reset --quiet --ledger .localnet \
  --bpf-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d programs/achievement/tests/fixtures/mpl_core.so \
  "$@"
