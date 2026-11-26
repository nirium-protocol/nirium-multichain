// Builds test fixtures from the real June PayAI settlement on C-Chain.
// The signature cases use a throwaway key generated in memory, never saved.
import { mkdirSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { contentSha256, STATEMENT_PREFIX, VERSION } from "./verify-evm-receipt.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
const record = {
  labels: ["selftest"],
  payment: {
    amount: "1000",
    asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    decimals: 6,
    from: "0xc5fd0c1179562ab10800744655427bba5a9dcf38",
    locator: { index: 17, kind: "evm-log" },
    network: "eip155:43114",
    to: "0x28dc25bf88bf06fc0a3af1747d1aa4a21f313ed0",
    tx: "0x6a1307bc48a157de236ea03440ea2cb6ad4f27e22dd9c89a4345b4c3edb270c7",
    x402: {
      nonce: "0x4460df3e9f8bb1759f877e0171d10b9c13bb939a0659786527ce726dcc5e93f5",
      resource: "unknown (third-party tx, test fixture only)",
      scheme: "exact",
    },
  },
  purpose: { note: "verifier test against a third-party PayAI settlement, not ours", ref: "fixture-june-2026" },
};
const doc = (rec) => ({ version: VERSION, content_sha256: contentSha256(rec), record: rec, network: rec.payment.network });
const withPayment = (patch) => { const r = clone(record); Object.assign(r.payment, patch); return doc(r); };

mkdirSync("fixtures", { recursive: true });
const w = (name, d) => writeFileSync(`fixtures/${name}.json`, JSON.stringify(d, null, 2));

w("june-ok", doc(clone(record)));
w("june-bad-index", withPayment({ locator: { index: 16, kind: "evm-log" } }));
w("june-bad-amount", withPayment({ amount: "1001" }));
w("june-bad-to", withPayment({ to: "0xc6699d2aada6c36dfea5c248dd70f9cb0235cb63" }));
w("june-bad-nonce", withPayment({ x402: { ...record.payment.x402, nonce: "0x" + "00".repeat(32) } }));
w("june-bad-content-sha256", { ...doc(clone(record)), content_sha256: "00" + contentSha256(record).slice(2) });

const acct = privateKeyToAccount(generatePrivateKey());
const signed = doc(clone(record));
signed.agent = { alg: "eip191-secp256k1", key: acct.address, statement: STATEMENT_PREFIX + signed.content_sha256 };
signed.agent.signature = await acct.signMessage({ message: signed.agent.statement });
w("june-sig-ephemeral", signed);
const tampered = clone(signed);
tampered.record.payment.amount = "1001"; // altered after signing, hash not recomputed
w("june-sig-tampered", tampered);
const forged = clone(signed);
forged.agent.key = record.payment.from; // claims to be the payer, signed by someone else
w("june-sig-forged-payer", forged);
console.log(`fixtures written; ephemeral signer ${acct.address}`);
