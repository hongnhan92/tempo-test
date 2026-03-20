import { formatUnits, parseUnits, keccak256, toHex } from 'viem'

export function formatTokenAmount(amount, decimals = 6) {
  if (amount === undefined || amount === null) return '0'
  return formatUnits(amount, decimals)
}

export function parseTokenAmount(amount, decimals = 6) {
  if (!amount) return 0n
  return parseUnits(amount.toString(), decimals)
}

export function generateSalt(address) {
  const timestamp = Date.now()
  const random    = Math.floor(Math.random() * 1_000_000)
  return keccak256(toHex(`${address}-${timestamp}-${random}`))
}

export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return ''
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function getExplorerTxUrl(txHash, base = 'https://explore.testnet.tempo.xyz') {
  return `${base}/tx/${txHash}`
}

export function getExplorerTokenUrl(addr, base = 'https://explore.testnet.tempo.xyz') {
  return `${base}/token/${addr}`
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
}

// ── Role constants ─────────────────────────────────────────────────────────
// From TIP-20 spec: keccak256("ROLE_NAME") — matches automation.js

export const ROLES = {
  // DEFAULT_ADMIN_ROLE is bytes32(0) in OpenZeppelin AccessControl
  DEFAULT_ADMIN_ROLE: '0x0000000000000000000000000000000000000000000000000000000000000000',
  ISSUER_ROLE:        keccak256(toHex('ISSUER_ROLE')),
  PAUSE_ROLE:         keccak256(toHex('PAUSE_ROLE')),
  UNPAUSE_ROLE:       keccak256(toHex('UNPAUSE_ROLE')),
  BURN_BLOCKED_ROLE:  keccak256(toHex('BURN_BLOCKED_ROLE')),
}

export const ROLE_LABELS = {
  [ROLES.DEFAULT_ADMIN_ROLE]: 'DEFAULT_ADMIN',
  [ROLES.ISSUER_ROLE]:        'ISSUER',
  [ROLES.PAUSE_ROLE]:         'PAUSE',
  [ROLES.UNPAUSE_ROLE]:       'UNPAUSE',
  [ROLES.BURN_BLOCKED_ROLE]:  'BURN_BLOCKED',
}

// Human-friendly error parser for TIP-20 errors
export function parseTxError(err) {
  const msg = err?.message || 'Unknown error'
  if (msg.includes('user rejected') || msg.includes('User denied')) return 'Transaction rejected'
  if (msg.includes('Unauthorized') || msg.includes('missing role') || msg.includes('AccessControl'))
    return 'Missing required role for this action'
  if (msg.includes('insufficient funds')) return 'Not enough USD for gas — get funds at faucet.tempo.xyz'
  if (msg.includes('burn amount exceeds') || msg.includes('InsufficientBalance')) return 'Amount exceeds balance'
  if (msg.includes('ContractPaused')) return 'Token is currently paused'
  if (msg.includes('SupplyCapExceeded')) return 'Mint would exceed supply cap'
  if (msg.includes('InvalidSupplyCap')) return 'Supply cap cannot be lower than current supply'
  if (msg.includes('PolicyForbids')) return 'Transfer policy forbids this operation'
  if (msg.includes('InvalidTransferPolicyId')) return 'Invalid transfer policy ID'
  return msg.slice(0, 120)
}