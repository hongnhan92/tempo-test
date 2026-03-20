export const TOKEN_FACTORY_ABI = [
  {
    inputs: [
      { name: 'name',       type: 'string'  },
      { name: 'symbol',     type: 'string'  },
      { name: 'currency',   type: 'string'  },
      { name: 'quoteToken', type: 'address' },
      { name: 'admin',      type: 'address' },
      { name: 'salt',       type: 'bytes32' },
    ],
    name: 'createToken',
    outputs: [{ name: 'token', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    type: 'event',
    name: 'TokenCreated',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'admin', type: 'address' },
      { indexed: true, name: 'salt',  type: 'bytes32' },
    ],
  },
]

export const TOKEN_ABI = [
  // ERC-20 View
  { inputs: [], name: 'name',        outputs: [{ name: '', type: 'string'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol',      outputs: [{ name: '', type: 'string'  }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals',    outputs: [{ name: '', type: 'uint8'   }], stateMutability: 'pure', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // TIP-20 State
  { inputs: [], name: 'paused',           outputs: [{ name: '', type: 'bool'    }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'supplyCap',        outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'transferPolicyId', outputs: [{ name: '', type: 'uint64'  }], stateMutability: 'view', type: 'function' },
  // Role view
  { inputs: [], name: 'ISSUER_ROLE',       outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'PAUSE_ROLE',        outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'UNPAUSE_ROLE',      outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'BURN_BLOCKED_ROLE', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  // hasRole
  {
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    name: 'hasRole',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // grantRole / revokeRole
  {
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Issuance
  {
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Pause
  { inputs: [], name: 'pause',   outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'unpause', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  // Admin
  {
    inputs: [{ name: 'newSupplyCap', type: 'uint256' }],
    name: 'setSupplyCap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'newPolicyId', type: 'uint64' }],
    name: 'changeTransferPolicyId',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]