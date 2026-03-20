import React, { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { decodeEventLog, encodeFunctionData } from 'viem'
import { TOKEN_FACTORY_ABI, TOKEN_ABI } from '../../contracts/abis'
import { CONTRACTS, EXPLORER_URL } from '../../config'
import { generateSalt, parseTokenAmount, ROLES } from '../../utils/helpers'

// ── Step definitions ────────────────────────────────────────────────────────

const SEQ_STEPS = [
  { id: 'createToken',      label: 'Create Token',           phase: 'create' },
  { id: 'grantIssuer',      label: 'Grant ISSUER_ROLE',      phase: 'roles'  },
  { id: 'grantBurner',      label: 'Grant BURNER_ROLE',      phase: 'roles'  },
  { id: 'grantPauser',      label: 'Grant PAUSER_ROLE',      phase: 'roles'  },
  { id: 'grantCompliance',  label: 'Grant COMPLIANCE_ROLE',  phase: 'roles'  },
  { id: 'mint',             label: 'Mint Tokens',            phase: 'issue'  },
  { id: 'burn',             label: 'Burn Tokens',            phase: 'issue'  },
]

const BATCH_STEPS = [
  { id: 'createToken', label: 'Create Token',                      phase: 'create' },
  { id: 'batchOps',    label: 'Batch: Grant Roles + Mint + Burn',  phase: 'batch'  },
]

const S = { PENDING: 'pending', RUNNING: 'running', DONE: 'done', ERROR: 'error' }

// ── Sub-components ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  )
}

