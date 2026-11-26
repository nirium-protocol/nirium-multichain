// Shared pieces. Fuji only (43113): this directory does not know about mainnet, on purpose.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, isAddress, getAddress, keccak256, BaseError, ContractFunctionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

// ERC-8004 proxies on Fuji, checked on 26-nov-2026 (code on Fuji, EIP-1967 slot pointing
// to implementations verified on Routescan). These are NOT the C-Chain addresses.
export const IDENTITY_REGISTRY = getAddress("0x8004A818BFB912233c491871b3d84c89A494BD9e");
export const VALIDATION_REGISTRY = getAddress("0x8004Cb1BF31DAf7788923b405b754f57acEB4272");

export const RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
export const ROUTESCAN = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api";
export const EXPLORER_TX = "https://testnet.snowtrace.io/tx/";

export const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(RPC_URL) });

// --flag value | --flag (boolean)
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export function need(args, key, hint) {
  const v = args[key];
  if (v === undefined || v === true) throw new Error(`Missing --${key}${hint ? ` (${hint})` : ""}`);
  return v;
}

export function asAddress(v, name) {
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`);
  return getAddress(v);
}

export function asBytes32(v, name) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} must be bytes32 (0x + 64 hex): ${v}`);
  return v.toLowerCase();
}

// keccak256 of the file's EXACT bytes (no JSON re-serialization, line endings untouched).
export function hashFile(path) {
  const bytes = readFileSync(path);
  return { hash: keccak256(bytes), size: bytes.length };
}

// Account that signs or simulates.
// - Live: always the key from the environment; never printed, only its address.
// - --dry-run with --from: an address only (pure simulation, no key).
// - --dry-run without --from: uses the address of the environment key if there is one.
export function resolveAccount(args, envName) {
  if (args["dry-run"] && typeof args.from === "string") {
    return { account: asAddress(args.from, "--from"), signer: null };
  }
  if (args.from && !args["dry-run"]) throw new Error("--from only works with --dry-run; in a live run the account comes from the environment key");
  const pk = process.env[envName];
  if (!pk) throw new Error(`Missing ${envName} (or use --dry-run --from <address>)`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error(`${envName} is not a private key (0x + 64 hex). Its value is not printed.`);
  const signer = privateKeyToAccount(pk);
  return { account: signer.address, signer };
}

export function walletFor(signer) {
  return createWalletClient({ account: signer, chain: avalancheFuji, transport: http(RPC_URL) });
}

// Simulates and estimates gas. Returns { request, result, gas } or throws with the revert reason.
export async function simulateAndEstimate({ address, abi, functionName, args, account }) {
  try {
    const { request, result } = await publicClient.simulateContract({ address, abi, functionName, args, account });
    const gas = await publicClient.estimateContractGas({ address, abi, functionName, args, account });
    return { request, result, gas };
  } catch (err) {
    throw new Error(`Simulation reverted: ${revertReason(err)}`);
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
  return `estimated gas ${gas} | gasPrice ${gasPrice} wei | approx cost ${Number(costWei) / 1e18} AVAX (Fuji)`;
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
