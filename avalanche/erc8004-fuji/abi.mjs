// Minimal ABI extracted on 26-nov-2026 from Routescan's getabi API for the
// verified implementations on Fuji. Do not edit by hand: regenerate from the source.
// IdentityRegistryUpgradeable impl 0x7274e874ca62410a93bd8bf61c69d8045e399c02
// ValidationRegistryUpgradeable impl 0xdb31f5d9167f8ebc8b30fbbf814c4d297c2d7f99
export const identityAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "agentURI",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "Registered",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentWallet",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "agentURI",
        "type": "string"
      }
    ],
    "name": "register",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "tokenURI",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export const validationAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "validatorAddress",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "requestURI",
        "type": "string"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      }
    ],
    "name": "ValidationRequest",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "validatorAddress",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "response",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "responseURI",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "responseHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "tag",
        "type": "string"
      }
    ],
    "name": "ValidationResponse",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentValidations",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getIdentityRegistry",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      }
    ],
    "name": "getValidationStatus",
    "outputs": [
      {
        "internalType": "address",
        "name": "validatorAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "internalType": "uint8",
        "name": "response",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "responseHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "tag",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "lastUpdate",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "validatorAddress",
        "type": "address"
      }
    ],
    "name": "getValidatorRequests",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getVersion",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "validatorAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "requestURI",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      }
    ],
    "name": "validationRequest",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "response",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "responseURI",
        "type": "string"
      },
      {
        "internalType": "bytes32",
        "name": "responseHash",
        "type": "bytes32"
      },
      {
        "internalType": "string",
        "name": "tag",
        "type": "string"
      }
    ],
    "name": "validationResponse",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];
