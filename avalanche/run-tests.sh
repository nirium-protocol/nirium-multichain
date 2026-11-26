#!/usr/bin/env bash
# Runs every fixture against the real June 2026 C-Chain transaction, prints each check,
# and compares each exit code with the expected one. Exits 1 if any case is unexpected.
cd "$(dirname "$0")"
total=0; ok=0
run() { # fixture, label, expected exit, extra flag
  total=$((total + 1))
  echo; echo "### $1 ($2), expect exit $3"
  node verify-evm-receipt.mjs "fixtures/$1.json" $4
  local code=$?
  if [ "$code" = "$3" ]; then ok=$((ok + 1)); echo "OK exit=$code"; else echo "UNEXPECTED exit=$code"; fi
}
run june-ok "--no-sig" 0 --no-sig
for f in june-bad-index june-bad-amount june-bad-to june-bad-nonce june-bad-content-sha256; do run $f "--no-sig" 1 --no-sig; done
for f in june-ok june-sig-ephemeral june-sig-tampered june-sig-forged-payer; do run $f "signature required" 1; done
echo; echo "$ok/$total as expected"
[ "$ok" = "$total" ]
