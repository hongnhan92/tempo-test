export const TOKEN_FACTORY_ABI = [
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'currency', type: 'string' },
      { name: 'quoteToken', type: 'address' },
      { name: 'admin', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    name: 'createToken',
    outputs: [{ name: 'token', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    type: 'event',
    name: 'TokenCreated',
    inputs: [
      { indexed: true, name: 'token', type: 'address' },
      { indexed: true, name: 'admin', type: 'address' },
      { indexed: true, name: 'salt', type: 'bytes32' },
    ],
  },
]

export const TOKEN_ABI = [
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
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]