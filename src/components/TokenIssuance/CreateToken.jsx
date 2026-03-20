import React, { useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { decodeEventLog } from 'viem'
import { TOKEN_FACTORY_ABI, TOKEN_ABI } from '../../contracts/abis'
import { CONTRACTS, EXPLORER_URL } from '../../config'
import { generateSalt, parseTokenAmount, ROLES, parseTxError } from '../../utils/helpers'

// ── Cap modes ─────────────────────────────────────────────────────────────────
const CAP_MODES = {
  none: {
    id: 'none',
    label: 'No Supply Cap',
    badge: 'Unlimited',
    badgeColor: 'bg-gray-100 text-gray-600',
    txCount: 2,
    desc: 'Total supply is unlimited. You can always mint more tokens.',
    warning: null,
  },
  flexible: {
    id: 'flexible',
    label: 'Fixed Cap (adjustable)',
    badge: 'Can increase later',
    badgeColor: 'bg-blue-100 text-blue-700',
    txCount: 3,
    desc: 'Set an initial cap. You can raise or remove it later as DEFAULT_ADMIN.',
    warning: null,
  },
  locked: {
    id: 'locked',
    label: 'Fixed Cap (locked forever)',
    badge: '🔒 Anti-rug',
    badgeColor: 'bg-red-100 text-red-700',
    txCount: 4,
    desc: 'Set a hard cap then permanently revoke your own admin rights. Nobody — including you — can ever increase the supply beyond this limit.',
    warning: '⚠️ IRREVERSIBLE: DEFAULT_ADMIN_ROLE will be revoked from your wallet. You will lose the ability to change supply cap, transfer policy, or grant new admin roles.',
  },
}

// ── Step builder ──────────────────────────────────────────────────────────────
function buildSteps(capMode) {
  const steps = [
    { id: 'createToken', label: 'Create Token',        desc: 'Deploy token via factory' },
    { id: 'grantIssuer', label: 'Grant ISSUER_ROLE',   desc: 'Allow mint & burn'        },
  ]
  if (capMode === 'flexible' || capMode === 'locked') {
    steps.push({ id: 'setCap', label: 'Set Supply Cap', desc: 'Lock maximum token supply' })
  }
  if (capMode === 'locked') {
    steps.push({ id: 'revokeAdmin', label: 'Revoke DEFAULT_ADMIN_ROLE', desc: '🔒 Permanently locks supply cap — irreversible' })
  }
  return steps
}

const S = { PENDING: 'pending', RUNNING: 'running', DONE: 'done', ERROR: 'error' }
const ZERO = '0x0000000000000000000000000000000000000000'

// ── Sub-components ────────────────────────────────────────────────────────────
function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
}

