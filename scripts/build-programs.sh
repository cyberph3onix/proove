#!/usr/bin/env bash
# Build every Anchor program to target/deploy with the pinned toolchain.
# Usage: scripts/build-programs.sh [program...]   (default: all)
set -euo pipefail
cd "$(dirname "$0")/.."
AGAVE_BIN="${AGAVE_BIN:-$HOME/.local/share/solana/install/releases/3.1.10/solana-release/bin}"
export PATH="$AGAVE_BIN:$HOME/.cargo/bin:$PATH"
programs=("$@")
[ ${#programs[@]} -eq 0 ] && programs=(reputation gig escrow achievement)
for p in "${programs[@]}"; do
  echo "== building $p"
  cargo build-sbf --tools-version v1.52 --manifest-path "programs/$p/Cargo.toml" --sbf-out-dir target/deploy
done
