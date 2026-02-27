import type { Config } from '../config'

const DEFAULT_OLLAMA_API_BASE = 'https://ollama.com/api/web_search'
const DEFAULT_SEARXNG_API_BASE = 'http://127.0.0.1:8080'
type ApiProvider = 'ollama' | 'searxng'

function pick(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const normalized = (value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

function getEnabledApiEntry(
  config: Config,
  provider: ApiProvider
): { apiKey: string; baseUrl: string } | null {
  const table = Array.isArray(config.api?.apiKeys) ? config.api.apiKeys : []
  for (const row of table) {
    if (!Array.isArray(row) || row.length < 4) continue
    const [rowProvider, rowKey, rowBase, rowEnabled] = row
    if (rowProvider !== provider) continue
    if (!rowEnabled) continue
    return {
      apiKey: pick(rowKey),
      baseUrl: pick(rowBase),
    }
  }
  return null
}

export function resolveOllamaApiBase(config: Config, scope: 'agent' | 'deepsearch'): string {
  const entry = getEnabledApiEntry(config, 'ollama')
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
  const entry = getEnabledApiEntry(config, 'ollama')
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

export function resolveSearXNGApiBase(config: Config): string {
  const entry = getEnabledApiEntry(config, 'searxng')
  return pick(
    config.deepSearch.searXNGApiBase,
    entry?.baseUrl,
    config.api.searXNGApiBase,
    DEFAULT_SEARXNG_API_BASE
  )
}
