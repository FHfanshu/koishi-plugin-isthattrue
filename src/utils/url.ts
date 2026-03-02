import { isIP } from 'node:net'

const PRIVATE_IPV4_REGEX = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/
const PRIVATE_HOST_SUFFIXES = ['.local', '.internal', '.localhost']

export function normalizeUrl(url: string): string {
  const trimmed = (url || '').trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    const normalized = parsed.toString()
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  } catch {
    return trimmed
  }
}

export function extractUrls(text: string): string[] {
  const matches = (text || '').match(/https?:\/\/[^\s\])"']+/g) || []
  return [...new Set(matches.map((url) => normalizeUrl(url)).filter(Boolean))]
}

export function removeCensorshipBypass(text: string): string {
  if (/^https?:\/\//.test(text.trim())) {
    return text.replace(/、/g, '')
  }

  return text.replace(/(https?:\/\/[^\s]+)/g, (url) => url.replace(/、/g, ''))
}

export function isSafePublicHttpUrl(input: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  return !isPrivateHostname(parsed.hostname)
}

function isPrivateHostname(hostname: string): boolean {
  if (!hostname) {
    return true
  }

  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized === '::1') {
    return true
  }

  if (PRIVATE_IPV4_REGEX.test(normalized)) {
    return true
  }

  if (isIP(normalized) === 6 && isPrivateIpv6(normalized)) {
    return true
  }

  return PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (normalized === '::1') {
    return true
  }

  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
}
