// register(string agentURI) en el IdentityRegistry de Fuji. Devuelve el agentId.
// Uso:
//   node register.mjs --uri <agentURI> [--dry-run [--from <direccion>]]
// Llave (solo en vivo): env NIRIUM_EVM_AGENT_KEY. Nunca se imprime.
import { parseEventLogs } from "viem";
import { identityAbi } from "./abi.mjs";
import {
  IDENTITY_REGISTRY, EXPLORER_TX, publicClient, parseArgs, need, resolveAccount, walletFor,
  simulateAndEstimate, gasReport, run,
} from "./common.mjs";

run(async () => {
  const args = parseArgs();
  const agentURI = need(args, "uri", "ej. ipfs://<CID del agent card> o https://...");
  const { account, signer } = resolveAccount(args, "NIRIUM_EVM_AGENT_KEY");

  console.log(`red      Fuji 43113`);
  console.log(`contrato IdentityRegistry ${IDENTITY_REGISTRY}`);
  console.log(`cuenta   ${account}`);
  console.log(`agentURI ${agentURI}`);

  const sim = await simulateAndEstimate({
    address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [agentURI], account,
  });
  console.log(`simulacion OK, agentId que tocaria ahora: ${sim.result} (puede cambiar si alguien registra antes)`);
  console.log(await gasReport(sim.gas));

  if (args["dry-run"]) { console.log("--dry-run: no se envio nada."); return; }

  const hash = await walletFor(signer).writeContract(sim.request);
  console.log(`tx enviada ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx revertida en bloque ${receipt.blockNumber}`);

  // Solo logs emitidos por el proxy del registro, no por otro contrato de la misma tx.
  const logs = parseEventLogs({ abi: identityAbi, eventName: "Registered", logs: receipt.logs })
    .filter((l) => l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase());
  if (logs.length !== 1) throw new Error(`se esperaba 1 evento Registered, hay ${logs.length}`);
  const log = logs[0];
  const agentIdFromTopic = BigInt(log.topics[1]);
  if (agentIdFromTopic !== log.args.agentId) throw new Error("topics[1] no coincide con el agentId decodificado");

  console.log(`bloque   ${receipt.blockNumber}`);
  console.log(`logIndex ${log.logIndex}`);
  console.log(`agentId  ${agentIdFromTopic}   <- de topics[1] del Registered`);
  console.log(`owner    ${log.args.owner}`);
  console.log(`${EXPLORER_TX}${hash}`);
});
