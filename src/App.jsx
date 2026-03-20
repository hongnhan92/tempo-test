import React, { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import CreateToken      from './components/TokenIssuance/CreateToken'
import TokenManager     from './components/TokenIssuance/TokenManager'
import LiquidityManager from './components/TokenIssuance/LiquidityManager'

const TABS = [
  { id: 'create',    label: '🚀 Issue Token'   },
  { id: 'manage',    label: '⚙️ Manage Token'  },
  { id: 'liquidity', label: '💧 Liquidity'      },
]

export default function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()

  const [tokenAddress, setTokenAddress] = useState(null)
  const [activeTab, setActiveTab]       = useState('create')

  function handleTokenCreated(addr) {
    setTokenAddress(addr)
    setActiveTab('manage')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Tempo Token Issuance</h1>
          {isConnected && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 font-mono">
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
                  className="btn btn-primary w-full">
                  Connect with {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-200 p-1 rounded-xl">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {tab.label}
                  {tab.id !== 'create' && tokenAddress && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" />
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'create'    && <CreateToken      onTokenCreated={handleTokenCreated} />}
            {activeTab === 'manage'    && <TokenManager     tokenAddress={tokenAddress} />}
            {activeTab === 'liquidity' && <LiquidityManager tokenAddress={tokenAddress} />}

          </div>
        )}
      </div>
    </div>
  )
}