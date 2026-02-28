import type { FactCheckConfig } from '../types'

export function resolveProxyAgent(factCheck: FactCheckConfig): string | undefined {
  if (factCheck.proxyMode === 'direct') return ''

  if (factCheck.proxyMode === 'custom') {
    const proxy = (factCheck.proxyAddress || '').trim()
    return proxy || undefined
  }

  return undefined
}
