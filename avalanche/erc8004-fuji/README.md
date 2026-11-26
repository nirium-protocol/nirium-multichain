# ERC-8004 on Fuji: reference scripts

Four scripts that point an ERC-8004 validation request at a Nirium receipt on Avalanche Fuji
(43113). Fuji only: this directory does not know about C-Chain mainnet, on purpose.

| Contract (proxy) | Fuji address | Verified implementation |
| --- | --- | --- |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99` (getVersion = 2.0.0) |

The C-Chain addresses (`0x8004A169...`, `0x8004Cc84...`) have no code on Fuji. Do not mix them.

`abi.mjs` was generated on 26-nov-2026 from Routescan's `getabi` API for those two verified
implementations. It was not written by hand and should not be edited by hand.

## Install

```
npm install        # viem 2.58.7, pinned
```

Node 20 or newer.

## Environment

| Variable | Used by | What it is |
| --- | --- | --- |
| `NIRIUM_EVM_AGENT_KEY` | register, validation-request | Key of the agent owner. Needs a little Fuji AVAX |
| `NIRIUM_EVM_VALIDATOR_KEY` | validation-response | Key of the validator named in the request. Needs a little Fuji AVAX |
| `FUJI_RPC_URL` | all | Optional. Defaults to `https://api.avax-test.network/ext/bc/C/rpc` |
| `RPC_LOG_WINDOW` | read-validation | Optional. Blocks per `eth_getLogs`; defaults to 100 (public RPC limit) |

The scripts never print a key, only the address it derives. Use fresh keys made for this project,
and use different keys for the agent owner and the validator.

## Order

```
# 0. Dry run without a key: any address as the account, simulates and estimates gas only
node register.mjs --uri ipfs://<agent card CID> --dry-run --from 0x<address>

# 1. Register the agent (prints agentId from topics[1] of the Registered event)
node register.mjs --uri ipfs://<agent card CID>

# 2. Upload the receipt to IPFS AS IS (the same bytes that get hashed)
#    requestHash = keccak256 of those exact bytes

# 3. Validation request (sent by the owner or operator of agentId)
node validation-request.mjs --validator 0x<validator> --agent-id <n> \
     --cid <receipt CID> --receipt ./receipt.json [--dry-run]

# 4. Validator response (only the address named in step 3)
node validation-response.mjs --request-hash 0x<requestHash> --response <0-100> \
     --response-uri ipfs://<review CID> --response-file ./review.json \
     --tag <text> [--dry-run]

# 5. Read everything (read only)
node read-validation.mjs --request-hash 0x<requestHash>
node read-validation.mjs --request-hash 0x<requestHash> --from-block <n> --to-block <m>   # via RPC, no indexer
node read-validation.mjs --agent-id <n>
```

`--from` only works together with `--dry-run`. In a live run the account always comes from the
key in the environment.

## What the contract enforces (read in the verified source)

- `register(string)`: agentId is `_lastId++`, so the first one was 0. It uses `_safeMint`: if the
  owner is a contract, it must implement `onERC721Received`.
- `validationRequest`: rejects a zero validator and a repeated requestHash (unique across the
  whole registry, not per agent), and requires the caller to be the owner, an operator or approved
  for agentId. It does **not** stop the validator from being the owner. The script warns when that
  happens but does not block it.
- `requestURI` is **not stored**: it only lives in the `ValidationRequest` event. To recover the CID,
  read the log, not storage.
- `validationResponse`: requires the request to exist ("unknown"), the caller to be the named
  validator ("not validator") and response <= 100. **A second response is not blocked**: the
  validator can overwrite its answer later. When verifying, read the last `ValidationResponse`
  event and `lastUpdate`, not only the first.
- `getValidationStatus` reverts with "unknown" when the request does not exist, and does not expose
  `hasResponse`.

## Tested on 26-nov-2026 against Fuji (no keys, nothing sent)

- read-validation on a real third-party request (agentId 301): status, request event and response
  event read through Routescan and through RPC, with the same results.
- read-validation on a hash that does not exist: "does not exist (unknown)" and 0 events.
- register --dry-run: OK, about 135k gas.
- validation-request --dry-run from the real owner of 301: OK, about 195k gas. From another address
  it reverts with "Not authorized".
- validation-response --dry-run from the real validator: OK, about 61k gas. From another address it
  reverts with "not validator"; with a hash that does not exist, "unknown".
- Without a key in a live run, or with `--from` without `--dry-run`: the script refuses to run.

## Gotchas

- Fuji's public RPC rejects `eth_getLogs` over more than 100 blocks.
- Routescan returns `logIndex` as `"0x"` when it is 0. Already handled.
- `samples/sample-receipt.json` is a synthetic receipt for dry runs. It is not real.
