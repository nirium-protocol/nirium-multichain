// validationRequest(validator, agentId, requestURI, requestHash) en el ValidationRegistry de Fuji.
// requestHash = keccak256 de los bytes EXACTOS del archivo del recibo.
// Uso:
//   node validation-request.mjs --validator <direccion> --agent-id <n> --cid <CID> --receipt <archivo.json>
//                               [--dry-run [--from <direccion>]]
// Llave (solo en vivo): env NIRIUM_EVM_AGENT_KEY (dueno u operador del agentId). Nunca se imprime.
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
  const receiptPath = need(args, "receipt", "archivo JSON del recibo, tal cual se subio a IPFS");
  const requestURI = `ipfs://${cid}`;
  const { hash: requestHash, size } = hashFile(receiptPath);
  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_AGENT_KEY");

  if (validator === zeroAddress) throw new Error("validator no puede ser 0x0 (el contrato lo rechaza)");

  const owner = await publicClient.readContract({
    address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "ownerOf", args: [agentId],
  }).catch(() => null);
  if (!owner) throw new Error(`agentId ${agentId} no existe en el IdentityRegistry de Fuji`);

  console.log(`red         Fuji 43113`);
  console.log(`contrato    ValidationRegistry ${VALIDATION_REGISTRY}`);
  console.log(`cuenta      ${account}`);
  console.log(`agentId     ${agentId} (owner ${owner})`);
  console.log(`validator   ${validator}`);
  console.log(`requestURI  ${requestURI}`);
  console.log(`recibo      ${receiptPath} (${size} bytes)`);
  console.log(`requestHash ${requestHash}   <- keccak256 de los bytes exactos del archivo`);
  if (validator.toLowerCase() === owner.toLowerCase()) {
    console.log("AVISO: validator == owner del agente. El contrato lo permite, pero no vale como validacion de un tercero.");
  }

  const sim = await simulateAndEstimate({
    address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationRequest",
    args: [validator, agentId, requestURI, requestHash], account,
  });
  console.log("simulacion OK");
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: no se envio nada."); return; }

  const hash = await walletFor(signer).writeContract(sim.request);
  console.log(`tx enviada ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx revertida en bloque ${receipt.blockNumber}`);

  const logs = parseEventLogs({ abi: validationAbi, eventName: "ValidationRequest", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === VALIDATION_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`se esperaba 1 evento ValidationRequest, hay ${logs.length}`);
  const log = logs[0];
  if (log.args.requestHash.toLowerCase() !== requestHash.toLowerCase()) throw new Error("requestHash del evento no coincide");

  console.log(`bloque   ${receipt.blockNumber}`);
  console.log(`logIndex ${log.logIndex}`);
  console.log(`evento   ValidationRequest(validator ${log.args.validatorAddress}, agentId ${log.args.agentId}, uri ${log.args.requestURI})`);
  console.log(`${EXPLORER_TX}${hash}`);
});
