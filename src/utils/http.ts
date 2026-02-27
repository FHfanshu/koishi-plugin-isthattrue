import type { TofConfig } from '../config'

export function resolveProxyAgent(tof: TofConfig): string | undefined {
  if (tof.proxyMode === 'direct') return ''
  if (tof.proxyMode === 'custom') {
    const proxy = (tof.proxyAddress || '').trim()
    return proxy || ''
  }
  return undefined
}

