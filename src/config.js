import { defineChain } from 'viem'

export const tempoModerato = defineChain({
  id: 42431,
  name: 'Tempo Moderato Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explore.moderato.tempo.xyz' },
  },
  testnet: true,
})

export const CONTRACTS = {
  tokenFactory: '0x20fc000000000000000000000000000000000000',
  dex:          '0xdec0000000000000000000000000000000000000',
  alphaUSD:     '0x20c0000000000000000000000000000000000001',
  betaUSD:      '0x20c0000000000000000000000000000000000002',
  thetaUSD:     '0x20c0000000000000000000000000000000000003',
  quoteToken:   '0x20c0000000000000000000000000000000000000',
}

export const FAUCET_URL   = 'https://faucet.tempo.xyz'
export const EXPLORER_URL = 'https://explore.moderato.tempo.xyz'