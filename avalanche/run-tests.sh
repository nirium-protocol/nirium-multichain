#!/usr/bin/env bash
# Runs every fixture; prints each check and the exit code.
cd "$(dirname "$0")"
run() { echo; echo "### $1 ($2)"; node verify-evm-receipt.mjs "fixtures/$1.json" $3; echo "exit=$?"; }
for f in june-ok june-bad-index june-bad-amount june-bad-to june-bad-nonce june-bad-content-sha256; do run $f "--no-sig" --no-sig; done
for f in june-ok june-sig-ephemeral june-sig-tampered june-sig-forged-payer; do run $f "signature required"; done
