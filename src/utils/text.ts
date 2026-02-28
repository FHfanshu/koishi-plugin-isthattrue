export function truncate(text: string | undefined | null, maxChars: number, emptyFallback = ''): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return emptyFallback

  return normalized.length > maxChars
    ? `${normalized.substring(0, maxChars)}...`
    : normalized
}
