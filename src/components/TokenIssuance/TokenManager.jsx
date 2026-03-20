import React, { useState, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { TOKEN_ABI } from '../../contracts/abis'
import { EXPLORER_URL } from '../../config'
import { parseTokenAmount, formatTokenAmount } from '../../utils/helpers'

// ── Sub-components ──────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  )
}

function TxResult({ tx, explorerUrl }) {
  if (!tx) return null
  return (
    <div className={`mt-2 p-2.5 rounded-lg text-xs ${
      tx.success
        ? 'bg-green-50 border border-green-200 text-green-800'
        : 'bg-red-50 border border-red-200 text-red-700'
    }`}>
      {tx.success ? (
        <span>
          ✅ Done —{' '}
          <a
            href={`${explorerUrl}/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-mono"
          >
            {tx.hash.slice(0, 14)}…
          </a>
        </span>
      ) : (
        <span>❌ {tx.error}</span>
      )}
    </div>
  )
}

function StatBadge({ label, value, sub }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-gray-900 break-all">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TokenManager({ tokenAddress: initialAddress }) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  // ── State ─────────────────────────────────────────────────────────────────
  const [tokenAddress, setTokenAddress] = useState(initialAddress || '')
  const [tokenInfo, setTokenInfo]       = useState(null)   // { name, symbol, totalSupply, balance }
  const [loadingInfo, setLoadingInfo]   = useState(false)
  const [infoError, setInfoError]       = useState(null)

  const [mintTo,      setMintTo]      = useState(address || '')
  const [mintAmount,  setMintAmount]  = useState('')
  const [mintLoading, setMintLoading] = useState(false)
  const [mintTx,      setMintTx]      = useState(null)

  const [burnAmount,  setBurnAmount]  = useState('')
  const [burnLoading, setBurnLoading] = useState(false)
  const [burnTx,      setBurnTx]      = useState(null)

  // ── Load token info ───────────────────────────────────────────────────────

  const loadTokenInfo = useCallback(async (addr) => {
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
      setInfoError('Invalid token address')
      return
    }
    setLoadingInfo(true)
    setInfoError(null)
    setTokenInfo(null)
    setMintTx(null)
    setBurnTx(null)

    try {
      const [name, symbol, totalSupply, balance] = await Promise.all([
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'name' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'totalSupply' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }),
      ])
      setTokenInfo({ name, symbol, totalSupply, balance })
    } catch (err) {
      setInfoError('Cannot read token — check address or network')
      console.error(err)
    } finally {
      setLoadingInfo(false)
    }
  }, [publicClient, address])

  async function refreshInfo() {
    if (tokenAddress) await loadTokenInfo(tokenAddress)
  }

  // ── Mint ──────────────────────────────────────────────────────────────────

  async function handleMint(e) {
    e.preventDefault()
    if (!walletClient || !mintAmount || !mintTo) return
    setMintLoading(true)
    setMintTx(null)
    try {
      const amount = parseTokenAmount(mintAmount)
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'mint',
        args: [mintTo, amount],
      })
      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
      setMintTx({ success: true, hash })
      setMintAmount('')
      await refreshInfo()
    } catch (err) {
      let msg = err?.message || 'Unknown error'
      if (msg.includes('user rejected')) msg = 'Transaction rejected'
      else if (msg.includes('missing role') || msg.includes('AccessControl')) msg = 'Missing ISSUER_ROLE — grant roles first'
      setMintTx({ success: false, error: msg })
    } finally {
      setMintLoading(false)
    }
  }

  // ── Burn ──────────────────────────────────────────────────────────────────

  async function handleBurn(e) {
    e.preventDefault()
    if (!walletClient || !burnAmount) return
    setBurnLoading(false)
    setBurnTx(null)
    setBurnLoading(true)
    try {
      const amount = parseTokenAmount(burnAmount)
      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'burn',
        args: [amount],
      })
      await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
      setBurnTx({ success: true, hash })
      setBurnAmount('')
      await refreshInfo()
    } catch (err) {
      let msg = err?.message || 'Unknown error'
      if (msg.includes('user rejected'))  msg = 'Transaction rejected'
      else if (msg.includes('burn amount exceeds balance')) msg = 'Burn amount exceeds your balance'
      else if (msg.includes('missing role') || msg.includes('AccessControl')) msg = 'Missing BURNER_ROLE — grant roles first'
      setBurnTx({ success: false, error: msg })
    } finally {
      setBurnLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isReady = !!tokenInfo

  return (
    <div className="card">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Token Manager</h2>
        {isReady && (
          <button
            onClick={refreshInfo}
            disabled={loadingInfo}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
          >
            {loadingInfo ? <Spinner /> : '↻'} Refresh
          </button>
        )}
      </div>

      {/* ── Token address input ── */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">Token Address</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tokenAddress}
            onChange={e => {
              setTokenAddress(e.target.value)
              setTokenInfo(null)
              setInfoError(null)
            }}
            placeholder="0x…"
            className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button
            onClick={() => loadTokenInfo(tokenAddress)}
            disabled={loadingInfo || !tokenAddress}
            className="btn btn-primary px-4 disabled:opacity-50"
          >
            {loadingInfo ? <Spinner /> : 'Load'}
          </button>
        </div>
        {infoError && (
          <p className="text-xs text-red-600 mt-1">{infoError}</p>
        )}
      </div>

      {/* ── Token stats ── */}
      {isReady && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatBadge
              label="Token"
              value={tokenInfo.symbol}
              sub={tokenInfo.name}
            />
            <StatBadge
              label="Total Supply"
              value={formatTokenAmount(tokenInfo.totalSupply)}
              sub="(6 decimals)"
            />
            <StatBadge
              label="Your Balance"
              value={formatTokenAmount(tokenInfo.balance)}
              sub={tokenInfo.symbol}
            />
            <StatBadge
              label="Explorer"
              value={
                <a
                  href={`${EXPLORER_URL}/token/${tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-xs font-mono"
                >
                  {tokenAddress.slice(0, 10)}…
                </a>
              }
            />
          </div>

          <hr className="border-gray-100 mb-5" />

          {/* ── Mint ── */}
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <span className="text-green-500">⬆</span> Mint Tokens
              <span className="text-xs font-normal text-gray-400">(requires ISSUER_ROLE)</span>
            </h3>
            <form onSubmit={handleMint} className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recipient Address</label>
                <input
                  type="text"
                  value={mintTo}
                  onChange={e => setMintTo(e.target.value)}
                  placeholder="0x…  (default: your wallet)"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-300"
                  disabled={mintLoading}
                />
                <button
                  type="button"
                  onClick={() => setMintTo(address)}
                  className="text-xs text-blue-500 hover:underline mt-0.5"
                >
                  Use my wallet
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount (6 decimals)</label>
                <input
                  type="number"
                  value={mintAmount}
                  onChange={e => setMintAmount(e.target.value)}
                  placeholder="e.g. 1000000"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                  min="0"
                  disabled={mintLoading}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={mintLoading || !mintAmount}
                className="w-full py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {mintLoading ? <><Spinner /> Minting…</> : '⬆ Mint'}
              </button>
            </form>
            <TxResult tx={mintTx} explorerUrl={EXPLORER_URL} />
          </div>

          <hr className="border-gray-100 mb-5" />

          {/* ── Burn ── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <span className="text-red-400">⬇</span> Burn Tokens
              <span className="text-xs font-normal text-gray-400">(requires BURNER_ROLE)</span>
            </h3>
            <form onSubmit={handleBurn} className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Amount to burn
                  <span className="text-gray-400 font-normal ml-1">
                    (your balance: {formatTokenAmount(tokenInfo.balance)} {tokenInfo.symbol})
                  </span>
                </label>
                <input
                  type="number"
                  value={burnAmount}
                  onChange={e => setBurnAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  min="0"
                  max={formatTokenAmount(tokenInfo.balance)}
                  disabled={burnLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setBurnAmount(formatTokenAmount(tokenInfo.balance))}
                  className="text-xs text-blue-500 hover:underline mt-0.5"
                >
                  Burn all
                </button>
              </div>
              <button
                type="submit"
                disabled={burnLoading || !burnAmount}
                className="w-full py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600
                  disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {burnLoading ? <><Spinner /> Burning…</> : '⬇ Burn'}
              </button>
            </form>
            <TxResult tx={burnTx} explorerUrl={EXPLORER_URL} />
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {!isReady && !loadingInfo && !infoError && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Enter a token address and click <strong>Load</strong> to manage it
        </div>
      )}

    </div>
  )
}