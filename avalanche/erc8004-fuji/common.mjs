// Piezas compartidas. Solo Fuji (43113): este directorio no conoce mainnet a proposito.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, isAddress, getAddress, keccak256, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

// Proxies ERC-8004 en Fuji, verificados el 26-nov-2026 (codigo en Fuji, slot EIP-1967
// apuntando a implementaciones verificadas en Routescan). NO son las de C-Chain.
export const IDENTITY_REGISTRY = getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e");
export const VALIDATION_REGISTRY = getAddress("0x8004Cb1BF31DAf7788923b405b754f57acEB4272");

export const RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
export const ROUTESCAN = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api";
export const EXPLORER_TX = "https://testnet.snowtrace.io/tx/";

export const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(RPC_URL) });

// --flag valor | --flag (booleano)
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Argumento suelto: ${a}`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export function need(args, key, hint) {
  const v = args[key];
  if (v === undefined || v === true) throw new Error(`Falta --${key}${hint ? ` (${hint})` : ""}`);
  return v;
}

export function asAddress(v, name) {
  if (!isAddress(v)) throw new Error(`${name} no es una direccion valida: ${v}`);
  return getAddress(v);
}

export function asBytes32(v, name) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} debe ser bytes32 (0x + 64 hex): ${v}`);
  return v.toLowerCase();
}

// keccak256 de los bytes EXACTOS del archivo (sin re-serializar el JSON, sin tocar fin de linea).
export function hashFile(path) {
  const bytes = readFileSync(path);
  return { hash: keccak256(bytes), size: bytes.length };
}

// Cuenta que firma o simula.
// - En vivo: siempre la llave del env; nunca se imprime, solo su direccion.
// - --dry-run con --from: solo una direccion (simulacion pura, sin llave).
// - --dry-run sin --from: usa la direccion de la llave del env si existe.
export function resolveAccount(args, envName) {
  if (args["dry-run"] && typeof args.from === "string") {
    return { account: asAddress(args.from, "--from"), signer: null };
  }
  if (args.from && !args["dry-run"]) throw new Error("--from solo vale con --dry-run; en vivo la cuenta sale de la llave del env");
  const pk = process.env[envName];
  if (!pk) throw new Error(`Falta la variable ${envName} (o usa --dry-run --from <direccion>)`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error(`${envName} no tiene formato de llave privada (0x + 64 hex). No se imprime su valor.`);
  const signer = privateKeyToAccount(pk);
  return { account: signer.address, signer };
}

export function walletFor(signer) {
  return createWalletClient({ account: signer, chain: avalancheFuji, transport: http(RPC_URL) });
}

// Simula y estima gas. Devuelve { request, result, gas } o lanza con el motivo del revert.
export async function simulateAndEstimate({ address, abi, functionName, args, account }) {
  try {
    const { request, result } = await publicClient.simulateContract({ address, abi, functionName, args, account });
    const gas = await publicClient.estimateContractGas({ address, abi, functionName, args, account });
    return { request, result, gas };
  } catch (err) {
    throw new Error(`La simulacion revirtio: ${revertReason(err)}`);
  }
}

export function revertReason(err) {
  if (err instanceof BaseError) {
    const rev = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (rev) return rev.reason ?? rev.shortMessage;
    return err.details ? `${err.shortMessage} (${err.details})` : err.shortMessage;
  }
  return String(err?.message ?? err);
}

export async function gasReport(gas) {
  const gasPrice = await publicClient.getGasPrice();
  const costWei = gas * gasPrice;
  return `gas estimado ${gas} | gasPrice ${gasPrice} wei | costo aprox ${Number(costWei) / 1e18} AVAX (Fuji)`;
}

export function bigintJson(obj) {
  return JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

export async function run(main) {
  try {
    await main();
  } catch (err) {
    console.error(`ERROR: ${err instanceof BaseError ? revertReason(err) : err.message}`);
    process.exit(1);
  }
}
