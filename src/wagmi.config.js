import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { tempoModerato } from './config'

export const config = createConfig({
  chains: [tempoModerato],
  connectors: [injected()],
  transports: {
    [tempoModerato.id]: http(),
  },
})