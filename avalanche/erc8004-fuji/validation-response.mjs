// validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)
// Firma confirmada en la fuente verificada de la impl 0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99 (26-nov-2026):
//   require(s.validatorAddress != address(0), "unknown");
//   require(msg.sender == s.validatorAddress, "not validator");
//   require(response <= 100, "resp>100");
// Uso:
//   node validation-response.mjs --request-hash <0x..> --response <0-100> --response-uri <uri>
//                                (--response-file <archivo> | --response-hash <0x..>) [--tag <texto>]
//                                [--dry-run [--from <direccion>]]
// Llave (solo en vivo): env NIRIUM_EVM_VALIDATOR_KEY (debe ser el validator nombrado en la solicitud).
import { parseEventLogs, zeroHash } from "viem";
import { validationAbi } from "./abi.mjs";
import {
  VALIDATION_REGISTRY, EXPLORER_TX, publicClient, parseArgs, need, asBytes32, hashFile,
  resolveAccount, walletFor, simulateAndEstimate, gasReport, run,
} from "./common.mjs";

run(async () => {
  const args = parseArgs();
  const requestHash = asBytes32(need(args, "request-hash"), "--request-hash");
  const response = Number(need(args, "response", "0-100"));
  if (!Number.isInteger(response) || response < 0 || response > 100) throw new Error("--response debe ser entero 0-100");
  const responseURI = need(args, "response-uri");
  const tag = typeof args.tag === "string" ? args.tag : "";

  let responseHash;
  if (typeof args["response-file"] === "string") responseHash = hashFile(args["response-file"]).hash;
  else if (typeof args["response-hash"] === "string") responseHash = asBytes32(args["response-hash"], "--response-hash");
  else { responseHash = zeroHash; console.log("AVISO: sin --response-file ni --response-hash, se usa 0x0 como responseHash."); }

  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_VALIDATOR_KEY");

  console.log(`red          Fuji 43113`);
  console.log(`contrato     ValidationRegistry ${VALIDATION_REGISTRY}`);
  console.log(`cuenta       ${account}`);
  console.log(`requestHash  ${requestHash}`);
  console.log(`response     ${response}`);
  console.log(`responseURI  ${responseURI}`);
  console.log(`responseHash ${responseHash}`);
  console.log(`tag          "${tag}"`);

  const sim = await simulateAndEstimate({
    address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationResponse",
    args: [requestHash, response, responseURI, responseHash, tag], account,
  });
  console.log("simulacion OK");
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: no se envio nada."); return; }

  const hash = await walletFor(signer).writeContract(sim.request);
  console.log(`tx enviada ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx revertida en bloque ${receipt.blockNumber}`);

  const logs = parseEventLogs({ abi: validationAbi, eventName: "ValidationResponse", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === VALIDATION_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`se esperaba 1 evento ValidationResponse, hay ${logs.length}`);
  console.log(`bloque   ${receipt.blockNumber}`);
  console.log(`logIndex ${logs[0].logIndex}`);
  console.log(`${EXPLORER_TX}${hash}`);
});
