import React, { useState, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { TOKEN_ABI } from '../../contracts/abis'
import { EXPLORER_URL } from '../../config'
import { parseTokenAmount, formatTokenAmount, ROLES, ROLE_LABELS, parseTxError } from '../../utils/helpers'

// ── Shared primitives ────────────────────────────────────────────────────────

function Spinner({ size = 'sm' }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border-2' : 'w-4 h-4 border-2'
  return <span className={`inline-block ${sz} border-blue-500 border-t-transparent rounded-full animate-spin`} />
}

function TxResult({ tx }) {
  if (!tx) return null
  return (
    <div className={`mt-2 p-2.5 rounded-lg text-xs ${tx.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
      {tx.success
        ? <span>✅ Done — <a href={`${EXPLORER_URL}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="underline font-mono">{tx.hash.slice(0,14)}…</a></span>
        : <span>❌ {tx.error}</span>
      }
    </div>
  )
}

function SectionCard({ title, icon, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.text}</span>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 bg-white border-t border-gray-100">{children}</div>}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {hint && <span className="text-gray-400 font-normal ml-1">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', disabled, mono, ...rest }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      disabled={disabled} {...rest}
      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50
        ${mono ? 'font-mono' : ''}`} />
  )
}

function Btn({ children, onClick, disabled, color = 'blue', loading, type = 'button', wide = true }) {
  const colors = {
    blue:  'bg-blue-600 hover:bg-blue-700 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
    red:   'bg-red-500   hover:bg-red-600   text-white',
    amber: 'bg-amber-500 hover:bg-amber-600 text-white',
    gray:  'bg-gray-200  hover:bg-gray-300  text-gray-800',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`${wide ? 'w-full' : 'px-4'} py-2 rounded-lg text-sm font-medium transition-colors
        ${colors[color]} disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center gap-2`}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TokenManager({ tokenAddress: initAddr }) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  // ── Token load ───────────────────────────────────────────────────────────
  const [tokenAddress, setTokenAddress] = useState(initAddr || '')
  const [tokenInfo, setTokenInfo]       = useState(null)
  const [loadingInfo, setLoadingInfo]   = useState(false)
  const [infoError, setInfoError]       = useState(null)

  const loadTokenInfo = useCallback(async (addr) => {
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) return setInfoError('Invalid address')
    setLoadingInfo(true); setInfoError(null); setTokenInfo(null)
    try {
      const [name, symbol, totalSupply, balance, paused, supplyCap, transferPolicyId] = await Promise.all([
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'paused' }).catch(() => false),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'supplyCap' }).catch(() => 0n),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'transferPolicyId' }).catch(() => 1n),
      ])
      setTokenInfo({ name, symbol, totalSupply, balance, paused, supplyCap, transferPolicyId })
    } catch (err) {
      setInfoError('Cannot read token — check address or network')
    } finally {
      setLoadingInfo(false)
    }
  }, [publicClient, address])

  const refresh = useCallback(() => tokenAddress && loadTokenInfo(tokenAddress), [tokenAddress, loadTokenInfo])

  // ── Generic tx runner ────────────────────────────────────────────────────
  async function runTx(setLoading, setTx, fn) {
    setLoading(true); setTx(null)
    try {
      const hash = await fn()
      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
      setTx({ success: true, hash })
      await refresh()
    } catch (err) {
      setTx({ success: false, error: parseTxError(err) })
    } finally {
      setLoading(false)
    }
  }

  // ── Mint ─────────────────────────────────────────────────────────────────
  const [mintTo, setMintTo]         = useState('')
  const [mintAmt, setMintAmt]       = useState('')
  const [mintLoading, setMintLoad]  = useState(false)
  const [mintTx, setMintTx]         = useState(null)

  async function handleMint(e) {
    e.preventDefault()
    await runTx(setMintLoad, setMintTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'mint',
        args: [mintTo || address, parseTokenAmount(mintAmt)] }))
    setMintAmt('')
  }

  // ── Burn ─────────────────────────────────────────────────────────────────
  const [burnAmt, setBurnAmt]       = useState('')
  const [burnLoading, setBurnLoad]  = useState(false)
  const [burnTx, setBurnTx]         = useState(null)

  async function handleBurn(e) {
    e.preventDefault()
    await runTx(setBurnLoad, setBurnTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'burn',
        args: [parseTokenAmount(burnAmt)] }))
    setBurnAmt('')
  }

  // ── Pause / Unpause ───────────────────────────────────────────────────────
  const [pauseLoading, setPauseLoad] = useState(false)
  const [pauseTx, setPauseTx]        = useState(null)

  async function handlePause() {
    await runTx(setPauseLoad, setPauseTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'pause' }))
  }
  async function handleUnpause() {
    await runTx(setPauseLoad, setPauseTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'unpause' }))
  }

  // ── Supply Cap ────────────────────────────────────────────────────────────
  const [capAmt, setCapAmt]         = useState('')
  const [capLoading, setCapLoad]    = useState(false)
  const [capTx, setCapTx]           = useState(null)

  async function handleSetCap(e) {
    e.preventDefault()
    await runTx(setCapLoad, setCapTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'setSupplyCap',
        args: [parseTokenAmount(capAmt)] }))
    setCapAmt('')
  }

  // ── Grant / Revoke Role ───────────────────────────────────────────────────
  const [roleTarget, setRoleTarget] = useState('')
  const [roleKey, setRoleKey]       = useState('ISSUER_ROLE')
  const [grantLoading, setGrantLoad]= useState(false)
  const [grantTx, setGrantTx]       = useState(null)
  const [revokeLoading, setRevokeLoad]= useState(false)
  const [revokeTx, setRevokeTx]     = useState(null)

  async function handleGrant() {
    await runTx(setGrantLoad, setGrantTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'grantRole',
        args: [ROLES[roleKey], roleTarget || address] }))
  }
  async function handleRevoke() {
    await runTx(setRevokeLoad, setRevokeTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'revokeRole',
        args: [ROLES[roleKey], roleTarget || address] }))
  }

  // ── Transfer Policy ───────────────────────────────────────────────────────
  const [policyId, setPolicyId]     = useState('')
  const [policyLoading, setPolicyLoad]= useState(false)
  const [policyTx, setPolicyTx]     = useState(null)

  async function handlePolicy(e) {
    e.preventDefault()
    await runTx(setPolicyLoad, setPolicyTx, () =>
      walletClient.writeContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'changeTransferPolicyId',
        args: [BigInt(policyId)] }))
    setPolicyId('')
  }

  const isReady = !!tokenInfo

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Manage Token</h2>
        {isReady && (
          <button onClick={refresh} disabled={loadingInfo}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50">
            {loadingInfo ? <Spinner /> : '↻'} Refresh
          </button>
        )}
      </div>

      {/* Token address input */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Token Address</label>
        <div className="flex gap-2">
          <Input value={tokenAddress} onChange={e => { setTokenAddress(e.target.value); setTokenInfo(null); setInfoError(null) }}
            placeholder="0x…" mono />
          <Btn onClick={() => loadTokenInfo(tokenAddress)} disabled={!tokenAddress} loading={loadingInfo} wide={false}>
            Load
          </Btn>
        </div>
        {infoError && <p className="text-xs text-red-600 mt-1">{infoError}</p>}
      </div>

      {/* Token stats */}
      {isReady && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
          {[
            { label: 'Name',         value: tokenInfo.name },
            { label: 'Symbol',       value: tokenInfo.symbol },
            { label: 'Total Supply', value: formatTokenAmount(tokenInfo.totalSupply) },
            { label: 'Your Balance', value: `${formatTokenAmount(tokenInfo.balance)} ${tokenInfo.symbol}` },
            { label: 'Supply Cap',   value: tokenInfo.supplyCap > 0n ? formatTokenAmount(tokenInfo.supplyCap) : 'Unlimited' },
            { label: 'Policy ID',    value: `#${tokenInfo.transferPolicyId.toString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="text-center py-2">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-900 truncate">{value}</p>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-3 text-center pt-1">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${tokenInfo.paused ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {tokenInfo.paused ? '⏸ PAUSED' : '▶ ACTIVE'}
            </span>
          </div>
        </div>
      )}

      {!isReady && !loadingInfo && !infoError && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Enter a token address above and click <strong>Load</strong>
        </div>
      )}

      {/* ── Sections ────────────────────────────────────────────────────── */}
      {isReady && (
        <div className="space-y-2">

          {/* MINT */}
          <SectionCard title="Mint Tokens" icon="⬆" defaultOpen
            badge={{ text: 'ISSUER_ROLE', color: 'bg-blue-100 text-blue-700' }}>
            <form onSubmit={handleMint} className="space-y-3">
              <Field label="Recipient" hint="(leave empty = your wallet)">
                <Input value={mintTo} onChange={e => setMintTo(e.target.value)}
                  placeholder={address} disabled={mintLoading} mono />
              </Field>
              <Field label="Amount" hint="(6 decimals)">
                <Input type="number" value={mintAmt} onChange={e => setMintAmt(e.target.value)}
                  placeholder="1000000" min="0" disabled={mintLoading} required />
              </Field>
              <Btn type="submit" color="green" loading={mintLoading} disabled={!mintAmt}>
                ⬆ Mint
              </Btn>
            </form>
            <TxResult tx={mintTx} />
          </SectionCard>

          {/* BURN */}
          <SectionCard title="Burn Tokens" icon="⬇"
            badge={{ text: 'ISSUER_ROLE', color: 'bg-orange-100 text-orange-700' }}>
            <form onSubmit={handleBurn} className="space-y-3">
              <Field label="Amount to burn" hint={`(balance: ${formatTokenAmount(tokenInfo.balance)} ${tokenInfo.symbol})`}>
                <Input type="number" value={burnAmt} onChange={e => setBurnAmt(e.target.value)}
                  placeholder="10000" min="0" disabled={burnLoading} required />
                <button type="button" onClick={() => setBurnAmt(formatTokenAmount(tokenInfo.balance))}
                  className="text-xs text-blue-500 hover:underline mt-0.5">Burn all</button>
              </Field>
              <Btn type="submit" color="red" loading={burnLoading} disabled={!burnAmt}>
                ⬇ Burn
              </Btn>
            </form>
            <TxResult tx={burnTx} />
          </SectionCard>

          {/* PAUSE / UNPAUSE */}
          <SectionCard title="Pause / Unpause" icon="⏸"
            badge={tokenInfo.paused
              ? { text: 'PAUSED', color: 'bg-red-100 text-red-700' }
              : { text: 'ACTIVE', color: 'bg-green-100 text-green-700' }}>
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {tokenInfo.paused
                  ? 'Token transfers are currently paused. Unpause to resume all transfers.'
                  : 'Token transfers are active. Pause to halt all transfers immediately.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Btn color="amber" loading={pauseLoading} disabled={tokenInfo.paused} onClick={handlePause}>
                  ⏸ Pause
                </Btn>
                <Btn color="green" loading={pauseLoading} disabled={!tokenInfo.paused} onClick={handleUnpause}>
                  ▶ Unpause
                </Btn>
              </div>
              <p className="text-xs text-gray-400">Pause requires PAUSE_ROLE · Unpause requires UNPAUSE_ROLE</p>
            </div>
            <TxResult tx={pauseTx} />
          </SectionCard>

          {/* SUPPLY CAP */}
          <SectionCard title="Supply Cap" icon="🔒"
            badge={{ text: 'DEFAULT_ADMIN', color: 'bg-purple-100 text-purple-700' }}>
            <form onSubmit={handleSetCap} className="space-y-3">
              <p className="text-xs text-gray-500">
                Current cap: <strong>{tokenInfo.supplyCap > 0n ? formatTokenAmount(tokenInfo.supplyCap) : 'Unlimited'}</strong>
                {' '}· Current supply: <strong>{formatTokenAmount(tokenInfo.totalSupply)}</strong>
              </p>
              <Field label="New supply cap" hint="(must be ≥ current supply, 0 = unlimited)">
                <Input type="number" value={capAmt} onChange={e => setCapAmt(e.target.value)}
                  placeholder="e.g. 10000000" min="0" disabled={capLoading} required />
              </Field>
              <Btn type="submit" color="blue" loading={capLoading} disabled={!capAmt}>
                🔒 Set Supply Cap
              </Btn>
            </form>
            <TxResult tx={capTx} />
          </SectionCard>

          {/* ROLES */}
          <SectionCard title="Role Management" icon="🔑">
            <div className="space-y-3">
              <Field label="Role">
                <select value={roleKey} onChange={e => setRoleKey(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {Object.keys(ROLES).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Address" hint="(leave empty = your wallet)">
                <Input value={roleTarget} onChange={e => setRoleTarget(e.target.value)}
                  placeholder={address} mono />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Btn color="blue" loading={grantLoading} onClick={handleGrant}>
                  ✓ Grant Role
                </Btn>
                <Btn color="red" loading={revokeLoading} onClick={handleRevoke}>
                  ✗ Revoke Role
                </Btn>
              </div>
              <p className="text-xs text-gray-400">
                Requires DEFAULT_ADMIN_ROLE · Only the token admin can grant/revoke roles
              </p>
            </div>
            {grantTx && <TxResult tx={grantTx} />}
            {revokeTx && <TxResult tx={revokeTx} />}
          </SectionCard>

          {/* TRANSFER POLICY */}
          <SectionCard title="Transfer Policy" icon="📋"
            badge={{ text: 'DEFAULT_ADMIN', color: 'bg-purple-100 text-purple-700' }}>
            <form onSubmit={handlePolicy} className="space-y-3">
              <div className="text-xs text-gray-600 space-y-1 p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">Built-in policy IDs:</p>
                <p>ID <strong>0</strong> — Always reject (freeze all transfers)</p>
                <p>ID <strong>1</strong> — Always allow (default, no restrictions)</p>
                <p>ID <strong>≥2</strong> — Custom policy from TIP-403 Registry</p>
                <p className="text-gray-400 mt-1">Current: Policy #{tokenInfo.transferPolicyId.toString()}</p>
              </div>
              <Field label="New Policy ID">
                <Input type="number" value={policyId} onChange={e => setPolicyId(e.target.value)}
                  placeholder="0 = freeze, 1 = allow, ≥2 = custom" min="0" disabled={policyLoading} required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Btn type="button" color="red" loading={policyLoading} onClick={() => { setPolicyId('0'); }}
                  disabled={policyLoading} wide>
                  🔴 Freeze (ID 0)
                </Btn>
                <Btn type="button" color="green" loading={policyLoading}
                  onClick={() => { setPolicyId('1'); }}
                  disabled={policyLoading} wide>
                  🟢 Allow (ID 1)
                </Btn>
              </div>
              <Btn type="submit" color="blue" loading={policyLoading} disabled={policyId === ''}>
                📋 Apply Policy
              </Btn>
            </form>
            <TxResult tx={policyTx} />
          </SectionCard>

        </div>
      )}
    </div>
  )
}