# fuji-demo: x402 payment + Nirium binding on Avalanche

Reference code, 26-nov-2026. Packages pinned: `@x402/express`, `@x402/evm`, `@x402/fetch`, `@x402/core` 2.32.0, `viem` 2.58.7, `express` 5.3.0. No keys are stored here. Nothing in this folder is committed anywhere.

## Before you start

- Two fresh keys: a **payer** and a **payTo**. Use keys made for this project only.
- Fuji: the payer needs Fuji USDC (`0x5425890298aed601595a70AB815c96711a31Bc65`) from faucet.circle.com (browser). It needs **no AVAX**: PayAI pays the gas.
- `npm ci` in this folder.

## Steps (Fuji)

| # | Command | Env it needs |
|---|---|---|
| 1 | `node server.mjs` (leave running) | `NIRIUM_EVM_PAYTO` (required); optional `NIRIUM_NETWORK`, `NIRIUM_AMOUNT` (default `10000` = 0.01 USDC), `PORT` (4021), `FACILITATOR_URL` (PayAI) |
| 2 | `curl -i http://localhost:4021/paid` should return 402 with a `PAYMENT-REQUIRED` header | none |
| 3 | `node client.mjs` pays and writes `settle.json` with the tx hash | `NIRIUM_EVM_PAYER_KEY` (required, never printed); optional `NIRIUM_URL`, `NIRIUM_MAX_ATOMIC` (cap, default `10000`) |
| 4 | `node make-binding.mjs --settle settle.json --ref selftest-2026-11-26-fuji-01` writes `binding.json`, signed by the payer | `NIRIUM_EVM_PAYER_KEY` (must be the payer of that tx, or nothing is written) |
| 5 | `node ../verify-evm-receipt.mjs binding.json` should end with `RESULT: VALID` | none |

`make-binding.mjs` also takes `--tx 0x.. --network eip155:43113` instead of `--settle`, plus `--resource`, `--note`, `--payer`/`--payto` (to narrow a batched tx), `--no-sign` and `--out`.

## C-Chain selftest (A3)

Same steps with `NIRIUM_NETWORK=eip155:43114` on server and client, plus `NIRIUM_ALLOW_MAINNET=1` on the client (without it, the client refuses to pay on mainnet). The asset switches to `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`. PayAI charges 0.0059 USD per settlement on mainnet (rate effective 23-nov-2026); Fuji is free. Keep the `selftest` label.

## Notes

- Fuji USDC is **not** in `@x402/evm` 2.32.0 `DEFAULT_ASSETS` (only C-Chain is). So the server sets `price: { amount, asset, extra: { name: "USD Coin", version: "2" } }`, and the client allows the asset through `spendControls.allowedAssets`, which is also the per-payment cap.
- The transfer method defaults to EIP-3009 (`transferWithAuthorization`) when `extra.assetTransferMethod` is not set.
- `locator.index` is the log index within the **block**, not within the tx. PayAI may settle through Multicall3, so the tx `to` is not the USDC contract.
- `record` is written with keys already sorted, so `sha256(JSON.stringify(record))` equals the canonical hash (compatible with verify-audit-cid).
