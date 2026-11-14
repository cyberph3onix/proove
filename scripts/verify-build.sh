#!/usr/bin/env bash
# Deterministic (verifiable) build of one or all programs in Docker.
# Deploy the .so this produces, so `solana-verify verify-from-repo` matches on-chain.
# Usage: scripts/verify-build.sh [program...]   (default: all)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
IMAGE="${VERIFY_IMAGE:-solanafoundation/solana-verifiable-build:3.1.10}"
programs=("$@")
[ ${#programs[@]} -eq 0 ] && programs=(reputation gig escrow achievement)
for p in "${programs[@]}"; do
  echo "== verified build: $p"
  solana-verify build --base-image "$IMAGE" --library-name "$p"
  solana-verify get-executable-hash "target/deploy/$p.so"
done
