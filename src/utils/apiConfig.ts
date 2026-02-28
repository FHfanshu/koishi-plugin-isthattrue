import type { PluginConfig, SearchScope } from '../types'

const DEFAULT_OLLAMA_API_BASE = 'https://ollama.com/api/web_search'

function pick(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const normalized = (value || '').trim()
    if (normalized) return normalized
  }

  return ''
}

export function isOllamaEnabled(config: PluginConfig): boolean {
  return config.api?.ollamaEnabled !== false
}

export function resolveOllamaApiBase(config: PluginConfig, _scope: SearchScope): string {
  return pick(config.api?.ollamaBaseUrl, DEFAULT_OLLAMA_API_BASE)
}

export function resolveOllamaApiKey(config: PluginConfig, _scope: SearchScope): string {
  return pick(config.api?.ollamaApiKey, process.env.OLLAMA_API_KEY)
}
