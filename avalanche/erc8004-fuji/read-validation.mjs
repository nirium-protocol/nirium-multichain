// Solo lectura. Dado un requestHash: estado guardado + eventos ValidationRequest/ValidationResponse.
// El requestURI NO se guarda en el contrato, solo vive en el evento ValidationRequest.
// Uso:
//   node read-validation.mjs --request-hash <0x..> [--from-block <n> [--to-block <n>]]
//   node read-validation.mjs --agent-id <n>        (lista los requestHash del agente)
// Logs: por defecto se piden al indexador de Routescan (todo el rango, sin llave).
// Con --from-block se piden por RPC en ventanas de 100 bloques (limite del RPC publico),
// hasta --to-block o latest; tope de 500 llamadas. Sirve para confirmar sin depender del indexador.
import { decodeEventLog, encodeEventTopics } from "viem";
import { validationAbi } from "./abi.mjs";
import {
  VALIDATION_REGISTRY, ROUTESCAN, publicClient, parseArgs, asBytes32, revertReason, bigintJson, run,
} from "./common.mjs";

// El RPC publico de Fuji rechaza eth_getLogs de mas de 100 bloques (probado 26-nov-2026:
// "exceeds the maximum of 100 blocks"). Con un RPC propio se puede subir via env.
const RPC_WINDOW = BigInt(process.env.RPC_LOG_WINDOW || 100);

// Routescan devuelve "0x" (vacio) para el valor 0 en logIndex/transactionIndex.
const hexBig = (v) => (v === "0x" || v === "" || v == null ? 0n : BigInt(v));

async function logsRoutescan(topic0, topic3) {
  const url = `${ROUTESCAN}?module=logs&action=getLogs&address=${VALIDATION_REGISTRY}`
    + `&topic0=${topic0}&topic3=${topic3}&topic0_3_opr=and&fromBlock=0&toBlock=latest`;
  const res = await fetch(url);
  const body = await res.json();
  if (body.status === "0" && /no records/i.test(body.message ?? "")) return [];
  if (!Array.isArray(body.result)) throw new Error(`Routescan respondio: ${JSON.stringify(body).slice(0, 200)}`);
  return body.result.map((l) => ({
    address: l.address, topics: l.topics, data: l.data,
    blockNumber: hexBig(l.blockNumber), transactionHash: l.transactionHash, logIndex: Number(hexBig(l.logIndex)),
  }));
}

async function logsRpc(topic0, topic3, fromBlock, toBlock) {
  const latest = toBlock ?? await publicClient.getBlockNumber();
  const calls = (latest - fromBlock) / RPC_WINDOW + 1n;
  if (calls > 500n) throw new Error(`rango de ${latest - fromBlock} bloques = ${calls} llamadas de ${RPC_WINDOW}; acota con --to-block o usa Routescan`);
  const out = [];
  for (let start = fromBlock; start <= latest; start += RPC_WINDOW) {
    const end = start + RPC_WINDOW - 1n > latest ? latest : start + RPC_WINDOW - 1n;
    const logs = await publicClient.request({
      method: "eth_getLogs",
      params: [{ address: VALIDATION_REGISTRY, topics: [topic0, null, null, topic3],
        fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` }],
    });
    for (const l of logs) out.push({ ...l, blockNumber: hexBig(l.blockNumber), logIndex: Number(hexBig(l.logIndex)) });
  }
  return out;
}

function decode(eventName, l) {
  const { args } = decodeEventLog({ abi: validationAbi, eventName, topics: l.topics, data: l.data });
  return { block: l.blockNumber, txHash: l.transactionHash, logIndex: l.logIndex, ...args };
}

run(async () => {
  const args = parseArgs();
  console.log(`red      Fuji 43113`);
  console.log(`contrato ValidationRegistry ${VALIDATION_REGISTRY}`);
  const version = await publicClient.readContract({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "getVersion" });
  const identity = await publicClient.readContract({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "getIdentityRegistry" });
  console.log(`version  ${version} | identityRegistry ${identity}`);

  if (typeof args["agent-id"] === "string") {
    const hashes = await publicClient.readContract({
      address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "getAgentValidations", args: [BigInt(args["agent-id"])],
    });
    console.log(`agentId ${args["agent-id"]}: ${hashes.length} solicitudes`);
    for (const h of hashes) console.log(`  ${h}`);
    return;
  }

  const requestHash = asBytes32(args["request-hash"] ?? "", "--request-hash");
  console.log(`requestHash ${requestHash}`);

  // 1. Estado guardado. getValidationStatus revierte "unknown" si no existe.
  try {
    const [validatorAddress, agentId, response, responseHash, tag, lastUpdate] = await publicClient.readContract({
      address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "getValidationStatus", args: [requestHash],
    });
    console.log("estado guardado:");
    console.log(bigintJson({ validatorAddress, agentId, response, responseHash, tag, lastUpdate,
      lastUpdateIso: new Date(Number(lastUpdate) * 1000).toISOString() }));
    console.log("nota: el struct no expone hasResponse; response 0 puede ser 'sin respuesta' o 'respuesta 0'. Ver eventos.");
  } catch (err) {
    console.log(`estado guardado: no existe (${revertReason(err)})`);
  }

  // 2. Eventos. requestHash es el tercer indexado (topics[3]) en los dos eventos.
  const [reqTopic] = encodeEventTopics({ abi: validationAbi, eventName: "ValidationRequest" });
  const [resTopic] = encodeEventTopics({ abi: validationAbi, eventName: "ValidationResponse" });
  const source = typeof args["from-block"] === "string" ? `RPC desde bloque ${args["from-block"]}` : "Routescan (indexador)";
  const fetchLogs = typeof args["from-block"] === "string"
    ? (t0) => logsRpc(t0, requestHash, BigInt(args["from-block"]),
        typeof args["to-block"] === "string" ? BigInt(args["to-block"]) : undefined)
    : (t0) => logsRoutescan(t0, requestHash);

  const reqs = (await fetchLogs(reqTopic)).map((l) => decode("ValidationRequest", l));
  const resps = (await fetchLogs(resTopic)).map((l) => decode("ValidationResponse", l));
  console.log(`eventos (${source}): ${reqs.length} ValidationRequest, ${resps.length} ValidationResponse`);
  for (const r of reqs) console.log("ValidationRequest " + bigintJson(r));
  for (const r of resps) console.log("ValidationResponse " + bigintJson(r));
});
