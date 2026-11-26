// validationRequest(validator, agentId, requestURI, requestHash) on the Fuji ValidationRegistry.
// requestHash = keccak256 of the receipt file's EXACT bytes.
// Usage:
//   node validation-request.mjs --validator <address> --agent-id <n> --cid <CID> --receipt <file.json>
//                               [--dry-run [--from <address>]]
// Key (live runs only): env NIRIUM_EVM_AGENT_KEY (owner or operator of agentId). Never printed.
import { parseEventLogs, zeroAddress } from "viem";
import { identityAbi, validationAbi } from "./abi.mjs";
import {
  IDENTITY_REGISTRY, VALIDATION_REGISTRY, EXPLORER_TX, publicClient, parseArgs, need, asAddress,
  hashFile, resolveAccount, walletFor, simulateAndEstimate, gasReport, run,
} from "./common.mjs";

run(async () => {
  const args = parseArgs();
  const validator = asAddress(need(args, "validator"), "--validator");
  const agentId = BigInt(need(args, "agent-id"));
  const cid = need(args, "cid").replace(/^ipfs:\/\//, "");
  const receiptPath = need(args, "receipt", "receipt JSON file, exactly as uploaded to IPFS");
  const requestURI = `ipfs://${cid}`;
  const { hash: requestHash, size } = hashFile(receiptPath);
  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_AGENT_KEY");

  if (validator === zeroAddress) throw new Error("validator cannot be 0x0 (the contract rejects it)");

  const owner = await publicClient.readContract({
    address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "ownerOf", args: [agentId],
  }).catch(() => null);
  if (!owner) throw new Error(`agentId ${agentId} does not exist in the Fuji IdentityRegistry`);

  console.log(`network     Fuji 43113`);
  console.log(`contract    ValidationRegistry ${VALIDATION_REGISTRY}`);
  console.log(`account     ${account}`);
  console.log(`agentId     ${agentId} (owner ${owner})`);
  console.log(`validator   ${validator}`);
  console.log(`requestURI  ${requestURI}`);
  console.log(`receipt     ${receiptPath} (${size} bytes)`);
  console.log(`requestHash ${requestHash}   <- keccak256 of the file's exact bytes`);
  if (validator.toLowerCase() === owner.toLowerCase()) {
    console.log("WARNING: validator == agent owner. The contract allows it, but it is not a third-party validation.");
  }

  const sim = await simulateAndEstimate({
    address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationRequest",
    args: [validator, agentId, requestURI, requestHash], account,
  });
  console.log("simulation OK");
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: nothing sent."); return; }

  const hash = await walletFor(signer).writeContract(sim.request);
  console.log(`tx sent ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted in block ${receipt.blockNumber}`);

  const logs = parseEventLogs({ abi: validationAbi, eventName: "ValidationRequest", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === VALIDATION_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`expected 1 ValidationRequest event, found ${logs.length}`);
  const log = logs[0];
  if (log.args.requestHash.toLowerCase() !== requestHash.toLowerCase()) throw new Error("event requestHash does not match");

  console.log(`block    ${receipt.blockNumber}`);
  console.log(`logIndex ${log.logIndex}`);
  console.log(`event    ValidationRequest(validator ${log.args.validatorAddress}, agentId ${log.args.agentId}, uri ${log.args.requestURI})`);
  console.log(`${EXPLORER_TX}${hash}`);
});
