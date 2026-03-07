export function normalizeModelName(model: string | undefined): string {
  const value = (model || '').trim()
  if (!value) return ''

  const lower = value.toLowerCase()
  if (
    value === '无'
    || lower === 'none'
    || lower === 'null'
    || lower === 'nil'
    || lower === 'n/a'
    || lower === 'na'
    || lower === 'undefined'
    || lower === '-'
  ) {
    return ''
  }

  return value
}
