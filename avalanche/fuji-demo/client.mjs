// client.mjs - pays GET /paid with x402 v2 (EIP-3009 USDC), prints the settlement tx.
//
// Env:
//   NIRIUM_EVM_PAYER_KEY  (required) payer private key, 0x-prefixed. Never printed or written.
//   NIRIUM_NETWORK        eip155:43113 (default) | eip155:43114
//   NIRIUM_URL            default http://localhost:4021/paid
//   NIRIUM_MAX_ATOMIC     per-payment cap in atomic USDC, default "10000" (0.01 USDC)
//   NIRIUM_ALLOW_MAINNET  must be "1" to pay on eip155:43114
//
// Writes settle.json (tx, network, payer, resource) for make-binding.mjs --settle.
import { writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { getNetwork } from "./networks.mjs";

const network = process.env.NIRIUM_NETWORK || "eip155:43113";
const net = getNetwork(network);
const url = process.env.NIRIUM_URL || "http://localhost:4021/paid";
const maxAtomic = process.env.NIRIUM_MAX_ATOMIC || "10000";
const key = process.env.NIRIUM_EVM_PAYER_KEY;

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("NIRIUM_EVM_PAYER_KEY must be a 0x-prefixed 32-byte hex key");
  process.exit(2);
}
if (net.mainnet && process.env.NIRIUM_ALLOW_MAINNET !== "1") {
  console.error("refusing to pay on mainnet without NIRIUM_ALLOW_MAINNET=1");
  process.exit(2);
}

const account = privateKeyToAccount(key);
console.log(`payer=${account.address} network=${network} url=${url} cap=${maxAtomic} atomic`);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network, client: new ExactEvmScheme(account) }],
  // Fuji USDC is not a default asset in 2.32.0, so it must be allowed explicitly.
  // The same entry is the per-payment cap (atomic units) on both networks.
  spendControls: {
    allowedAssets: [{ network, asset: net.usdc, maxAmountPerPayment: maxAtomic }],
  },
});

const res = await fetchWithPayment(url, { method: "GET" });
const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(`body: ${body.slice(0, 500)}`);

const header = res.headers.get("PAYMENT-RESPONSE");
if (!header) {
  console.error("no PAYMENT-RESPONSE header: nothing settled");
  process.exit(1);
}
const settle = decodePaymentResponseHeader(header);
console.log("settle:", JSON.stringify(settle));
if (!settle.success || !settle.transaction) {
  console.error(`settlement failed: ${settle.errorReason || "unknown"} ${settle.errorMessage || ""}`);
  process.exit(1);
}
const out = { tx: settle.transaction, network: settle.network || network, payer: settle.payer || account.address, resource: url };
writeFileSync("settle.json", JSON.stringify(out, null, 2));
console.log(`tx: ${settle.transaction}`);
console.log(`explorer: ${net.explorer}${settle.transaction}`);
console.log("wrote settle.json");
