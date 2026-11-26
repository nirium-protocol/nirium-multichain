#!/usr/bin/env node
// verify-evm-receipt.mjs - read-only check of a Nirium EVM payment binding.
//
// Usage:
//   node verify-evm-receipt.mjs <binding.json> [--no-sig] [--rpc <url>] [--json]
//
// Format "nirium-payment-binding-v1" (fixed 26-nov-2026):
// {
//   "version": "nirium-payment-binding-v1",
//   "content_sha256": "<hex sha256 of canonical(record)>",
//   "record": {
//     "labels": ["selftest"],
//     "payment": {
//       "amount": "10000", "asset": "0x...", "decimals": 6,
//       "from": "0x..payer", "to": "0x..payTo", "tx": "0x..",
//       "locator": { "index": 17, "kind": "evm-log" },   // block-level log index
//       "network": "eip155:43113",
//       "x402": { "nonce": "0x..authNonce", "resource": "https://...", "scheme": "exact" }
//     },
//     "purpose": { "note": "...", "ref": "..." }
//   },
//   "agent": { "alg": "eip191-secp256k1", "key": "0x..payer",
//              "signature": "0x..", "statement": "nirium-audit-v1:<content_sha256>" },
//   "network": "eip155:43113"
// }
//
// canonical() = keys sorted recursively, no whitespace, values as JSON.stringify
// writes them; applied ONLY to `record`.
// --no-sig skips the `agent` block entirely (used for third-party txs we did
// not sign); the record hash and every on-chain check still run.
//
// Not supported yet: payers that are smart wallets (ERC-1271/6492)
// need publicClient.verifyMessage instead of the standalone ECDSA verifyMessage.
// Not supported yet: seller-signed bindings (agent.key == payment.to) once that role exists.
//
// No keys, no writes: only eth_chainId and eth_getTransactionReceipt.
// Exit code 0 = every check passed, 1 = at least one failed, 2 = bad input.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createPublicClient, http, decodeEventLog, parseAbi, getAddress,
  isAddressEqual, verifyMessage,
} from "viem";
import { avalanche, avalancheFuji } from "viem/chains";

export const VERSION = "nirium-payment-binding-v1";
export const STATEMENT_PREFIX = "nirium-audit-v1:";

