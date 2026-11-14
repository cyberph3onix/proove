#!/usr/bin/env bash
# Regenerate packages/idl from the program sources.
# Usage: scripts/gen-idl.sh          write IDLs + TS types
#        scripts/gen-idl.sh --check  fail if the committed IDLs are stale (CI drift check)
set -euo pipefail
cd "$(dirname "$0")/.."
AGAVE_BIN="${AGAVE_BIN:-$HOME/.local/share/solana/install/releases/3.1.10/solana-release/bin}"
export PATH="$AGAVE_BIN:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
out=packages/idl/src
for p in gig escrow reputation achievement; do
  echo "== idl $p"
  anchor idl build -p "$p" -o "$out/idl/$p.json" -t "$out/types/$p.ts" > /dev/null
done
# The web app pins its Turbopack root to apps/web, so keep a copy inside it.
web=apps/web/src/lib/anchor/idl
mkdir -p "$web"
cp "$out"/idl/*.json "$web"/
cp "$out"/types/*.ts "$web"/
if [ "${1:-}" = "--check" ]; then
  git diff --exit-code -- "$out" "$web" || { echo "IDLs are stale: run scripts/gen-idl.sh and commit"; exit 1; }
fi
