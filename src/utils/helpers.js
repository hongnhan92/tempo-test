import { formatUnits, parseUnits, keccak256, toHex } from 'viem'

// ── Token helpers ───────────────────────────────────────────────────────────

export function formatTokenAmount(amount, decimals = 6) {
  if (!amount) return '0'
  return formatUnits(amount, decimals)
}

export function parseTokenAmount(amount, decimals = 6) {
  if (!amount) return 0n
  return parseUnits(amount.toString(), decimals)
}

export function generateSalt(address) {
  const timestamp = Date.now()
  const random    = Math.floor(Math.random() * 1_000_000)
  // Mirror automation.js pattern (no walletIndex in single-wallet dApp context)
  return keccak256(toHex(`${address}-${timestamp}-${random}`))
}

export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return ''
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function getExplorerTxUrl(txHash, baseUrl = 'https://explore.moderato.tempo.xyz') {
  return `${baseUrl}/tx/${txHash}`
}

export function getExplorerTokenUrl(tokenAddress, baseUrl = 'https://explore.moderato.tempo.xyz') {
  return `${baseUrl}/token/${tokenAddress}`
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
}

// ── Role constants — must match token implementation (keccak256 of name) ────
// Same derivation as automation.js:  keccak256(toHex('ROLE_NAME'))

export const ROLES = {
  ISSUER_ROLE:     keccak256(toHex('ISSUER_ROLE')),
  BURNER_ROLE:     keccak256(toHex('BURNER_ROLE')),
  PAUSER_ROLE:     keccak256(toHex('PAUSER_ROLE')),
  COMPLIANCE_ROLE: keccak256(toHex('COMPLIANCE_ROLE')),
}