const CHAINS = {
  "eip155:43114": { chain: avalanche, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
  "eip155:43113": { chain: avalancheFuji, usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" },
};

const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

export function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  return "{" + Object.keys(v).sort()
    .filter((k) => v[k] !== undefined)
    .map((k) => JSON.stringify(k) + ":" + canonicalize(v[k])).join(",") + "}";
}

export function contentSha256(record) {
  return createHash("sha256").update(canonicalize(record), "utf8").digest("hex");
}

const eqAddr = (a, b) => { try { return isAddressEqual(a, b); } catch { return false; } };

export async function verifyBinding(doc, { requireSig = true, rpc } = {}) {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });

  const p = doc?.record?.payment;
  if (!p) throw new Error("missing record.payment");
  for (const k of ["amount", "asset", "from", "to", "tx", "network"]) {
    if (p[k] === undefined || p[k] === null || p[k] === "") throw new Error(`missing record.payment.${k}`);
  }
  if (!p.locator || p.locator.index === undefined) throw new Error("missing record.payment.locator.index");
  if (!p.x402?.nonce) throw new Error("missing record.payment.x402.nonce");
  const net = CHAINS[p.network];
  if (!net) throw new Error(`unsupported network ${p.network}`);

  // Document-level consistency.
  add("version == nirium-payment-binding-v1", doc.version === VERSION, `version=${doc.version}`);
  add("network == record.payment.network", doc.network === p.network, `doc=${doc.network} payment=${p.network}`);
  add("locator.kind == evm-log", p.locator.kind === "evm-log", `kind=${p.locator.kind}`);
  const computed = contentSha256(doc.record);
  add("content_sha256 == sha256(canonical(record))", doc.content_sha256 === computed,
    `doc=${doc.content_sha256} computed=${computed}`);
  add("asset is Circle USDC for this network", eqAddr(p.asset, net.usdc), `asset=${p.asset} expected=${net.usdc}`);
  add("decimals == 6", p.decimals === 6, `decimals=${p.decimals}`);

  // Chain.
  const client = createPublicClient({ chain: net.chain, transport: http(rpc) });
  const chainId = await client.getChainId();
  add("network == eip155:<RPC chainId>", p.network === `eip155:${chainId}`, `rpc chainId=${chainId}`);

  let receipt = null;
  try {
    receipt = await client.getTransactionReceipt({ hash: p.tx });
  } catch (e) {
    add("tx receipt found", false, e.shortMessage || e.message);
  }
  if (receipt) {
    add("tx status success (1)", receipt.status === "success", `status=${receipt.status} block=${receipt.blockNumber}`);

    const idx = Number(p.locator.index);
    const amount = BigInt(p.amount);
    const log = receipt.logs.find((l) => l.logIndex === idx);
    if (!log) {
      add(`log ${idx} exists in tx`, false, `tx log indexes: ${receipt.logs.map((l) => l.logIndex).join(",")}`);
    } else {
      add(`log ${idx} emitted by asset`, eqAddr(log.address, p.asset), `emitter=${log.address}`);
      let ev = null;
      try { ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics }); } catch {}
      const isTransfer = ev?.eventName === "Transfer";
      add(`log ${idx} is Transfer`, isTransfer, ev ? `event=${ev.eventName}` : "not decodable");
      if (isTransfer) {
        add("Transfer.from == payment.from", eqAddr(ev.args.from, p.from), `log=${ev.args.from}`);
        add("Transfer.to == payment.to", eqAddr(ev.args.to, p.to), `log=${ev.args.to}`);
        add("Transfer.value == payment.amount", ev.args.value === amount, `log=${ev.args.value} record=${amount}`);
      }
    }

    const auths = receipt.logs
      .filter((l) => eqAddr(l.address, p.asset))
      .map((l) => { try { return decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }); } catch { return null; } })
      .filter((e) => e?.eventName === "AuthorizationUsed");
    const match = auths.find((e) => eqAddr(e.args.authorizer, p.from)
      && e.args.nonce.toLowerCase() === String(p.x402.nonce).toLowerCase());
    add("AuthorizationUsed(payment.from, x402.nonce) in same tx", match,
      `found ${auths.length}: ${auths.map((e) => `${e.args.authorizer}/${e.args.nonce}`).join(" ; ") || "none"}`);
  }

  // Agent signature (payer).
  if (!requireSig) {
    add("agent signature (skipped: --no-sig)", true, "NOT checked");
  } else if (!doc.agent?.signature || !doc.agent?.key || !doc.agent?.statement) {
    add("agent block present", false, "agent.key, agent.statement and agent.signature are required");
  } else {
    const a = doc.agent;
    add("agent.alg == eip191-secp256k1", a.alg === "eip191-secp256k1", `alg=${a.alg}`);
    add("agent.statement == nirium-audit-v1:<content_sha256>", a.statement === STATEMENT_PREFIX + doc.content_sha256,
      `statement=${a.statement}`);
    add("agent.key == payment.from (payer signs)", eqAddr(a.key, p.from), `key=${a.key}`);
    let valid = false;
    try { valid = await verifyMessage({ address: a.key, message: a.statement, signature: a.signature }); } catch {}
    add("EIP-191 signature by agent.key over agent.statement", valid);
  }

  return { ok: checks.every((c) => c.ok), checks };
}

async function main() {
  const args = process.argv.slice(2);
  const rpcIdx = args.indexOf("--rpc");
  const file = args.find((a, i) => !a.startsWith("--") && (rpcIdx < 0 || i !== rpcIdx + 1));
  if (!file) { console.error("usage: node verify-evm-receipt.mjs <binding.json> [--no-sig] [--rpc url] [--json]"); process.exit(2); }
  const opts = { requireSig: !args.includes("--no-sig"), rpc: rpcIdx >= 0 ? args[rpcIdx + 1] : undefined };
  let doc;
  try { doc = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error(`bad binding file: ${e.message}`); process.exit(2); }
  let res;
  try { res = await verifyBinding(doc, opts); } catch (e) { console.error(`bad input: ${e.message}`); process.exit(2); }
  if (args.includes("--json")) console.log(JSON.stringify(res, null, 2));
  else {
    for (const c of res.checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? "  [" + c.detail + "]" : ""}`);
    console.log(res.ok ? "RESULT: VALID" : "RESULT: INVALID");
  }
  process.exit(res.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
