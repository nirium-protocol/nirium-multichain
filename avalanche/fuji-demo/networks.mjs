// Network table shared by server, client and make-binding.
// USDC addresses: Circle's official page (developers.circle.com/stablecoins/usdc-contract-addresses),
// checked 25-nov-2026. EIP-712 domain of both contracts: name "USD Coin", version "2".
import { avalanche, avalancheFuji } from "viem/chains";

export const NETWORKS = {
  "eip155:43113": {
    chain: avalancheFuji,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    explorer: "https://testnet.snowtrace.io/tx/",
    mainnet: false,
  },
  "eip155:43114": {
    chain: avalanche,
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    explorer: "https://snowtrace.io/tx/",
    mainnet: true,
  },
};

export const USDC_EXTRA = { name: "USD Coin", version: "2" };
export const PAYAI_FACILITATOR = "https://facilitator.payai.network";

export function getNetwork(id) {
  const n = NETWORKS[id];
  if (!n) throw new Error(`unsupported network ${id}; use one of ${Object.keys(NETWORKS).join(", ")}`);
  return n;
}