function StepRow({ step, status, txHash }) {
  const isRevoke = step.id === 'revokeAdmin'
  const color = {
    [S.PENDING]: 'text-gray-400',
    [S.RUNNING]: isRevoke ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold',
    [S.DONE]:    'text-green-700',
    [S.ERROR]:   'text-red-600',
  }
  const icon = { [S.PENDING]: '○', [S.RUNNING]: null, [S.DONE]: '✓', [S.ERROR]: '✗' }
  return (
    <div className={`flex items-start gap-3 py-2 ${isRevoke && status !== S.PENDING ? 'bg-red-50 -mx-4 px-4 rounded' : ''}`}>
      <span className="w-4 flex-shrink-0 text-center mt-0.5">
        {status === S.RUNNING ? <Spinner /> : (
          <span className={`text-xs ${color[status] ?? color[S.PENDING]}`}>{icon[status]}</span>
        )}
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

function CapModeCard({ mode, selected, onSelect, disabled }) {
  const info = CAP_MODES[mode]
  return (
    <button type="button" onClick={() => !disabled && onSelect(mode)} disabled={disabled}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all
        ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors
          ${selected ? 'border-blue-500 bg-blue-500' : 'border-gray-400'}`} />
        <span className="text-sm font-semibold text-gray-800">{info.label}</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${info.badgeColor}`}>
          {info.badge}
        </span>
      </div>
      <p className="text-xs text-gray-500 ml-5">{info.desc}</p>
      {info.warning && selected && (
        <div className="mt-2 ml-5 p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 font-medium">
          {info.warning}
        </div>
      )}
    </button>
  )
}

// ── Confirmation modal for locked mode ────────────────────────────────────────
function ConfirmLockModal({ tokenName, capAmount, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('')
  const required = 'I understand this is irreversible'
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">🔒</div>
          <h3 className="text-lg font-bold text-gray-900">Confirm Permanent Lock</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-800 space-y-2">
          <p><strong>Token:</strong> {tokenName}</p>
          <p><strong>Supply Cap:</strong> {Number(capAmount).toLocaleString()} tokens</p>
          <p className="pt-1">After this operation:</p>
          <ul className="list-disc ml-4 space-y-1 text-xs">
            <li>Supply cap is <strong>permanent</strong> — can never be raised</li>
            <li>No one can grant new admin roles</li>
            <li>No one can change transfer policy</li>
            <li>Total supply can never exceed <strong>{Number(capAmount).toLocaleString()}</strong></li>
          </ul>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Type <strong>"{required}"</strong> to confirm:
          </label>
          <input type="text" value={typed} onChange={e => setTyped(e.target.value)}
            placeholder={required}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel}
            className="py-2 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={typed !== required}
            className="py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white
              disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            🔒 Lock Forever
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CreateToken({ onTokenCreated }) {
  const { address, chain }     = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient           = usePublicClient()

  const [form, setForm] = useState({
    name: '', symbol: '',
    capMode: 'none',   // 'none' | 'flexible' | 'locked'
    capAmount: '',
  })

  const [loading, setLoading]     = useState(false)
  const [stepSt, setStepSt]       = useState({})
  const [stepTx, setStepTx]       = useState({})
  const [result, setResult]       = useState(null)
  const [errorMsg, setErrorMsg]   = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const steps      = buildSteps(form.capMode)
  const hasStarted = Object.keys(stepSt).length > 0
  const needsCap   = form.capMode === 'flexible' || form.capMode === 'locked'

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

  function validateForm() {
    if (!walletClient || !address) return 'Wallet not connected'
    if (chain?.id !== 42431) return 'Switch to Tempo Moderato Testnet (Chain ID: 42431)'
    if (!form.name || !form.symbol) return 'Token Name and Symbol are required'
    if (needsCap && (!form.capAmount || Number(form.capAmount) <= 0)) return 'Supply Cap amount is required'
    return null
  }

  function handleFormSubmit(e) {
    e.preventDefault()
    const err = validateForm()
    if (err) return setErrorMsg(err)
    setErrorMsg(null)
    // Locked mode → show confirmation modal first
    if (form.capMode === 'locked') {
      setShowConfirm(true)
    } else {
      runIssuance()
    }
  }

  async function runIssuance() {
    setShowConfirm(false)
    setLoading(true)
    setErrorMsg(null)
    setResult(null)
    setStepSt(Object.fromEntries(steps.map(s => [s.id, S.PENDING])))
    setStepTx({})

    try {
      // ── TX 1: Create Token ──────────────────────────────────────────────
      setStep('createToken', S.RUNNING)
      const createHash = await walletClient.writeContract({
        address: CONTRACTS.tokenFactory,
        abi:     TOKEN_FACTORY_ABI,
        functionName: 'createToken',
        args: [form.name, form.symbol, 'USD', CONTRACTS.quoteToken, address, generateSalt(address)],
      })
      const receipt   = await waitTx(createHash)
      const tokenAddr = extractTokenAddress(receipt)
      if (!tokenAddr || tokenAddr.toLowerCase() === ZERO)
        throw new Error('Token address not found in receipt')
      setStep('createToken', S.DONE, createHash)

      // ── TX 2: Grant ISSUER_ROLE ─────────────────────────────────────────
      setStep('grantIssuer', S.RUNNING)
      const grantHash = await walletClient.writeContract({
        address: tokenAddr, abi: TOKEN_ABI,
        functionName: 'grantRole',
        args: [ROLES.ISSUER_ROLE, address],
      })
      await waitTx(grantHash)
      setStep('grantIssuer', S.DONE, grantHash)

      let capHash = null, revokeHash = null

      // ── TX 3: Set Supply Cap (flexible or locked) ───────────────────────
      if (needsCap) {
        setStep('setCap', S.RUNNING)
        capHash = await walletClient.writeContract({
          address: tokenAddr, abi: TOKEN_ABI,
          functionName: 'setSupplyCap',
          args: [parseTokenAmount(form.capAmount)],
        })
        await waitTx(capHash)
        setStep('setCap', S.DONE, capHash)
      }

      // ── TX 4: Revoke DEFAULT_ADMIN_ROLE (locked only) ────────────────────
      if (form.capMode === 'locked') {
        setStep('revokeAdmin', S.RUNNING)
        revokeHash = await walletClient.writeContract({
          address: tokenAddr, abi: TOKEN_ABI,
          functionName: 'revokeRole',
          args: [ROLES.DEFAULT_ADMIN_ROLE, address],
        })
        await waitTx(revokeHash)
        setStep('revokeAdmin', S.DONE, revokeHash)
      }

      setResult({ tokenAddress: tokenAddr, createHash, grantHash, capHash, revokeHash, capMode: form.capMode })
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

  const txCount = steps.length

  return (
    <>
      {/* Confirmation modal */}
      {showConfirm && (
        <ConfirmLockModal
          tokenName={`${form.name} (${form.symbol})`}
          capAmount={form.capAmount}
          onConfirm={runIssuance}
          onCancel={() => setShowConfirm(false)}
        />
      )}

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

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            ❌ {errorMsg}
          </div>
        )}

        {/* Success */}
        {result && (
          <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="font-semibold text-green-900 text-sm mb-1">
              ✅ Token ready!
              {result.capMode === 'locked' && (
                <span className="ml-2 text-xs font-normal bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  🔒 Supply cap locked forever
                </span>
              )}
              {result.capMode === 'flexible' && (
                <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Supply cap set
                </span>
              )}
            </p>
            <p className="text-xs font-mono text-green-800 break-all mb-3">{result.tokenAddress}</p>
            <div className="flex flex-wrap gap-3">
              <a href={`${EXPLORER_URL}/token/${result.tokenAddress}`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium text-green-700 hover:underline">Token page →</a>
              <a href={`${EXPLORER_URL}/tx/${result.createHash}`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-medium text-green-700 hover:underline">Create TX →</a>
              {result.capHash && (
                <a href={`${EXPLORER_URL}/tx/${result.capHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-green-700 hover:underline">Cap TX →</a>
              )}
              {result.revokeHash && (
                <a href={`${EXPLORER_URL}/tx/${result.revokeHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-red-600 hover:underline">🔒 Lock TX →</a>
              )}
            </div>
            <p className="text-xs text-green-600 mt-3">
              💡 Go to <strong>Manage Token</strong> tab to mint, burn, and configure your token.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="space-y-5">

          {/* Name + Symbol */}
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

          {/* Supply Cap Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Supply Cap Policy
            </label>
            <div className="space-y-2">
              {Object.keys(CAP_MODES).map(mode => (
                <CapModeCard key={mode} mode={mode}
                  selected={form.capMode === mode}
                  onSelect={m => setForm(p => ({ ...p, capMode: m, capAmount: '' }))}
                  disabled={loading} />
              ))}
            </div>
          </div>

          {/* Cap amount input — only shown when cap is needed */}
          {needsCap && (
            <div className={`p-3 rounded-xl border ${form.capMode === 'locked' ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Maximum Supply
                {form.capMode === 'locked' && <span className="text-red-600 ml-1">(permanent — cannot be raised)</span>}
              </label>
              <input
                type="number"
                value={form.capAmount}
                onChange={e => setForm(p => ({ ...p, capAmount: e.target.value }))}
                placeholder="e.g. 1000000000"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                min="1"
                disabled={loading}
                required={needsCap}
              />
              {form.capAmount && (
                <p className="text-xs text-gray-500 mt-1">
                  = {Number(form.capAmount).toLocaleString()} tokens max
                </p>
              )}
            </div>
          )}

          {/* TX count info */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">{txCount} transaction{txCount > 1 ? 's' : ''} required:</p>
            {steps.map((s, i) => (
              <p key={s.id}>
                {i + 1}. {s.label}
                {s.id === 'revokeAdmin' && <span className="text-red-600 ml-1">(irreversible)</span>}
              </p>
            ))}
          </div>

          <button type="submit" disabled={loading || chain?.id !== 42431}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              ${form.capMode === 'locked'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
            {loading ? '⏳ Processing…' : form.capMode === 'locked' ? '🔒 Issue & Lock Token' : '🚀 Issue Token'}
          </button>
        </form>

        {/* Step progress */}
        {hasStarted && (
          <div className="mt-5 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {txCount} Steps
              </p>
              {loading && <Spinner />}
            </div>
            <div className="divide-y divide-gray-100">
              {steps.map(step => (
                <StepRow key={step.id} step={step}
                  status={stepSt[step.id] ?? S.PENDING}
                  txHash={stepTx[step.id]} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
          <span>Chain: {chain?.id ?? '—'}</span>
          <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500">Explorer ↗</a>
        </div>
      </div>
    </>
  )
}