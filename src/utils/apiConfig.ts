import type { Config } from '../config'

const DEFAULT_OLLAMA_API_BASE = 'https://ollama.com/api/web_search'

function pick(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const normalized = (value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function getEnabledApiEntry(
  config: Config
): { apiKey: string; baseUrl: string } | null {
  const table = Array.isArray(config.api?.apiKeys) ? config.api.apiKeys : []
  for (const row of table) {
    if (!Array.isArray(row) || row.length < 4) continue
    const [rowProvider, rowKey, rowBase, rowEnabled] = row
    if (rowProvider !== 'ollama') continue
    if (!rowEnabled) continue
    return {
      apiKey: pick(rowKey),
      baseUrl: pick(rowBase),
    }
  }
  return null
}

export function resolveOllamaApiBase(config: Config, scope: 'agent' | 'deepsearch'): string {
  const entry = getEnabledApiEntry(config)
  if (scope === 'deepsearch') {
    return pick(
      config.deepSearch.ollamaSearchApiBase,
      entry?.baseUrl,
      config.api.ollamaSearchApiBase,
      DEFAULT_OLLAMA_API_BASE
    )
  }

  return pick(
    config.agent.ollamaSearchApiBase,
    entry?.baseUrl,
    config.api.ollamaSearchApiBase,
    DEFAULT_OLLAMA_API_BASE
  )
}

export function resolveOllamaApiKey(config: Config, scope: 'agent' | 'deepsearch'): string {
  const entry = getEnabledApiEntry(config)
  if (scope === 'deepsearch') {
    return pick(
      config.deepSearch.ollamaSearchApiKey,
      entry?.apiKey,
      config.api.ollamaSearchApiKey,
      process.env.OLLAMA_API_KEY
    )
  }

  return pick(
    config.agent.ollamaSearchApiKey,
    entry?.apiKey,
    config.api.ollamaSearchApiKey,
    process.env.OLLAMA_API_KEY
  )
}
