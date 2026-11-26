// validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)
// Signature confirmed in the verified source of impl 0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99 (26-nov-2026):
//   require(s.validatorAddress != address(0), "unknown");
//   require(msg.sender == s.validatorAddress, "not validator");
//   require(response <= 100, "resp>100");
// Usage:
//   node validation-response.mjs --request-hash <0x..> --response <0-100> --response-uri <uri>
//                                (--response-file <file> | --response-hash <0x..>) [--tag <text>]
//                                [--dry-run [--from <address>]]
// Key (live runs only): env NIRIUM_EVM_VALIDATOR_KEY (must be the validator named in the request).
import { parseEventLogs, zeroHash } from "viem";
import { validationAbi } from "./abi.mjs";
import {
  VALIDATION_REGISTRY, EXPLORER_TX, publicClient, parseArgs, need, asBytes32, hashFile,
  resolveAccount, sendSimulated, simulateAndEstimate, gasReport, run,
} from "./common.mjs";

run(async () => {
  const args = parseArgs();
  const requestHash = asBytes32(need(args, "request-hash"), "--request-hash");
  const response = Number(need(args, "response", "0-100"));
  if (!Number.isInteger(response) || response < 0 || response > 100) throw new Error("--response must be an integer 0-100");
  const responseURI = need(args, "response-uri");
  const tag = typeof args.tag === "string" ? args.tag : "";

  let responseHash;
  if (typeof args["response-file"] === "string") responseHash = hashFile(args["response-file"]).hash;
  else if (typeof args["response-hash"] === "string") responseHash = asBytes32(args["response-hash"], "--response-hash");
  else { responseHash = zeroHash; console.log("WARNING: no --response-file or --response-hash, using 0x0 as responseHash."); }

  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_VALIDATOR_KEY");

  console.log(`network      Fuji 43113`);
  console.log(`contract     ValidationRegistry ${VALIDATION_REGISTRY}`);
  console.log(`account      ${account}`);
  console.log(`requestHash  ${requestHash}`);
  console.log(`response     ${response}`);
  console.log(`responseURI  ${responseURI}`);
  console.log(`responseHash ${responseHash}`);
  console.log(`tag          "${tag}"`);

  const sim = await simulateAndEstimate({
    address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationResponse",
    args: [requestHash, response, responseURI, responseHash, tag], account,
  });
  console.log("simulation OK");
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: nothing sent."); return; }

  const hash = await sendSimulated(signer, sim.request);
  console.log(`tx sent ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx reverted in block ${receipt.blockNumber}`);

  const logs = parseEventLogs({ abi: validationAbi, eventName: "ValidationResponse", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === VALIDATION_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`expected 1 ValidationResponse event, found ${logs.length}`);
  console.log(`block    ${receipt.blockNumber}`);
  console.log(`logIndex ${logs[0].logIndex}`);
  console.log(`${EXPLORER_TX}${hash}`);
});
