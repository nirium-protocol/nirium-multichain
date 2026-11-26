// register(string agentURI) on the Fuji IdentityRegistry. Returns the agentId.
// Usage:
//   node register.mjs --uri <agentURI> [--dry-run [--from <address>]]
// Key (live runs only): env NIRIUM_EVM_AGENT_KEY. Never printed.
import { parseEventLogs } from "viem";
import { identityAbi } from "./abi.mjs";
import {
  IDENTITY_REGISTRY, EXPLORER_TX, publicClient, parseArgs, need, resolveAccount, sendSimulated,
  simulateAndEstimate, gasReport, run,
} from "./common.mjs";

run(async () => {
  const args = parseArgs();
  const agentURI = need(args, "uri", "e.g. ipfs://<agent card CID> or https://...");
  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_AGENT_KEY");

  console.log(`network  Fuji 43113`);
  console.log(`contract IdentityRegistry ${IDENTITY_REGISTRY}`);
  console.log(`account  ${account}`);
  console.log(`agentURI ${agentURI}`);

  const sim = await simulateAndEstimate({
    address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [agentURI], account,
  });
  console.log(`simulation OK, agentId it would get now: ${sim.result} (may change if someone registers first)`);
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: nothing sent."); return; }

  const hash = await sendSimulated(signer, sim.request);
  console.log(`tx sent ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted in block ${receipt.blockNumber}`);

  // Only logs emitted by the registry proxy, not by another contract in the same tx.
  const logs = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`expected 1 Registered event, found ${logs.length}`);
  const log = logs[0];
  const agentIdFromTopic = BigInt(log.topics[1]);
  if (agentIdFromTopic !== log.args.agentId) throw new Error("topics[1] does not match the decoded agentId");

  console.log(`block    ${receipt.blockNumber}`);
  console.log(`logIndex ${log.logIndex}`);
  console.log(`agentId  ${agentIdFromTopic}   <- from topics[1] of Registered`);
  console.log(`owner    ${log.args.owner}`);
  console.log(`${EXPLORER_TX}${hash}`);
});