function StepRow({ step, status, txHash }) {
  const colors = {
    [S.PENDING]: 'text-gray-400',
    [S.RUNNING]: 'text-blue-700 font-semibold',
    [S.DONE]:    'text-green-700',
    [S.ERROR]:   'text-red-600',
  }
  const icons = {
    [S.PENDING]: <span className="w-3.5 text-center text-gray-300 text-xs">○</span>,
    [S.RUNNING]: <Spinner />,
    [S.DONE]:    <span className="w-3.5 text-center text-green-500 text-xs font-bold">✓</span>,
    [S.ERROR]:   <span className="w-3.5 text-center text-red-500 text-xs font-bold">✗</span>,
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="flex-shrink-0 w-3.5 flex items-center justify-center">
        {icons[status] ?? icons[S.PENDING]}
      </span>
      <span className={`text-xs flex-1 ${colors[status] ?? colors[S.PENDING]}`}>
        {step.label}
      </span>
      {txHash && (
        <a
          href={`${EXPLORER_URL}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex-shrink-0 font-mono"
        >
          {txHash.slice(0, 10)}…
        </a>
      )}
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-blue-600' : 'bg-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function CreateToken({ onTokenCreated }) {
  const { address, chain } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [form, setForm] = useState({
    name:        '',
    symbol:      '',
    mintAmount:  '1000000',
    burnAmount:  '10000',
    batchMode:   true,
  })

  const [loading,      setLoading]      = useState(false)
  // activeMode tracks the mode actually being executed (may differ from form.batchMode after fallback)
  const [activeMode,   setActiveMode]   = useState(null)   // 'batch' | 'sequential' | null
  const [fallbackMsg,  setFallbackMsg]  = useState(null)   // shown when batch → seq fallback occurs
  const [stepStatuses, setStepStatuses] = useState({})
  const [stepTxHashes, setStepTxHashes] = useState({})
  const [result,       setResult]       = useState(null)
  const [errorMsg,     setErrorMsg]     = useState(null)

  const displaySteps = activeMode === 'batch' ? BATCH_STEPS
                     : activeMode === 'sequential' ? SEQ_STEPS
                     : form.batchMode ? BATCH_STEPS : SEQ_STEPS

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setStep(id, status, txHash = null) {
    setStepStatuses(prev => ({ ...prev, [id]: status }))
    if (txHash) setStepTxHashes(prev => ({ ...prev, [id]: txHash }))
  }

  function markRunningAsError() {
    setStepStatuses(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (next[k] === S.RUNNING) next[k] = S.ERROR })
      return next
    })
  }

  async function waitTx(hash) {
    return publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  }

  // ── Extract token address from receipt logs ───────────────────────────────
  // Mirror automation.js: filter by factory address first, then decode.
  // Without this filter, a Transfer(from=0x0,...) log from ERC-20 minting
  // has topics[1] = zero address → wrong address returned.

  const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

  function extractTokenAddress(receipt) {
    const factoryLower = CONTRACTS.tokenFactory.toLowerCase()

    for (const log of receipt.logs) {
      // ① Only look at logs emitted BY the factory contract
      if (!log.address || log.address.toLowerCase() !== factoryLower) continue

      // ② ABI-decode TokenCreated (preferred — all fields are indexed in topics)
      try {
        const decoded = decodeEventLog({
          abi: TOKEN_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'TokenCreated' && decoded.args?.token) {
          const addr = decoded.args.token
          if (addr && addr.toLowerCase() !== ZERO_ADDR) return addr
        }
      } catch {}

      // ③ Fallback: extract last 20 bytes of topics[1]
      if (
        log.topics?.length >= 2 &&
        typeof log.topics[1] === 'string' &&
        log.topics[1].length === 66
      ) {
        const addr = `0x${log.topics[1].slice(-40)}`
        if (addr.toLowerCase() !== ZERO_ADDR) return addr
      }
    }
    return null
  }

  // ── Sequential execution (shared by fallback + explicit sequential) ────────

  async function runSequential(walletClient, tokenAddress, createHash, mintAmountParsed, burnAmountParsed) {
    // Reset step panel to sequential steps, keep createToken done
    setActiveMode('sequential')
    setStepStatuses({
      createToken:     S.DONE,
      grantIssuer:     S.PENDING,
      grantBurner:     S.PENDING,
      grantPauser:     S.PENDING,
      grantCompliance: S.PENDING,
      mint:            S.PENDING,
      burn:            S.PENDING,
    })
    setStepTxHashes(prev => ({ createToken: prev.createToken }))

    const roleSteps = [
      { id: 'grantIssuer',     role: ROLES.ISSUER_ROLE     },
      { id: 'grantBurner',     role: ROLES.BURNER_ROLE     },
      { id: 'grantPauser',     role: ROLES.PAUSER_ROLE     },
      { id: 'grantCompliance', role: ROLES.COMPLIANCE_ROLE },
    ]

    for (const { id, role } of roleSteps) {
      setStep(id, S.RUNNING)
      const h = await walletClient.writeContract({
        address: tokenAddress, abi: TOKEN_ABI,
        functionName: 'grantRole', args: [role, address],
      })
      await waitTx(h)
      setStep(id, S.DONE, h)
    }

    setStep('mint', S.RUNNING)
    const mintHash = await walletClient.writeContract({
      address: tokenAddress, abi: TOKEN_ABI,
      functionName: 'mint', args: [address, mintAmountParsed],
    })
    await waitTx(mintHash)
    setStep('mint', S.DONE, mintHash)

    setStep('burn', S.RUNNING)
    const burnHash = await walletClient.writeContract({
      address: tokenAddress, abi: TOKEN_ABI,
      functionName: 'burn', args: [burnAmountParsed],
    })
    await waitTx(burnHash)
    setStep('burn', S.DONE, burnHash)

    return { tokenAddress, createHash, mode: 'sequential' }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()

    if (!walletClient || !address) return setErrorMsg('Wallet not connected!')
    if (chain?.id !== 42431)       return setErrorMsg('Wrong network! Switch to Tempo Moderato Testnet (Chain ID: 42431)')
    if (!form.name || !form.symbol) return setErrorMsg('Token Name and Symbol are required')

    setLoading(true)
    setErrorMsg(null)
    setFallbackMsg(null)
    setResult(null)
    setActiveMode(form.batchMode ? 'batch' : 'sequential')
    setStepStatuses(Object.fromEntries(
      (form.batchMode ? BATCH_STEPS : SEQ_STEPS).map(s => [s.id, S.PENDING])
    ))
    setStepTxHashes({})

    try {
      // ── Step 1: createToken (same for both modes) ─────────────────────────
      setStep('createToken', S.RUNNING)

      const salt = generateSalt(address)
      const createHash = await walletClient.writeContract({
        address: CONTRACTS.tokenFactory,
        abi:     TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [form.name, form.symbol, 'USD', CONTRACTS.quoteToken, address, salt],
      })

      const createReceipt = await waitTx(createHash)
      const tokenAddress  = extractTokenAddress(createReceipt)
      if (!tokenAddress || tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        throw new Error('Token address not found in receipt logs — check factory address in config')
      }

      setStep('createToken', S.DONE, createHash)

      const mintAmountParsed = parseTokenAmount(form.mintAmount)
      const burnAmountParsed = parseTokenAmount(form.burnAmount)

      // ── BATCH MODE (with auto-fallback) ───────────────────────────────────
      if (form.batchMode) {
        setStep('batchOps', S.RUNNING)

        const roleCalls = [ROLES.ISSUER_ROLE, ROLES.BURNER_ROLE, ROLES.PAUSER_ROLE, ROLES.COMPLIANCE_ROLE]
          .map(role => ({
            to:   tokenAddress,
            data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'grantRole', args: [role, address] }),
          }))

        try {
          const batchHash = await walletClient.sendTransaction({
            calls: [
              ...roleCalls,
              {
                to:   tokenAddress,
                data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'mint', args: [address, mintAmountParsed] }),
              },
              {
                to:   tokenAddress,
                data: encodeFunctionData({ abi: TOKEN_ABI, functionName: 'burn', args: [burnAmountParsed] }),
              },
            ],
          })

          await waitTx(batchHash)
          setStep('batchOps', S.DONE, batchHash)
          const r = { tokenAddress, createHash, batchHash, mode: 'batch' }
          setResult(r)
          if (onTokenCreated) onTokenCreated(tokenAddress)
          return

        } catch (batchErr) {
          // ── Auto-fallback: batch unsupported → sequential ─────────────────
          console.warn('⚡ Batch mode failed, falling back to sequential:', batchErr?.message)
          setStep('batchOps', S.ERROR)
          setFallbackMsg('⚡ Batch mode not supported by wallet/RPC — switched to sequential automatically')
          const r = await runSequential(walletClient, tokenAddress, createHash, mintAmountParsed, burnAmountParsed)
          setResult(r)
          if (onTokenCreated) onTokenCreated(tokenAddress)
          return
        }
      }

      // ── SEQUENTIAL MODE ───────────────────────────────────────────────────
      const r = await runSequential(walletClient, tokenAddress, createHash, mintAmountParsed, burnAmountParsed)
      setResult(r)
      if (onTokenCreated) onTokenCreated(tokenAddress)

    } catch (err) {
      console.error('Issuance error:', err)
      let msg = err?.message || 'Unknown error'
      if (msg.includes('insufficient funds')) msg = 'Not enough gas — get testnet USD at https://faucet.tempo.xyz'
      else if (msg.includes('user rejected'))  msg = 'Transaction rejected'
      setErrorMsg(msg)
      markRunningAsError()
    } finally {
      setLoading(false)
    }
  }

  const hasSteps = Object.keys(stepStatuses).length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Token Issuance</h2>
        {chain && (
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            chain.id === 42431
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-600'
          }`}>
            {chain.id === 42431 ? '● Correct Network' : '● Wrong Network'}
          </span>
        )}
      </div>

      {/* ── Wrong network banner ── */}
      {chain && chain.id !== 42431 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠️ Switch to <strong>Tempo Moderato Testnet</strong> (Chain ID: 42431)
        </div>
      )}

      {/* ── Success ── */}
      {result && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-900 text-sm mb-2">
            ✅ Issuance complete
            <span className="ml-2 text-xs font-normal text-green-700">
              ({result.mode === 'batch' ? '⚡ batch' : '🔢 sequential'})
            </span>
          </p>
          <p className="text-xs font-mono text-green-800 break-all mb-3">{result.tokenAddress}</p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${EXPLORER_URL}/token/${result.tokenAddress}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:text-green-900 hover:underline"
            >
              Token page →
            </a>
            <a
              href={`${EXPLORER_URL}/tx/${result.createHash}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-green-700 hover:text-green-900 hover:underline"
            >
              Create TX →
            </a>
            {result.batchHash && (
              <a
                href={`${EXPLORER_URL}/tx/${result.batchHash}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium text-green-700 hover:text-green-900 hover:underline"
              >
                Batch TX →
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ❌ {errorMsg}
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Name + Symbol */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Token Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Alpha USD"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={loading}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Symbol</label>
            <input
              type="text"
              value={form.symbol}
              onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              placeholder="AUSD"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              maxLength={10}
              disabled={loading}
              required
            />
          </div>
        </div>

        {/* Mint + Burn amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Mint Amount
              <span className="text-gray-400 font-normal ml-1">(6 decimals)</span>
            </label>
            <input
              type="number"
              value={form.mintAmount}
              onChange={e => setForm({ ...form, mintAmount: e.target.value })}
              placeholder="1000000"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              min="0"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Burn Amount
              <span className="text-gray-400 font-normal ml-1">(6 decimals)</span>
            </label>
            <input
              type="number"
              value={form.burnAmount}
              onChange={e => setForm({ ...form, burnAmount: e.target.value })}
              placeholder="10000"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              min="0"
              disabled={loading}
            />
          </div>
        </div>

        {/* Batch mode toggle */}
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
          <div>
            <p className="text-sm font-medium text-blue-900">⚡ Tempo Batch Mode</p>
            <p className="text-xs text-blue-600 mt-0.5">
              {form.batchMode
                ? 'Grant roles + mint + burn in 1 tx'
                : 'Send each operation as a separate tx'}
            </p>
          </div>
          <Toggle
            checked={form.batchMode}
            onChange={v => setForm(prev => ({ ...prev, batchMode: v }))}
            disabled={loading}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || chain?.id !== 42431}
          className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '⏳ Processing…' : '🚀 Issue Token'}
        </button>
      </form>

      {/* ── Step progress panel ── */}
      {hasSteps && (
        <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {activeMode === 'batch' ? '⚡ Batch Mode' : '🔢 Sequential'} — {displaySteps.length} steps
            </p>
            {loading && <Spinner />}
          </div>
          <div className="space-y-0.5">
            {displaySteps.map(step => (
              <StepRow
                key={step.id}
                step={step}
                status={stepStatuses[step.id] ?? S.PENDING}
                txHash={stepTxHashes[step.id]}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer debug ── */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>Chain: {chain?.id ?? '—'} · {chain?.name ?? 'Not connected'}</span>
        <a
          href={`${EXPLORER_URL}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-500"
        >
          Explorer ↗
        </a>
      </div>

    </div>
  )
}