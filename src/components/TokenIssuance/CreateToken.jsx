import React, { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { TOKEN_FACTORY_ABI, TOKEN_ABI } from '../../contracts/abis'
import { CONTRACTS, EXPLORER_URL } from '../../config'
import { generateSalt, ROLES, parseTxError } from '../../utils/helpers'

const STEPS = [
  { id: 'createToken', label: 'Create Token',       desc: 'Deploy token via factory' },
  { id: 'grantIssuer', label: 'Grant ISSUER_ROLE',  desc: 'Allow mint & burn'        },
]

const S = { PENDING: 'pending', RUNNING: 'running', DONE: 'done', ERROR: 'error' }

function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
}

function StepRow({ step, status, txHash }) {
  const color = { [S.PENDING]: 'text-gray-400', [S.RUNNING]: 'text-blue-700 font-semibold', [S.DONE]: 'text-green-700', [S.ERROR]: 'text-red-600' }
  const icon  = { [S.PENDING]: '○', [S.RUNNING]: null, [S.DONE]: '✓', [S.ERROR]: '✗' }
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-4 flex-shrink-0 text-center mt-0.5">
        {status === S.RUNNING ? <Spinner /> : <span className={`text-xs ${color[status]}`}>{icon[status]}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${color[status] ?? color[S.PENDING]}`}>{step.label}</p>
        <p className="text-xs text-gray-400">{step.desc}</p>
      </div>
      {txHash && (
        <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="text-xs font-mono text-blue-500 hover:underline flex-shrink-0">
          {txHash.slice(0, 10)}…
        </a>
      )}
    </div>
  )
}

const ZERO = '0x0000000000000000000000000000000000000000'

export default function CreateToken({ onTokenCreated }) {
  const { address, chain }       = useAccount()
  const { data: walletClient }   = useWalletClient()
  const publicClient             = usePublicClient()

  const [form, setForm]             = useState({ name: '', symbol: '' })
  const [loading, setLoading]       = useState(false)
  const [stepStatuses, setStepSt]   = useState({})
  const [stepTxHashes, setStepTx]   = useState({})
  const [result, setResult]         = useState(null)
  const [errorMsg, setErrorMsg]     = useState(null)
  const hasStarted                  = Object.keys(stepStatuses).length > 0

  function setStep(id, status, hash = null) {
    setStepSt(p => ({ ...p, [id]: status }))
    if (hash) setStepTx(p => ({ ...p, [id]: hash }))
  }

  async function waitTx(hash) {
    return publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  }

  function extractTokenAddress(receipt) {
    const factoryLower = CONTRACTS.tokenFactory.toLowerCase()
    for (const log of receipt.logs) {
      if (!log.address || log.address.toLowerCase() !== factoryLower) continue
      try {
        const decoded = decodeEventLog({ abi: TOKEN_FACTORY_ABI, data: log.data, topics: log.topics })
        if (decoded.eventName === 'TokenCreated' && decoded.args?.token) {
          const addr = decoded.args.token
          if (addr && addr.toLowerCase() !== ZERO) return addr
        }
      } catch {}
      if (log.topics?.length >= 2 && typeof log.topics[1] === 'string' && log.topics[1].length === 66) {
        const addr = `0x${log.topics[1].slice(-40)}`
        if (addr.toLowerCase() !== ZERO) return addr
      }
    }
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!walletClient || !address) return setErrorMsg('Wallet not connected')
    if (chain?.id !== 42431) return setErrorMsg('Switch to Tempo Moderato Testnet (Chain ID: 42431)')
    if (!form.name || !form.symbol) return setErrorMsg('Name and Symbol are required')

    setLoading(true)
    setErrorMsg(null)
    setResult(null)
    setStepSt(Object.fromEntries(STEPS.map(s => [s.id, S.PENDING])))
    setStepTx({})

    try {
      // ── TX 1: Create Token ──────────────────────────────────────────────
      setStep('createToken', S.RUNNING)
      const salt       = generateSalt(address)
      const createHash = await walletClient.writeContract({
        address: CONTRACTS.tokenFactory,
        abi:     TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [form.name, form.symbol, 'USD', CONTRACTS.quoteToken, address, salt],
      })
      const receipt    = await waitTx(createHash)
      const tokenAddr  = extractTokenAddress(receipt)
      if (!tokenAddr || tokenAddr.toLowerCase() === ZERO)
        throw new Error('Token address not found in receipt — check factory address')
      setStep('createToken', S.DONE, createHash)

      // ── TX 2: Grant ISSUER_ROLE ─────────────────────────────────────────
      setStep('grantIssuer', S.RUNNING)
      const grantHash = await walletClient.writeContract({
        address: tokenAddr,
        abi:     TOKEN_ABI,
        functionName: 'grantRole',
        args: [ROLES.ISSUER_ROLE, address],
      })
      await waitTx(grantHash)
      setStep('grantIssuer', S.DONE, grantHash)

      setResult({ tokenAddress: tokenAddr, createHash, grantHash })
      if (onTokenCreated) onTokenCreated(tokenAddr)

    } catch (err) {
      console.error(err)
      setErrorMsg(parseTxError(err))
      setStepSt(p => {
        const n = { ...p }
        Object.keys(n).forEach(k => { if (n[k] === S.RUNNING) n[k] = S.ERROR })
        return n
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Issue Token</h2>
        {chain && (
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            chain.id === 42431 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>
            {chain.id === 42431 ? '● Correct Network' : '● Wrong Network'}
          </span>
        )}
      </div>

      {chain && chain.id !== 42431 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠️ Switch to <strong>Tempo Moderato Testnet</strong> (Chain ID: 42431)
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ❌ {errorMsg}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-900 text-sm mb-1">✅ Token ready!</p>
          <p className="text-xs font-mono text-green-800 break-all mb-3">{result.tokenAddress}</p>
          <div className="flex flex-wrap gap-3">
            <a href={`${EXPLORER_URL}/token/${result.tokenAddress}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:underline">Token page →</a>
            <a href={`${EXPLORER_URL}/tx/${result.createHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:underline">Create TX →</a>
            <a href={`${EXPLORER_URL}/tx/${result.grantHash}`} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:underline">Grant TX →</a>
          </div>
          <p className="text-xs text-green-600 mt-3">
            💡 Go to <strong>Manage Token</strong> tab to mint, burn, pause, and configure your token.
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Token Name</label>
            <input type="text" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Alpha USD"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={loading} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Symbol</label>
            <input type="text" value={form.symbol}
              onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              placeholder="AUSD" maxLength={10}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={loading} required />
          </div>
        </div>

        {/* Info box */}
        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
          <p className="font-medium">2 transactions required:</p>
          <p>① Deploy token contract via factory</p>
          <p>② Grant ISSUER_ROLE → allows mint & burn</p>
        </div>

        <button type="submit" disabled={loading || chain?.id !== 42431}
          className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? '⏳ Processing…' : '🚀 Issue Token'}
        </button>
      </form>

      {/* Step progress */}
      {hasStarted && (
        <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">2 Steps</p>
            {loading && <Spinner />}
          </div>
          <div className="divide-y divide-gray-100">
            {STEPS.map(step => (
              <StepRow key={step.id} step={step}
                status={stepStatuses[step.id] ?? S.PENDING}
                txHash={stepTxHashes[step.id]} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
        <span>Chain: {chain?.id ?? '—'}</span>
        <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500">Explorer ↗</a>
      </div>
    </div>
  )
}