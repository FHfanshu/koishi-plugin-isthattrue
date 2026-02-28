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
