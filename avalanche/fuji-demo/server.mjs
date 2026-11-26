// server.mjs - minimal x402 v2 seller: GET /paid costs 0.01 USDC, settled by PayAI.
//
// Env:
//   NIRIUM_EVM_PAYTO   (required) address that receives the USDC
//   NIRIUM_NETWORK     eip155:43113 (default, Fuji) | eip155:43114 (C-Chain)
//   NIRIUM_AMOUNT      atomic USDC units, default "10000" (= 0.01 USDC)
//   PORT               default 4021
//   FACILITATOR_URL    default https://facilitator.payai.network
//
// Holds no keys: the seller only receives. PayAI verifies and settles.
import express from "express";
import { isAddress } from "viem";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { getNetwork, USDC_EXTRA, PAYAI_FACILITATOR } from "./networks.mjs";

const network = process.env.NIRIUM_NETWORK || "eip155:43113";
const net = getNetwork(network);
const payTo = process.env.NIRIUM_EVM_PAYTO;
const amount = process.env.NIRIUM_AMOUNT || "10000";
const port = Number(process.env.PORT || 4021);
const facilitatorUrl = process.env.FACILITATOR_URL || PAYAI_FACILITATOR;

if (!payTo || !isAddress(payTo)) {
  console.error("NIRIUM_EVM_PAYTO must be set to a valid 0x address");
  process.exit(2);
}
if (!/^\d+$/.test(amount)) {
  console.error("NIRIUM_AMOUNT must be an integer in atomic units");
  process.exit(2);
}

const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
const resourceServer = new x402ResourceServer(facilitator).register(network, new ExactEvmScheme());

const app = express();
app.use(
  paymentMiddleware(
    {
      "GET /paid": {
        accepts: [
          {
            scheme: "exact",
            network,
            payTo,
            // Explicit asset + EIP-712 domain: Fuji USDC is not in @x402/evm 2.32.0 DEFAULT_ASSETS.
            price: { amount, asset: net.usdc, extra: { ...USDC_EXTRA } },
            maxTimeoutSeconds: 120,
          },
        ],
        description: "Nirium selftest resource",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/paid", (req, res) => {
  res.json({ ok: true, resource: "nirium-selftest", network, at: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`seller on http://localhost:${port}/paid  network=${network}  asset=${net.usdc}  amount=${amount}  payTo=${payTo}  facilitator=${facilitatorUrl}`);
  if (net.mainnet) console.log("WARNING: mainnet. Real USDC.");
});
