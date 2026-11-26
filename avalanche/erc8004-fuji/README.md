# ERC-8004 en Fuji: scripts de referencia

Cuatro scripts para ligar un recibo de Nirium a ERC-8004 en Avalanche Fuji (43113).
Solo Fuji: este directorio no conoce C-Chain mainnet a proposito.

| Contrato (proxy) | Direccion en Fuji | Implementacion verificada |
| --- | --- | --- |
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `0x7274e874ca62410a93bd8bf61c69d8045e399c02` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99` (getVersion = 2.0.0) |

Las direcciones de C-Chain (`0x8004A169...`, `0x8004Cc84...`) no tienen codigo en Fuji. No mezclarlas.

`abi.mjs` se genero el 26-nov-2026 desde la API `getabi` de Routescan sobre esas dos
implementaciones verificadas. No se escribio de memoria y no se edita a mano.

## Instalar

```
npm install        # viem 2.58.7, version fija
```

Node 20 o mas nuevo.

## Variables

| Variable | Quien la usa | Que es |
| --- | --- | --- |
| `NIRIUM_EVM_AGENT_KEY` | register, validation-request | Llave del dueno del agente. Necesita un poco de AVAX de Fuji |
| `NIRIUM_EVM_VALIDATOR_KEY` | validation-response | Llave del validador nombrado en la solicitud. Necesita un poco de AVAX de Fuji |
| `FUJI_RPC_URL` | todos | Opcional. Por defecto `https://api.avax-test.network/ext/bc/C/rpc` |
| `RPC_LOG_WINDOW` | read-validation | Opcional. Bloques por `eth_getLogs`; por defecto 100 (limite del RPC publico) |

Los scripts nunca imprimen la llave, solo la direccion que deriva. Usen llaves nuevas
solo para Nirium en Fuji, y que el dueno del agente y el validador sean llaves distintas.

## Orden

```
# 0. Ensayo sin llave: cualquier direccion como cuenta, solo simula y estima gas
node register.mjs --uri ipfs://<CID del agent card> --dry-run --from 0x<direccion>

# 1. Registrar el agente (devuelve agentId desde topics[1] del evento Registered)
node register.mjs --uri ipfs://<CID del agent card>

# 2. Subir el recibo a IPFS TAL CUAL (los mismos bytes que se van a hashear)
#    requestHash = keccak256 de esos bytes exactos

# 3. Solicitud de validacion (la llama el dueno u operador del agentId)
node validation-request.mjs --validator 0x<validador> --agent-id <n> \
     --cid <CID del recibo> --receipt ./recibo.json [--dry-run]

# 4. Respuesta del validador (solo la direccion nombrada en el paso 3)
node validation-response.mjs --request-hash 0x<requestHash> --response <0-100> \
     --response-uri ipfs://<CID de la revision> --response-file ./revision.json \
     --tag <texto> [--dry-run]

# 5. Leer todo (solo lectura)
node read-validation.mjs --request-hash 0x<requestHash>
node read-validation.mjs --request-hash 0x<requestHash> --from-block <n> --to-block <m>   # por RPC, sin indexador
node read-validation.mjs --agent-id <n>
```

`--from` solo funciona junto con `--dry-run`. En vivo la cuenta siempre sale de la llave del env.

## Lo que hace cumplir el contrato (leido en la fuente verificada)

- `register(string)`: el agentId es `_lastId++`, asi que el primero fue 0. Usa `_safeMint`:
  si el dueno es un contrato, tiene que implementar `onERC721Received`.
- `validationRequest`: rechaza un validador en 0x0 y un requestHash repetido (es unico en
  todo el registro, no por agente), y exige que quien llama sea dueno, operador o aprobado
  del agentId. **No** impide que el validador sea el mismo dueno. El script avisa si pasa,
  pero no lo bloquea.
- `requestURI` **no se guarda**: solo vive en el evento `ValidationRequest`. Para recuperar
  el CID hay que leer el log, no el storage.
- `validationResponse`: exige que la solicitud exista ("unknown"), que llame el validador
  nombrado ("not validator") y que response sea <= 100. **No hay bloqueo de segunda
  respuesta**: el validador puede sobrescribir su respuesta despues. Para verificar, lean
  el ultimo evento `ValidationResponse` y `lastUpdate`, no solo el primero.
- `getValidationStatus` revierte con "unknown" si no existe, y no expone `hasResponse`.

## Probado el 26-nov-2026 contra Fuji (sin llaves, sin enviar nada)

- read-validation sobre una solicitud real de un tercero (agentId 301): estado, evento
  request y evento response leidos por Routescan y por RPC, con los mismos resultados.
- read-validation sobre un hash inexistente: "no existe (unknown)" y 0 eventos.
- register --dry-run: OK, unos 135k de gas.
- validation-request --dry-run desde el dueno real de 301: OK, unos 195k de gas. Desde otra
  direccion revierte con "Not authorized".
- validation-response --dry-run desde el validador real: OK, unos 61k de gas. Desde otra
  direccion revierte con "not validator"; con un hash inexistente, "unknown".
- Sin llave en vivo, o con `--from` sin `--dry-run`: el script se niega a correr.

## Trampas encontradas

- El RPC publico de Fuji rechaza `eth_getLogs` de mas de 100 bloques.
- Routescan devuelve `logIndex` como `"0x"` cuando vale 0. Ya esta manejado.
- `samples/recibo-ejemplo.json` es un recibo sintetico para los dry-run. No es real.
