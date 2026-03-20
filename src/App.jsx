import React, { useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import CreateToken from './components/TokenIssuance/CreateToken'

function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [tokenAddress, setTokenAddress] = useState(null)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Tempo Token Issuance</h1>
          {isConnected && (
            <div className="flex items-center gap-4">
              <span className="text-sm">{address?.slice(0,6)}...{address?.slice(-4)}</span>
              <button onClick={() => disconnect()} className="btn btn-primary">
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {!isConnected ? (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Connect Wallet</h2>
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                className="btn btn-primary w-full"
              >
                Connect with {connector.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-6">
            <CreateToken onTokenCreated={setTokenAddress} />
            
            {tokenAddress && (
              <div className="card">
                <h2 className="text-xl font-bold mb-2">Your Token</h2>
                <p className="text-sm text-gray-600">{tokenAddress}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
