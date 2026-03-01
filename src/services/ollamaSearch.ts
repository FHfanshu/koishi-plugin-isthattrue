import { resolveProxyAgent } from '../utils/http'
import { resolveOllamaApiBase, resolveOllamaApiKey } from '../utils/apiConfig'
import { truncate } from '../utils/text'
import { normalizeUrl } from '../utils/url'

import type { AgentSearchResult, PluginConfig, SearchScope } from '../types'

type Ctx = any

interface OllamaSearchSettings {
  apiBase: string
  apiKey: string
  maxResults: number
  timeout: number
}

interface OllamaResultItem {
  title?: string
  content?: string
  snippet?: string
  url?: string
}

export class OllamaSearchService {
  private readonly logger: any

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  async search(query: string, perspective = 'Ollama Search', scope: SearchScope = 'agent'): Promise<AgentSearchResult> {
    const keyword = (query || '').trim()
    if (!keyword) {
      return {
        agentId: 'ollama-search',
        perspective,
        findings: '输入为空，未执行 Ollama Search',
        sources: [],
        confidence: 0,
      }
    }

    const settings = this.getSettings(scope)
    const proxyAgent = resolveProxyAgent(this.config.debug)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`
    }

    const response = await this.ctx.http.post(
      settings.apiBase,
      {
        query: keyword,
        max_results: settings.maxResults,
      },
      {
        timeout: settings.timeout,
        headers,
        ...(proxyAgent !== undefined ? { proxyAgent } : {}),
      }
    )

    const items = this.normalizeItems(response).slice(0, settings.maxResults)
    if (!items.length) {
      return {
        agentId: 'ollama-search',
        perspective,
        findings: `Ollama Search 未找到相关结果：${keyword}`,
        sources: [],
        confidence: 0,
      }
    }

    const lines = items.map((item, index) => {
      const title = truncate(item.title || '未知标题', 120)
      const content = truncate(item.content || item.snippet || '', 240)
      const url = normalizeUrl(item.url || '')
      return `[${index + 1}] ${title}\n来源: ${url || '未知'}\n摘要: ${content || '无'}`
    })

    const sources = [...new Set(items.map((item) => normalizeUrl(item.url || '')).filter(Boolean))]

    return {
      agentId: 'ollama-search',
      perspective,
      findings: lines.join('\n\n'),
      sources,
      confidence: Math.min(0.35 + sources.length * 0.08, 0.75),
    }
  }

  private getSettings(scope: SearchScope): OllamaSearchSettings {
    return {
      apiBase: resolveOllamaApiBase(this.config, scope),
      apiKey: resolveOllamaApiKey(this.config, scope),
      maxResults: Math.max(1, Math.min(this.config.factCheck.ollamaSearchMaxResults || 5, 10)),
      timeout: Math.max(3000, Math.min(this.config.factCheck.ollamaSearchTimeout || 15_000, 120_000)),
    }
  }

  private normalizeItems(response: unknown): OllamaResultItem[] {
    if (!response) return []
    if (Array.isArray(response)) return response as OllamaResultItem[]

    if (typeof response === 'object' && response) {
      const record = response as Record<string, unknown>
      if (Array.isArray(record.results)) return record.results as OllamaResultItem[]
      if (Array.isArray(record.data)) return record.data as OllamaResultItem[]
      if (Array.isArray(record.items)) return record.items as OllamaResultItem[]
    }

    return []
  }
}
