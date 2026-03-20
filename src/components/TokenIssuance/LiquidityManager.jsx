import React, { useState, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { TOKEN_ABI, DEX_ABI } from '../../contracts/abis'
import { CONTRACTS, EXPLORER_URL } from '../../config'
import { parseTokenAmount, formatTokenAmount, parseTxError } from '../../utils/helpers'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEX = CONTRACTS.dex   // 0xdec0000000000000000000000000000000000000
const TICK_SPACING = 10
const MAX_UINT128  = 2n ** 128n - 1n

// tick = (price - 1) * 100_000  →  price = 1 + tick/100_000
function tickToPrice(tick) { return 1 + tick / 100_000 }
function priceToTick(price) {
  const raw = Math.round((price - 1) * 100_000)
  return Math.round(raw / TICK_SPACING) * TICK_SPACING   // snap to grid
}
function fmtPrice(tick) { return tickToPrice(tick).toFixed(5) }

// ── Primitives ────────────────────────────────────────────────────────────────
function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
}

function TxResult({ tx }) {
  if (!tx) return null
  return (
    <div className={`mt-2 p-2.5 rounded-lg text-xs ${
      tx.success ? 'bg-green-50 border border-green-200 text-green-800'
                 : 'bg-red-50 border border-red-200 text-red-700'}`}>
      {tx.success
        ? <span>✅ Done — <a href={`${EXPLORER_URL}/tx/${tx.hash}`} target="_blank"
            rel="noopener noreferrer" className="underline font-mono">{tx.hash.slice(0,14)}…</a></span>
        : <span>❌ {tx.error}</span>}
    </div>
  )
}

