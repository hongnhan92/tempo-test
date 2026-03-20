import React, { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { TOKEN_FACTORY_ABI } from '../../contracts/abis'
import { CONTRACTS } from '../../config'
import { generateSalt } from '../../utils/helpers'

export default function CreateToken({ onTokenCreated }) {
  const { address, chain } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  
  const [formData, setFormData] = useState({ name: '', symbol: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    console.log('🚀 Creating token...')
    console.log('Wallet:', address)
    console.log('Chain ID:', chain?.id)
    console.log('Form Data:', formData)
    
    // Validation
    if (!walletClient || !address) {
      alert('❌ Wallet not connected!')
      return
    }
    
    if (chain?.id !== 42431) {
      alert('❌ Wrong network! Please switch to Tempo Moderato Testnet (Chain ID: 42431)')
      return
    }
    
    if (!formData.name || !formData.symbol) {
      alert('❌ Please fill in all fields!')
      return
    }
    
    setLoading(true)
    setResult(null)
    
    try {
      console.log('📝 Generating salt...')
      const salt = generateSalt(address)
      console.log('Salt:', salt)
      
      console.log('📤 Sending transaction...')
      const txHash = await walletClient.writeContract({
        address: CONTRACTS.tokenFactory,
        abi: TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [
          formData.name,
          formData.symbol,
          'USD',
          '0x20c0000000000000000000000000000000000000',
          address,
          salt,
        ],
      })
      
      console.log('✅ Transaction sent:', txHash)
      console.log('⏳ Waiting for confirmation...')
      
      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash,
        timeout: 60_000,
      })
      
      console.log('✅ Transaction confirmed:', receipt)
      
      // Extract token address from logs
      let tokenAddress = null
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: TOKEN_FACTORY_ABI,
            data: log.data,
            topics: log.topics,
          })
          if (decoded.eventName === 'TokenCreated') {
            tokenAddress = decoded.args.token
            console.log('🪙 Token created at:', tokenAddress)
            break
          }
        } catch {}
      }
      
      if (!tokenAddress) {
        throw new Error('Token address not found in logs')
      }
      
      setResult({ 
        success: true, 
        tokenAddress, 
        txHash,
        explorerUrl: `https://explore.tempo.xyz/tx/${txHash}`,
      })
      
      if (onTokenCreated) onTokenCreated(tokenAddress)
      
      alert(`✅ Token created successfully!\n\nAddress: ${tokenAddress}`)
      
    } catch (error) {
      console.error('❌ Error:', error)
      
      let errorMsg = error.message || 'Unknown error'
      
      // User-friendly error messages
      if (errorMsg.includes('insufficient funds')) {
        errorMsg = 'Not enough gas! Get testnet USD from https://faucet.tempo.xyz'
      } else if (errorMsg.includes('user rejected')) {
        errorMsg = 'Transaction rejected by user'
      }
      
      setResult({ success: false, error: errorMsg })
      alert('❌ Error: ' + errorMsg)
      
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">Create Token</h2>
      
      {/* Network Warning */}
      {chain && chain.id !== 42431 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded">
          <p className="text-sm text-amber-800">
            ⚠️ Wrong network! Switch to <strong>Tempo Moderato Testnet</strong>
          </p>
        </div>
      )}
      
      {/* Success */}
      {result?.success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-semibold text-green-900">✅ Success!</p>
          <p className="text-sm text-green-800 mt-1 break-all">
            Token: {result.tokenAddress}
          </p>
          <a 
            href={result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-600 hover:underline mt-2 inline-block"
          >
            View on Explorer →
          </a>
        </div>
      )}
      
      {/* Error */}
      {result?.error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-800">{result.error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="e.g., Alpha USD"
            className="w-full px-4 py-2 border rounded-lg"
            required
            disabled={loading}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">
            Token Symbol
          </label>
          <input
            type="text"
            value={formData.symbol}
            onChange={(e) => setFormData({...formData, symbol: e.target.value.toUpperCase()})}
            placeholder="e.g., AUSD"
            className="w-full px-4 py-2 border rounded-lg"
            maxLength={10}
            required
            disabled={loading}
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full disabled:opacity-50"
        >
          {loading ? '⏳ Creating...' : '🚀 Create Token'}
        </button>
      </form>
      
      {/* Debug Info */}
      <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
        <p>Chain ID: {chain?.id || 'Not connected'}</p>
        <p>Network: {chain?.name || 'Unknown'}</p>
      </div>
    </div>
  )
}