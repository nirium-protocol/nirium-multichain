// make-binding.mjs - builds a "nirium-payment-binding-v1" JSON from a settled x402 tx.
//
// Usage:
//   node make-binding.mjs --ref <purpose.ref> [--settle settle.json | --tx 0x.. --network eip155:43113]
//                         [--resource <url>] [--note <text>] [--payer 0x..] [--payto 0x..]
//                         [--no-sign] [--out binding.json]
//
// Env (only when signing):
//   NIRIUM_EVM_PAYER_KEY  payer private key. Never printed or written. Its address must equal
//                         the Transfer.from found on chain, or nothing is written.
//
// Reads the receipt over public RPC, finds the USDC Transfer from the payer (block-level logIndex)
// and the matching AuthorizationUsed nonce, builds `record` with keys already sorted, and signs
// "nirium-audit-v1:<content_sha256>" with EIP-191. Output matches section 5.1 and is accepted by
// ../verify-evm-receipt.mjs (use --no-sig there for unsigned output).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createPublicClient, http, decodeEventLog, parseAbi, isAddressEqual, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "./networks.mjs";
import { contentSha256, canonicalize, VERSION, STATEMENT_PREFIX } from "../verify-evm-receipt.mjs";

const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes(`--${name}`);
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };

function sortKeys(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}

const settle = arg("settle") ? JSON.parse(readFileSync(arg("settle"), "utf8")) : {};
const tx = arg("tx", settle.tx);
const network = arg("network", settle.network || "eip155:43113");
const ref = arg("ref");
const resource = arg("resource", settle.resource || "unknown");
const note = arg("note", "Nirium selftest payment, our own keys");
const sign = !flag("no-sign");
const out = arg("out", "binding.json");
if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) die("need --tx 0x<64 hex> or --settle settle.json");
if (!ref) die("need --ref <purpose.ref>, e.g. selftest-2026-11-26-fuji-01");
const net = getNetwork(network);

let account = null;
if (sign) {
  const key = process.env.NIRIUM_EVM_PAYER_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) die("NIRIUM_EVM_PAYER_KEY required to sign (or pass --no-sign)");
  account = privateKeyToAccount(key);
}
const payerHint = account?.address || arg("payer", settle.payer);
const payToHint = arg("payto");

const client = createPublicClient({ chain: net.chain, transport: http() });
const chainId = await client.getChainId();
if (`eip155:${chainId}` !== network) die(`RPC chainId ${chainId} does not match ${network}`);
const receipt = await client.getTransactionReceipt({ hash: tx });
if (receipt.status !== "success") die(`tx status ${receipt.status}`, 1);

const decoded = receipt.logs
  .filter((l) => isAddressEqual(l.address, net.usdc))
  .map((l) => { try { return { log: l, ev: decodeEventLog({ abi: ABI, data: l.data, topics: l.topics }) }; } catch { return null; } })
  .filter(Boolean);

let transfers = decoded.filter((d) => d.ev.eventName === "Transfer");
if (payerHint) transfers = transfers.filter((d) => isAddressEqual(d.ev.args.from, payerHint));
if (payToHint) transfers = transfers.filter((d) => isAddressEqual(d.ev.args.to, payToHint));
if (transfers.length !== 1) {
  die(`expected exactly 1 USDC Transfer${payerHint ? " from " + payerHint : ""}${payToHint ? " to " + payToHint : ""}, found ${transfers.length}; narrow with --payer/--payto`, 1);
}
const t = transfers[0];
const payer = getAddress(t.ev.args.from);

const auths = decoded.filter((d) => d.ev.eventName === "AuthorizationUsed" && isAddressEqual(d.ev.args.authorizer, payer));
if (auths.length !== 1) die(`expected exactly 1 AuthorizationUsed by ${payer}, found ${auths.length}`, 1);

const record = sortKeys({
  labels: ["selftest"],
  payment: {
    amount: t.ev.args.value.toString(),
    asset: getAddress(net.usdc),
    decimals: 6,
    from: payer,
    locator: { index: t.log.logIndex, kind: "evm-log" },
    network,
    to: getAddress(t.ev.args.to),
    tx,
    x402: { nonce: auths[0].ev.args.nonce, resource, scheme: "exact" },
  },
  purpose: { note, ref },
});

const hash = contentSha256(record);
// Compatibility with verify-audit-cid: sha256(JSON.stringify(record)) must equal the canonical hash.
const plain = createHash("sha256").update(JSON.stringify(record), "utf8").digest("hex");
if (plain !== hash || JSON.stringify(record) !== canonicalize(record)) die("record is not in canonical order (bug)", 1);

const doc = { version: VERSION, content_sha256: hash, record };
if (account) {
  if (!isAddressEqual(account.address, payer)) die(`signing key ${account.address} is not the payer ${payer}; not writing`, 1);
  const statement = STATEMENT_PREFIX + hash;
  doc.agent = { alg: "eip191-secp256k1", key: account.address, signature: await account.signMessage({ message: statement }), statement };
}
doc.network = network;

writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`wrote ${out}  tx=${tx}  logIndex=${t.log.logIndex}  amount=${record.payment.amount}  from=${payer}  to=${record.payment.to}  nonce=${record.payment.x402.nonce}  content_sha256=${hash}  signed=${!!account}`);