function StepRow({ label, desc, status, hash }) {
  const S = { pending: '○', running: null, done: '✓', error: '✗' }
  const C = {
    pending: 'text-gray-400',
    running: 'text-blue-700 font-semibold',
    done:    'text-green-700',
    error:   'text-red-600',
  }
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-4 flex-shrink-0 text-center text-xs mt-0.5">
        {status === 'running' ? <Spinner /> : <span className={C[status]}>{S[status]}</span>}
      </span>
      <div className="flex-1">
        <p className={`text-sm ${C[status]}`}>{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      {hash && (
        <a href={`${EXPLORER_URL}/tx/${hash}`} target="_blank" rel="noopener noreferrer"
          className="text-xs font-mono text-blue-500 hover:underline flex-shrink-0">
          {hash.slice(0,10)}…
        </a>
      )}
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
          <span>{icon}</span>
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.text}</span>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 bg-white border-t border-gray-100">{children}</div>}
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, baseSymbol, quoteSymbol, onCancel, cancelling }) {
  const side    = order.isBid ? 'BID (Buy)' : 'ASK (Sell)'
  const sideClr = order.isBid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sideClr}`}>{side}</span>
          {order.isFlip && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">🔄 Flip</span>
          )}
        </div>
        <span className="text-xs text-gray-400 font-mono">#{order.orderId.toString()}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-500">Amount</p>
          <p className="font-semibold">{formatTokenAmount(order.amount)} {order.isBid ? quoteSymbol : baseSymbol}</p>
        </div>
        <div>
          <p className="text-gray-500">Price</p>
          <p className="font-semibold">${fmtPrice(order.tick)} / {baseSymbol}</p>
        </div>
        {order.isFlip && (
          <div className="col-span-2">
            <p className="text-gray-500">Flip to</p>
            <p className="font-semibold">${fmtPrice(order.flipTick)} (opposite side)</p>
          </div>
        )}
      </div>
      <button onClick={() => onCancel(order.orderId)} disabled={cancelling}
        className="w-full py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-red-50
          hover:text-red-700 transition-colors disabled:opacity-50">
        {cancelling ? <span className="flex items-center justify-center gap-1"><Spinner /> Cancelling…</span> : '✕ Cancel Order'}
      </button>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LiquidityManager({ tokenAddress: initAddr }) {
  const { address }            = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient           = usePublicClient()

  // ── Token info ─────────────────────────────────────────────────────────────
  const [tokenAddr, setTokenAddr]   = useState(initAddr || '')
  const [tokenInfo, setTokenInfo]   = useState(null)  // { symbol, quoteToken, quoteSymbol }
  const [pairExists, setPairExists] = useState(null)  // null=unknown, true/false
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [infoError, setInfoError]   = useState(null)

  // ── DEX balances ───────────────────────────────────────────────────────────
  const [dexBalBase,  setDexBalBase]  = useState(0n)
  const [dexBalQuote, setDexBalQuote] = useState(0n)
  const [walletBalBase,  setWalletBalBase]  = useState(0n)
  const [walletBalQuote, setWalletBalQuote] = useState(0n)
  const [bookInfo, setBookInfo]       = useState(null)  // { bestBidTick, bestAskTick }

  // ── Active orders (tracked locally after placement) ────────────────────────
  const [orders, setOrders] = useState([])

  // ── Steps for progress panel ───────────────────────────────────────────────
  const [steps, setSteps]   = useState([])

  // ── Add liquidity form ─────────────────────────────────────────────────────
  const [form, setForm] = useState({
    baseAmount:  '',   // amount of base token for ASK side
    quoteAmount: '',   // amount of quote token for BID side
    bidTick:     -10,  // price to BUY base token at (below peg)
    askTick:     10,   // price to SELL base token at (above peg)
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addResult, setAddResult]   = useState(null)

  // ── Withdraw form ──────────────────────────────────────────────────────────
  const [withdrawToken, setWithdrawToken] = useState('base')
  const [withdrawAmt,   setWithdrawAmt]   = useState('')
  const [withdrawLoad,  setWithdrawLoad]  = useState(false)
  const [withdrawTx,    setWithdrawTx]    = useState(null)

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const [cancellingId, setCancellingId] = useState(null)
  const [cancelTx,     setCancelTx]     = useState(null)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setStep(id, status, hash = null) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, hash: hash || s.hash } : s))
  }

  async function waitTx(hash) {
    return publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  }

  async function ensureApproval(tokenAddress, spender, amount) {
    const allowance = await publicClient.readContract({
      address: tokenAddress, abi: TOKEN_ABI,
      functionName: 'allowance', args: [address, spender],
    })
    if (allowance >= amount) return null
    const hash = await walletClient.writeContract({
      address: tokenAddress, abi: TOKEN_ABI,
      functionName: 'approve', args: [spender, MAX_UINT128],
    })
    await waitTx(hash)
    return hash
  }

  // ── Load token & pair info ──────────────────────────────────────────────────
  const loadInfo = useCallback(async (addr) => {
    if (!addr || addr.length !== 42) return setInfoError('Invalid address')
    setLoadingInfo(true); setInfoError(null); setTokenInfo(null); setPairExists(null)
    setOrders([]); setAddResult(null)
    try {
      const [symbol, quoteTokenAddr] = await Promise.all([
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'symbol' }),
        publicClient.readContract({ address: addr, abi: TOKEN_ABI, functionName: 'quoteToken' }),
      ])
      const quoteSymbol = await publicClient.readContract({
        address: quoteTokenAddr, abi: TOKEN_ABI, functionName: 'symbol',
      }).catch(() => 'quoteToken')

      // Check pair exists
      const pairKey = await publicClient.readContract({
        address: DEX, abi: DEX_ABI, functionName: 'pairKey',
        args: [addr, quoteTokenAddr],
      })
      let book = null
      try {
        book = await publicClient.readContract({ address: DEX, abi: DEX_ABI, functionName: 'books', args: [pairKey] })
        setPairExists(true)
        setBookInfo({ bestBidTick: book[2], bestAskTick: book[3] })
      } catch {
        setPairExists(false)
        setBookInfo(null)
      }

      // DEX balances
      const [dexBase, dexQuote, walBase, walQuote] = await Promise.all([
        publicClient.readContract({ address: DEX, abi: DEX_ABI, functionName: 'balanceOf', args: [address, addr] }),
        publicClient.readContract({ address: DEX, abi: DEX_ABI, functionName: 'balanceOf', args: [address, quoteTokenAddr] }),
        publicClient.readContract({ address: addr,           abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }),
        publicClient.readContract({ address: quoteTokenAddr, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address] }),
      ])
      setDexBalBase(dexBase); setDexBalQuote(dexQuote)
      setWalletBalBase(walBase); setWalletBalQuote(walQuote)
      setTokenInfo({ symbol, quoteToken: quoteTokenAddr, quoteSymbol })
    } catch (err) {
      setInfoError('Cannot read token — check address or network')
      console.error(err)
    } finally {
      setLoadingInfo(false)
    }
  }, [publicClient, address])

  const refresh = useCallback(() => tokenAddr && loadInfo(tokenAddr), [tokenAddr, loadInfo])

  // ── Add Liquidity (2 flip orders) ──────────────────────────────────────────
  async function handleAddLiquidity(e) {
    e.preventDefault()
    if (!walletClient || !tokenInfo) return
    const { bidTick, askTick, baseAmount, quoteAmount } = form

    // Validate ticks
    if (bidTick >= askTick) return alert('Bid tick must be lower than Ask tick (spread must be positive)')
    if (bidTick % TICK_SPACING !== 0 || askTick % TICK_SPACING !== 0)
      return alert(`Ticks must be multiples of ${TICK_SPACING}`)
    if (!baseAmount || !quoteAmount) return alert('Enter amounts for both sides')

    const baseParsed  = parseTokenAmount(baseAmount)
    const quoteParsed = parseTokenAmount(quoteAmount)

    // Build steps
    const stepList = []
    if (!pairExists) stepList.push({ id: 'createPair', label: 'Create Trading Pair', desc: `${tokenInfo.symbol}/${tokenInfo.quoteSymbol}`, status: 'pending' })
    stepList.push(
      { id: 'approveBase',  label: `Approve ${tokenInfo.symbol}`,      desc: 'Allow DEX to use your tokens', status: 'pending' },
      { id: 'approveQuote', label: `Approve ${tokenInfo.quoteSymbol}`, desc: 'Allow DEX to use your tokens', status: 'pending' },
      { id: 'bidFlip',      label: `Place BID Flip Order`,             desc: `Buy ${tokenInfo.symbol} @ $${fmtPrice(bidTick)} → flip to $${fmtPrice(askTick)}`, status: 'pending' },
      { id: 'askFlip',      label: `Place ASK Flip Order`,             desc: `Sell ${tokenInfo.symbol} @ $${fmtPrice(askTick)} → flip to $${fmtPrice(bidTick)}`, status: 'pending' },
    )
    setSteps(stepList)
    setAddLoading(true)
    setAddResult(null)

    const newOrders = []
    try {
      // 1. Create pair if needed
      if (!pairExists) {
        setStep('createPair', 'running')
        const h = await walletClient.writeContract({
          address: DEX, abi: DEX_ABI, functionName: 'createPair', args: [tokenAddr],
        })
        await waitTx(h)
        setStep('createPair', 'done', h)
        setPairExists(true)
      }

      // 2. Approve base token
      setStep('approveBase', 'running')
      const approveBaseHash = await ensureApproval(tokenAddr, DEX, baseParsed)
      setStep('approveBase', 'done', approveBaseHash)

      // 3. Approve quote token
      setStep('approveQuote', 'running')
      const approveQuoteHash = await ensureApproval(tokenInfo.quoteToken, DEX, quoteParsed)
      setStep('approveQuote', 'done', approveQuoteHash)

      // 4. BID flip order: buy base token (pay with quoteToken)
      //    isBid=true → amount is in quoteToken (how much quote to spend)
      setStep('bidFlip', 'running')
      const bidHash = await walletClient.writeContract({
        address: DEX, abi: DEX_ABI, functionName: 'placeFlip',
        args: [tokenAddr, quoteParsed, true, bidTick, askTick],
      })
      const bidReceipt = await waitTx(bidHash)
      setStep('bidFlip', 'done', bidHash)

      // Parse orderId from logs
      const bidOrderId = parsePlacedOrderId(bidReceipt) ?? 0n
      newOrders.push({ orderId: bidOrderId, isBid: true, isFlip: true, amount: quoteParsed, tick: bidTick, flipTick: askTick })

      // 5. ASK flip order: sell base token (receive quoteToken)
      //    isBid=false → amount is in base token (how much base to sell)
      setStep('askFlip', 'running')
      const askHash = await walletClient.writeContract({
        address: DEX, abi: DEX_ABI, functionName: 'placeFlip',
        args: [tokenAddr, baseParsed, false, askTick, bidTick],
      })
      const askReceipt = await waitTx(askHash)
      setStep('askFlip', 'done', askHash)

      const askOrderId = parsePlacedOrderId(askReceipt) ?? 0n
      newOrders.push({ orderId: askOrderId, isBid: false, isFlip: true, amount: baseParsed, tick: askTick, flipTick: bidTick })

      setOrders(prev => [...prev, ...newOrders])
      setAddResult({ success: true, bidHash, askHash })
      setForm(f => ({ ...f, baseAmount: '', quoteAmount: '' }))
      await refresh()

    } catch (err) {
      console.error(err)
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s))
      setAddResult({ success: false, error: parseTxError(err) })
    } finally {
      setAddLoading(false)
    }
  }

  function parsePlacedOrderId(receipt) {
    // OrderPlaced event: topics[1] = orderId (indexed uint128)
    for (const log of receipt.logs) {
      if (log.address?.toLowerCase() !== DEX.toLowerCase()) continue
      // keccak256("OrderPlaced(uint128,address,address,uint128,bool,int16,bool,int16)")
      if (log.topics?.length >= 2) {
        try { return BigInt(log.topics[1]) } catch {}
      }
    }
    return null
  }

  // ── Cancel order ───────────────────────────────────────────────────────────
  async function handleCancel(orderId) {
    setCancellingId(orderId)
    setCancelTx(null)
    try {
      const hash = await walletClient.writeContract({
        address: DEX, abi: DEX_ABI, functionName: 'cancel', args: [orderId],
      })
      await waitTx(hash)
      setCancelTx({ success: true, hash })
      setOrders(prev => prev.filter(o => o.orderId !== orderId))
      await refresh()
    } catch (err) {
      setCancelTx({ success: false, error: parseTxError(err) })
    } finally {
      setCancellingId(null)
    }
  }

  // ── Withdraw from DEX ──────────────────────────────────────────────────────
  async function handleWithdraw(e) {
    e.preventDefault()
    if (!withdrawAmt || !tokenInfo) return
    setWithdrawLoad(true); setWithdrawTx(null)
    try {
      const isBase  = withdrawToken === 'base'
      const tAddr   = isBase ? tokenAddr : tokenInfo.quoteToken
      const amount  = parseTokenAmount(withdrawAmt)
      const hash    = await walletClient.writeContract({
        address: DEX, abi: DEX_ABI, functionName: 'withdraw', args: [tAddr, amount],
      })
      await waitTx(hash)
      setWithdrawTx({ success: true, hash })
      setWithdrawAmt('')
      await refresh()
    } catch (err) {
      setWithdrawTx({ success: false, error: parseTxError(err) })
    } finally {
      setWithdrawLoad(false)
    }
  }

  const isReady = !!tokenInfo
  const flipTick = form.askTick
  const flippedBidTick = form.bidTick

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="card space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Liquidity Manager</h2>
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
          <input value={tokenAddr} onChange={e => { setTokenAddr(e.target.value); setTokenInfo(null) }}
            placeholder="0x…"
            className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <button onClick={() => loadInfo(tokenAddr)} disabled={loadingInfo || !tokenAddr}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700
              disabled:opacity-50 flex items-center gap-1">
            {loadingInfo ? <Spinner /> : 'Load'}
          </button>
        </div>
        {infoError && <p className="text-xs text-red-600 mt-1">{infoError}</p>}
      </div>

      {/* Token + Pair info */}
      {isReady && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">

          {/* Pair status */}
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">
              {tokenInfo.symbol} / {tokenInfo.quoteSymbol}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              pairExists ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {pairExists ? '● Pair exists' : '○ Pair not created yet'}
            </span>
          </div>

          {/* Best ticks */}
          {bookInfo && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-gray-500">Best BID</p>
                <p className="font-bold text-green-700">
                  {bookInfo.bestBidTick < -1900 ? 'No orders' : `$${fmtPrice(bookInfo.bestBidTick)}`}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-2 text-center">
                <p className="text-gray-500">Best ASK</p>
                <p className="font-bold text-red-600">
                  {bookInfo.bestAskTick > 1900 ? 'No orders' : `$${fmtPrice(bookInfo.bestAskTick)}`}
                </p>
              </div>
            </div>
          )}

          {/* Balances */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: `Wallet ${tokenInfo.symbol}`,      val: walletBalBase  },
              { label: `Wallet ${tokenInfo.quoteSymbol}`, val: walletBalQuote },
              { label: `DEX ${tokenInfo.symbol}`,         val: dexBalBase,  badge: true },
              { label: `DEX ${tokenInfo.quoteSymbol}`,    val: dexBalQuote, badge: true },
            ].map(({ label, val, badge }) => (
              <div key={label} className={`rounded-lg p-2 ${badge ? 'bg-blue-50' : 'bg-white border border-gray-200'}`}>
                <p className="text-gray-500">{label}</p>
                <p className="font-bold text-gray-800">{formatTokenAmount(val)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isReady && !loadingInfo && !infoError && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Enter a token address above and click <strong>Load</strong>
        </div>
      )}

      {isReady && (
        <div className="space-y-2">

          {/* ── ADD LIQUIDITY ─────────────────────────────────────────────── */}
          <SectionCard title="Add Liquidity" icon="💧" defaultOpen
            badge={{ text: '2 Flip Orders', color: 'bg-blue-100 text-blue-700' }}>

            {/* Educational note */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1.5">
              <p className="font-semibold">How Flip Orders work as a liquidity pool:</p>
              <p>• <strong>BID order</strong> — uses your <strong>{tokenInfo.quoteSymbol}</strong> to buy {tokenInfo.symbol} at bid price</p>
              <p>• <strong>ASK order</strong> — uses your <strong>{tokenInfo.symbol}</strong> to sell at ask price</p>
              <p>• When either order fills → automatically flips to opposite side</p>
              <p>• You earn the <strong>spread</strong> (ask - bid) every time an order flips</p>
              <p className="text-amber-700 mt-1">⚠️ <strong>Inventory risk:</strong> One-sided demand may accumulate one token. Flip silently stops if DEX balance runs out.</p>
            </div>

            <form onSubmit={handleAddLiquidity} className="space-y-4">

              {/* Tick / Price config */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-gray-600">Price Range Configuration</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      BID Tick <span className="text-gray-400">(buy price)</span>
                    </label>
                    <input type="number" value={form.bidTick}
                      onChange={e => setForm(f => ({ ...f, bidTick: Number(e.target.value) }))}
                      step={TICK_SPACING} min={-2000} max={-TICK_SPACING}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                      disabled={addLoading} />
                    <p className="text-xs text-green-600 mt-0.5">= ${fmtPrice(form.bidTick)}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      ASK Tick <span className="text-gray-400">(sell price)</span>
                    </label>
                    <input type="number" value={form.askTick}
                      onChange={e => setForm(f => ({ ...f, askTick: Number(e.target.value) }))}
                      step={TICK_SPACING} min={TICK_SPACING} max={2000}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                      disabled={addLoading} />
                    <p className="text-xs text-red-500 mt-0.5">= ${fmtPrice(form.askTick)}</p>
                  </div>
                </div>

                {/* Spread preview */}
                <div className="text-center py-2 bg-white rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500">Spread (your earnings per flip)</p>
                  <p className="text-sm font-bold text-blue-700">
                    ${(fmtPrice(form.askTick) - fmtPrice(form.bidTick)).toFixed(5)} per token
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtPrice(form.bidTick)} → {fmtPrice(form.askTick)}
                  </p>
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {tokenInfo.quoteSymbol} amount <span className="text-gray-400">(for BID)</span>
                  </label>
                  <input type="number" value={form.quoteAmount}
                    onChange={e => setForm(f => ({ ...f, quoteAmount: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                    min="0" disabled={addLoading} required />
                  <p className="text-xs text-gray-400 mt-0.5">
                    Wallet: {formatTokenAmount(walletBalQuote)} {tokenInfo.quoteSymbol}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {tokenInfo.symbol} amount <span className="text-gray-400">(for ASK)</span>
                  </label>
                  <input type="number" value={form.baseAmount}
                    onChange={e => setForm(f => ({ ...f, baseAmount: e.target.value }))}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    min="0" disabled={addLoading} required />
                  <p className="text-xs text-gray-400 mt-0.5">
                    Wallet: {formatTokenAmount(walletBalBase)} {tokenInfo.symbol}
                  </p>
                </div>
              </div>

              {/* TX count */}
              <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                {!pairExists ? '5' : '4'} transactions:
                {!pairExists && <span className="ml-1">① Create pair</span>}
                <span className="ml-1">{!pairExists ? '②③' : '①②'} Approve tokens</span>
                <span className="ml-1">{!pairExists ? '④⑤' : '③④'} Place BID + ASK flip orders</span>
              </div>

              <button type="submit" disabled={addLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700
                  text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {addLoading ? '⏳ Processing…' : '💧 Add Liquidity'}
              </button>
            </form>

            {/* Step progress */}
            {steps.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</p>
                  {addLoading && <Spinner />}
                </div>
                <div className="divide-y divide-gray-100">
                  {steps.map(s => <StepRow key={s.id} label={s.label} desc={s.desc} status={s.status} hash={s.hash} />)}
                </div>
              </div>
            )}

            {addResult && (
              <div className={`mt-3 p-3 rounded-xl text-xs ${
                addResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {addResult.success
                  ? '✅ Liquidity added! Both BID and ASK flip orders are active in the orderbook.'
                  : `❌ ${addResult.error}`}
              </div>
            )}
          </SectionCard>

          {/* ── ACTIVE ORDERS ──────────────────────────────────────────────── */}
          <SectionCard title="Active Orders" icon="📋"
            badge={orders.length > 0 ? { text: `${orders.length} orders`, color: 'bg-blue-100 text-blue-700' } : undefined}>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No active orders tracked this session.<br />
                <span className="text-xs">Orders placed in previous sessions are not shown here.</span>
              </p>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <OrderCard key={order.orderId.toString()}
                    order={order}
                    baseSymbol={tokenInfo.symbol}
                    quoteSymbol={tokenInfo.quoteSymbol}
                    onCancel={handleCancel}
                    cancelling={cancellingId === order.orderId} />
                ))}
                {cancelTx && <TxResult tx={cancelTx} />}
              </div>
            )}
          </SectionCard>

          {/* ── WITHDRAW DEX BALANCE ────────────────────────────────────────── */}
          <SectionCard title="Withdraw DEX Balance" icon="⬆️"
            badge={{ text: 'After fills', color: 'bg-purple-100 text-purple-700' }}>
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                When your orders are filled, proceeds stay in your DEX internal balance.
                Withdraw them back to your wallet here.
              </p>
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-xl text-xs">
                <div className="text-center">
                  <p className="text-gray-500">DEX {tokenInfo.symbol}</p>
                  <p className="font-bold text-gray-800">{formatTokenAmount(dexBalBase)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">DEX {tokenInfo.quoteSymbol}</p>
                  <p className="font-bold text-gray-800">{formatTokenAmount(dexBalQuote)}</p>
                </div>
              </div>
              <form onSubmit={handleWithdraw} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setWithdrawToken('base')}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      withdrawToken === 'base' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    {tokenInfo.symbol}
                  </button>
                  <button type="button"
                    onClick={() => setWithdrawToken('quote')}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      withdrawToken === 'quote' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'
                    }`}>
                    {tokenInfo.quoteSymbol}
                  </button>
                </div>
                <input type="number" value={withdrawAmt}
                  onChange={e => setWithdrawAmt(e.target.value)}
                  placeholder="Amount to withdraw"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  min="0" disabled={withdrawLoad} required />
                <button
                  type="button"
                  onClick={() => setWithdrawAmt(
                    formatTokenAmount(withdrawToken === 'base' ? dexBalBase : dexBalQuote)
                  )}
                  className="text-xs text-blue-500 hover:underline">
                  Withdraw all
                </button>
                <button type="submit" disabled={withdrawLoad || !withdrawAmt}
                  className="w-full py-2 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700
                    text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {withdrawLoad
                    ? <span className="flex items-center justify-center gap-1"><Spinner /> Withdrawing…</span>
                    : `⬆️ Withdraw ${withdrawToken === 'base' ? tokenInfo.symbol : tokenInfo.quoteSymbol}`}
                </button>
              </form>
              <TxResult tx={withdrawTx} />
            </div>
          </SectionCard>

        </div>
      )}
    </div>
  )
}