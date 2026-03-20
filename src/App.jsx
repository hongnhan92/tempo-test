import React, { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import CreateToken from './components/TokenIssuance/CreateToken'
import TokenManager from './components/TokenIssuance/TokenManager'

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const { disconnect }           = useDisconnect()

  const [tokenAddress, setTokenAddress] = useState(null)
  // 'create' | 'manage'
  const [activeTab, setActiveTab]       = useState('create')

  function handleTokenCreated(addr) {
    setTokenAddress(addr)
    setActiveTab('manage')   // auto-switch to manager after issuance
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ── */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Tempo Token Issuance</h1>
          {isConnected && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 font-mono">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
              <button onClick={() => disconnect()} className="btn btn-primary text-sm">
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* ── Connect wallet ── */}
        {!isConnected ? (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Connect Wallet</h2>
            <div className="space-y-2">
              {connectors.map(connector => (
                <button
                  key={connector.id}
                  onClick={() => connect({ connector })}
                  className="btn btn-primary w-full"
                >
                  Connect with {connector.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-gray-200 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'create'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🚀 Issue Token
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'manage'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ⚙️ Manage Token
                {tokenAddress && (
                  <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-green-500 align-middle" />
                )}
              </button>
            </div>

            {/* ── Tab content ── */}
            {activeTab === 'create' && (
              <CreateToken onTokenCreated={handleTokenCreated} />
            )}

            {activeTab === 'manage' && (
              <TokenManager tokenAddress={tokenAddress} />
            )}

          </div>
        )}
      </div>
    </div>
  )
}

export default App