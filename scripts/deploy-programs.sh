#!/usr/bin/env bash
# Deploy (or upgrade) the four programs to a cluster with their program keypairs.
# Usage: scripts/deploy-programs.sh <localnet|devnet> [program...]
# For devnet, build with scripts/verify-build.sh first so the binaries are verifiable.
set -euo pipefail
cd "$(dirname "$0")/.."
AGAVE_BIN="${AGAVE_BIN:-$HOME/.local/share/solana/install/releases/3.1.10/solana-release/bin}"
export PATH="$AGAVE_BIN:$PATH"
cluster="${1:?usage: deploy-programs.sh <localnet|devnet> [program...]}"; shift
case "$cluster" in
  localnet) url=http://127.0.0.1:8899 ;;
  devnet) url=https://api.devnet.solana.com ;;
  *) echo "unknown cluster $cluster"; exit 1 ;;
esac
programs=("$@")
[ ${#programs[@]} -eq 0 ] && programs=(reputation gig escrow achievement)
echo "deployer: $(solana address) balance: $(solana balance -u "$url")"
for p in "${programs[@]}"; do
  echo "== deploying $p"
  solana program deploy -u "$url" \
    --program-id "target/deploy/$p-keypair.json" \
    --max-sign-attempts 50 --use-rpc \
    "target/deploy/$p.so"
done
