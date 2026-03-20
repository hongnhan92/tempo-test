import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { TOKEN_ABI, DEX_ABI } from '../../contracts/abis'
import { CONTRACTS, EXPLORER_URL } from '../../config'
import { parseTokenAmount, formatTokenAmount, parseTxError } from '../../utils/helpers'

const DEX         = CONTRACTS.dex
const MAX_UINT128 = 2n ** 128n - 1n
const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0, 2.0]

function applySlippage(amount, pct) {
  return (amount * BigInt(Math.floor((1 - pct / 100) * 10_000))) / 10_000n
}

function Spinner({ color = 'blue' }) {
  return <span className={`inline-block w-4 h-4 border-2 border-${color}-500 border-t-transparent rounded-full animate-spin`} />
}

// ── Token Input Box ───────────────────────────────────────────────────────────
function TokenBox({ label, token, amount, onChange, balance, readonly, onMax, onPick }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {balance !== undefined && token && (
          <button type="button" onClick={onMax}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium">
            Balance: {formatTokenAmount(balance)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input type="number" value={amount}
          onChange={e => onChange?.(e.target.value)}
          placeholder="0.00" readOnly={readonly} min="0"
          className="flex-1 text-2xl font-bold bg-transparent outline-none text-gray-900 placeholder-gray-300" />
        <button onClick={onPick}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors
            ${token ? 'bg-white border border-gray-200 text-gray-800 hover:border-blue-400'
                    : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {token
            ? <><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{token.symbol[0]}</span>{token.symbol} ▾</>
            : 'Select token ▾'}
        </button>
      </div>
      {token && <p className="text-xs text-gray-400">{token.name}</p>}
    </div>
  )
}

// ── Token Picker Modal ────────────────────────────────────────────────────────
const KNOWN_TOKENS = [
  { address: CONTRACTS.alphaUSD,  symbol: 'alphaUSD',  name: 'Alpha USD'  },
  { address: CONTRACTS.betaUSD,   symbol: 'betaUSD',   name: 'Beta USD'   },
  { address: CONTRACTS.thetaUSD,  symbol: 'thetaUSD',  name: 'Theta USD'  },
  { address: CONTRACTS.quoteToken,symbol: 'pathUSD',   name: 'Path USD'   },
]

function TokenPicker({ onSelect, onClose, publicClient, walletAddress }) {
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)
  const [found,   setFound]   = useState(null)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    if (!query.startsWith('0x') || query.length !== 42) { setFound(null); setErr(null); return }
    setLoading(true); setErr(null); setFound(null)
    Promise.all([
      publicClient.readContract({ address: query, abi: TOKEN_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: query, abi: TOKEN_ABI, functionName: 'name'   }),
      publicClient.readContract({ address: query, abi: TOKEN_ABI, functionName: 'quoteToken' }).catch(() => null),
      publicClient.readContract({ address: query, abi: TOKEN_ABI, functionName: 'balanceOf', args: [walletAddress] }).catch(() => 0n),
    ]).then(([symbol, name, quoteToken, balance]) => {
      setFound({ address: query, symbol, name, quoteToken, balance })
    }).catch(() => setErr('Token not found')).finally(() => setLoading(false))
  }, [query])

  const filtered = KNOWN_TOKENS.filter(t =>
    !query || t.symbol.toLowerCase().includes(query.toLowerCase()) || t.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Select Token</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search or paste address 0x…"
            className="w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />

          {!found && filtered.map(t => (
            <button key={t.address} onClick={() => onSelect(t)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left">
              <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {t.symbol[0]}
              </span>
              <div>
                <p className="font-semibold text-sm">{t.symbol}</p>
                <p className="text-xs text-gray-400">{t.name}</p>
              </div>
            </button>
          ))}

          {loading && <div className="flex justify-center py-4"><Spinner /></div>}
          {err     && <p className="text-xs text-red-600">{err}</p>}
          {found   && (
            <button onClick={() => onSelect(found)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-blue-400 bg-blue-50 hover:bg-blue-100 transition-colors text-left">
              <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                {found.symbol[0]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{found.symbol}</p>
                <p className="text-xs text-gray-400">{found.name}</p>
                <p className="text-xs text-gray-300 font-mono">{found.address.slice(0,22)}…</p>
              </div>
              <span className="text-xs text-blue-600 font-medium flex-shrink-0">Select →</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SwapWidget() {
  const { address }            = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient           = usePublicClient()

  const [tokenIn,  setTokenIn]  = useState(null)
  const [tokenOut, setTokenOut] = useState(null)
  const [picker,   setPicker]   = useState(null)   // 'in' | 'out'

  const [amountIn,  setAmountIn]  = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [quoting,   setQuoting]   = useState(false)
  const [quoteErr,  setQuoteErr]  = useState(null)
  const [quotedOut, setQuotedOut] = useState(null)

  const [slippage,     setSlippage]     = useState(0.5)
  const [customSlip,   setCustomSlip]   = useState('')
  const [showSlippage, setShowSlippage] = useState(false)

  const [swapping, setSwapping] = useState(false)
  const [swapStep, setSwapStep] = useState(null)
  const [swapTx,   setSwapTx]   = useState(null)

  const quoteTimer = useRef(null)

  async function fetchToken(addr) {
    const [symbol, name, quoteToken] = await Promise.all([
      publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'symbol' }),
      publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'name' }),
      publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'quoteToken' }).catch(() => null),
    ])
    const balance = await publicClient.readContract({
      address: addr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address]
    }).catch(() => 0n)
    return { address: addr, symbol, name, quoteToken, balance }
  }

  function handlePick(side, t) {
    setPicker(null)
    if (side === 'in') {
      if (tokenOut?.address === t.address) setTokenOut(tokenIn)
      setTokenIn(t)
    } else {
      if (tokenIn?.address === t.address) setTokenIn(tokenOut)
      setTokenOut(t)
    }
    setAmountIn(''); setAmountOut(''); setQuotedOut(null); setQuoteErr(null); setSwapTx(null)
  }

  function handleFlip() {
    const prevIn = tokenIn; const prevOut = tokenOut
    setTokenIn(prevOut); setTokenOut(prevIn)
    setAmountIn(''); setAmountOut(''); setQuotedOut(null); setQuoteErr(null); setSwapTx(null)
  }

  // Quote with debounce
  const doQuote = useCallback(async (val) => {
    if (!tokenIn || !tokenOut || !val || Number(val) <= 0) {
      setAmountOut(''); setQuotedOut(null); setQuoteErr(null); return
    }
    setQuoting(true); setQuoteErr(null)
    try {
      const out = await publicClient.readContract({
        address: DEX, abi: DEX_ABI, functionName: 'quoteSwapExactAmountIn',
        args: [tokenIn.address, tokenOut.address, parseTokenAmount(val)],
      })
      setQuotedOut(out)
      setAmountOut(formatTokenAmount(out))
    } catch (err) {
      setQuotedOut(null); setAmountOut('')
      const m = err?.message || ''
      if (m.includes('INSUFFICIENT_LIQUIDITY') || m.includes('insufficient'))
        setQuoteErr('Insufficient liquidity')
      else if (m.includes('PAIR_NOT_EXISTS') || m.includes('pair'))
        setQuoteErr('No trading pair for these tokens')
      else
        setQuoteErr('Cannot quote — try different tokens or amount')
    } finally { setQuoting(false) }
  }, [tokenIn, tokenOut, publicClient])

  useEffect(() => {
    clearTimeout(quoteTimer.current)
    quoteTimer.current = setTimeout(() => doQuote(amountIn), 450)
    return () => clearTimeout(quoteTimer.current)
  }, [amountIn, doQuote])

  async function handleSwap() {
    if (!walletClient || !tokenIn || !tokenOut || !quotedOut) return
    setSwapping(true); setSwapTx(null)
    try {
      const parsed = parseTokenAmount(amountIn)
      const minOut = applySlippage(quotedOut, customSlip ? parseFloat(customSlip) : slippage)

      // Approve if needed
      setSwapStep('approve')
      const allowance = await publicClient.readContract({
        address: tokenIn.address, abi: TOKEN_ABI, functionName: 'allowance', args: [address, DEX]
      })
      if (allowance < parsed) {
        const h = await walletClient.writeContract({
          address: tokenIn.address, abi: TOKEN_ABI, functionName: 'approve', args: [DEX, MAX_UINT128]
        })
        await publicClient.waitForTransactionReceipt({ hash: h, timeout: 60_000 })
      }

      // Swap
      setSwapStep('swap')
      const swapHash = await walletClient.writeContract({
        address: DEX, abi: DEX_ABI, functionName: 'swapExactAmountIn',
        args: [tokenIn.address, tokenOut.address, parsed, minOut],
      })
      await publicClient.waitForTransactionReceipt({ hash: swapHash, timeout: 60_000 })

      setSwapTx({ success: true, hash: swapHash,
        summary: `${amountIn} ${tokenIn.symbol} → ${formatTokenAmount(quotedOut)} ${tokenOut.symbol}` })

      // Refresh balances
      const [newIn, newOut] = await Promise.all([fetchToken(tokenIn.address), fetchToken(tokenOut.address)])
      setTokenIn(newIn); setTokenOut(newOut)
      setAmountIn(''); setAmountOut(''); setQuotedOut(null)

    } catch (err) {
      setSwapTx({ success: false, error: parseTxError(err) })
    } finally { setSwapping(false); setSwapStep(null) }
  }

  const effSlip    = customSlip ? parseFloat(customSlip) : slippage
  const parsedIn   = amountIn ? parseTokenAmount(amountIn) : 0n
  const notEnough  = tokenIn?.balance !== undefined && parsedIn > (tokenIn.balance ?? 0n)
  const canSwap    = !!(tokenIn && tokenOut && amountIn && quotedOut && !quoting && !quoteErr && !notEnough && !swapping)
  const rate       = (quotedOut && amountIn && Number(amountIn) > 0)
    ? (Number(formatTokenAmount(quotedOut)) / Number(amountIn)).toFixed(6) : null
  const priceImpact = (quotedOut && amountIn && Number(amountIn) > 0)
    ? Math.abs(1 - Number(formatTokenAmount(quotedOut)) / Number(amountIn)) * 100 : null

  return (
    <>
      {picker && (
        <TokenPicker
          onSelect={t => handlePick(picker, t)}
          onClose={() => setPicker(null)}
          publicClient={publicClient}
          walletAddress={address}
        />
      )}

      <div className="card max-w-md mx-auto space-y-3">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold">Swap</h2>
          <button onClick={() => setShowSlippage(s => !s)}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-colors flex items-center gap-1
              ${showSlippage ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            ⚙️ {effSlip}% slippage
          </button>
        </div>

        {/* Slippage panel */}
        {showSlippage && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
            <p className="text-xs font-semibold text-gray-600">Slippage Tolerance</p>
            <div className="flex gap-2 flex-wrap items-center">
              {SLIPPAGE_OPTIONS.map(s => (
                <button key={s} onClick={() => { setSlippage(s); setCustomSlip('') }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                    !customSlip && slippage === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-400'
                  }`}>
                  {s}%
                </button>
              ))}
              <input value={customSlip} onChange={e => setCustomSlip(e.target.value)}
                placeholder="Custom %" type="number" min="0" max="50"
                className="w-24 px-2.5 py-1.5 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            {effSlip > 2 && <p className="text-xs text-amber-600">⚠️ High slippage — risk of unfavorable execution</p>}
          </div>
        )}

        {/* Token In */}
        <TokenBox label="You pay" token={tokenIn} amount={amountIn}
          onChange={v => { setAmountIn(v); setSwapTx(null) }}
          balance={tokenIn?.balance}
          onMax={() => { setAmountIn(formatTokenAmount(tokenIn?.balance ?? 0n)); setSwapTx(null) }}
          onPick={() => setPicker('in')} />

        {/* Flip */}
        <div className="flex justify-center -my-1.5 relative z-10">
          <button onClick={handleFlip}
            className="w-10 h-10 rounded-2xl bg-white border-2 border-gray-200 hover:border-blue-400
              flex items-center justify-center text-gray-500 hover:text-blue-600
              shadow-sm hover:shadow transition-all active:scale-95 text-lg">
            ↕
          </button>
        </div>

        {/* Token Out */}
        <div className="relative">
          <TokenBox label="You receive" token={tokenOut}
            amount={quoting ? '…' : amountOut}
            readonly onPick={() => setPicker('out')} />
          {quoting && (
            <div className="absolute bottom-4 left-4 flex items-center gap-1.5 text-xs text-gray-400">
              <Spinner color="gray" /> Fetching quote…
            </div>
          )}
        </div>

        {/* Quote error */}
        {quoteErr && (
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            ⚠️ {quoteErr}
          </div>
        )}

        {/* Details */}
        {quotedOut && rate && !quoteErr && (
          <div className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-600 space-y-1.5">
            <div className="flex justify-between">
              <span>Rate</span>
              <span className="font-medium text-gray-900">1 {tokenIn?.symbol} ≈ {rate} {tokenOut?.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span>Min received ({effSlip}% slippage)</span>
              <span className="font-medium text-gray-900">
                {formatTokenAmount(applySlippage(quotedOut, effSlip))} {tokenOut?.symbol}
              </span>
            </div>
            {priceImpact !== null && (
              <div className="flex justify-between">
                <span>Price impact</span>
                <span className={`font-semibold ${
                  priceImpact > 2 ? 'text-red-600' : priceImpact > 0.5 ? 'text-amber-600' : 'text-green-600'
                }`}>
                  ~{priceImpact.toFixed(3)}%
                  {priceImpact > 2 && ' ⚠️'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Swap in progress */}
        {swapping && (
          <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700
            flex items-center gap-2">
            <Spinner />
            {swapStep === 'approve' ? `Approving ${tokenIn?.symbol}…` : 'Executing swap…'}
          </div>
        )}

        {/* Result */}
        {swapTx && (
          <div className={`p-3 rounded-xl text-xs space-y-1 ${
            swapTx.success
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {swapTx.success ? (
              <>
                <p className="font-semibold">✅ Swap successful!</p>
                <p>{swapTx.summary}</p>
                <a href={`${EXPLORER_URL}/tx/${swapTx.hash}`} target="_blank" rel="noopener noreferrer"
                  className="underline font-mono block">{swapTx.hash.slice(0,20)}…</a>
              </>
            ) : <p>❌ {swapTx.error}</p>}
          </div>
        )}

        {/* Insufficient */}
        {notEnough && <p className="text-xs text-red-600 text-center">Insufficient {tokenIn?.symbol} balance</p>}

        {/* Swap button */}
        <button onClick={handleSwap} disabled={!canSwap}
          className={`w-full py-4 rounded-2xl text-sm font-bold transition-all
            ${canSwap
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg active:scale-[0.99]'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
          {swapping ? <span className="flex items-center justify-center gap-2">
            <Spinner color="white" />{swapStep === 'approve' ? 'Approving…' : 'Swapping…'}
          </span>
          : !tokenIn || !tokenOut ? 'Select tokens'
          : !amountIn ? 'Enter amount'
          : quoting ? 'Fetching quote…'
          : quoteErr ? 'No liquidity'
          : notEnough ? `Insufficient ${tokenIn.symbol}`
          : 'Swap'}
        </button>

        <p className="text-xs text-center text-gray-400">
          Tempo Stablecoin DEX ·{' '}
          <a href={EXPLORER_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">Explorer ↗</a>
        </p>
      </div>
    </>
  )
}