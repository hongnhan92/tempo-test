import React, { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import CreateToken      from './components/TokenIssuance/CreateToken'
import TokenManager     from './components/TokenIssuance/TokenManager'
import LiquidityManager from './components/TokenIssuance/LiquidityManager'
import SwapWidget       from './components/Swap/SwapWidget'

const TABS = [
  { id: 'create',    label: '🚀 Issue'     },
  { id: 'manage',    label: '⚙️ Manage'   },
  { id: 'liquidity', label: '💧 Liquidity' },
  { id: 'swap',      label: '🔄 Swap'      },
]

export default function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()

  const [tokenAddress, setTokenAddress] = useState(null)
  const [activeTab,    setActiveTab]    = useState('create')

  function handleTokenCreated(addr) {
    setTokenAddress(addr)
    setActiveTab('manage')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Tempo Token Issuance</h1>
          {isConnected && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-mono bg-gray-100 px-3 py-1.5 rounded-lg">
                {address?.slice(0,6)}…{address?.slice(-4)}
              </span>
              <button onClick={() => disconnect()} className="btn btn-primary text-sm">
                Disconnect
              </button>
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Connect Wallet</h2>
            <div className="space-y-2">
              {connectors.map(c => (
                <button key={c.id} onClick={() => connect({ connector: c })}
                  className="btn btn-primary w-full">{c.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-200 p-1 rounded-xl">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all relative ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab.label}
                  {tab.id !== 'create' && tab.id !== 'swap' && tokenAddress && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'create'    && <CreateToken      onTokenCreated={handleTokenCreated} />}
            {activeTab === 'manage'    && <TokenManager     tokenAddress={tokenAddress} />}
            {activeTab === 'liquidity' && <LiquidityManager tokenAddress={tokenAddress} />}
            {activeTab === 'swap'      && <SwapWidget />}

          </div>
        )}
      </div>
    </div>
  )
}