import { formatUnits, parseUnits, keccak256, toHex } from 'viem'

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
  const random = Math.floor(Math.random() * 1000000)
  const data = address + '-' + timestamp + '-' + random
  return keccak256(toHex(data))
}

export function truncateAddress(address, start = 6, end = 4) {
  if (!address) return ''
  return address.slice(0, start) + '...' + address.slice(-end)
}

export function getExplorerTxUrl(txHash) {
  return 'https://explore.tempo.xyz/tx/' + txHash
}

export function getExplorerTokenUrl(tokenAddress) {
  return 'https://explore.tempo.xyz/token/' + tokenAddress
}

export function copyToClipboard(text) {
  return navigator.clipboard.writeText(text)
}