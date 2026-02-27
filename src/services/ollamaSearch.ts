import { Context } from 'koishi'
import { Config } from '../config'
import type { SearchResult } from '../types'
import { resolveProxyAgent } from '../utils/http'
import { resolveOllamaApiBase, resolveOllamaApiKey } from '../utils/apiConfig'
import { truncate } from '../utils/text'
import { normalizeUrl } from '../utils/url'

interface OllamaSearchItem {
  title?: string
  url?: string
  content?: string
  snippet?: string
}

interface OllamaSearchResponse {
  results?: OllamaSearchItem[]
}

type OllamaScope = 'agent' | 'deepsearch'

/**
 * Ollama Search API 封装
 */
export class OllamaSearchService {
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  async search(
    query: string,
    perspective = 'Ollama Search',
    scope: OllamaScope = 'agent'
  ): Promise<SearchResult> {
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
    const proxyAgent = resolveProxyAgent(this.config.factCheck)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`
    }

    const response = await this.ctx.http.post<OllamaSearchResponse>(
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

    const sources = [...new Set(items.map(item => normalizeUrl(item.url || '')).filter(Boolean))]

    return {
      agentId: 'ollama-search',
      perspective,
      findings: lines.join('\n\n'),
      sources,
      confidence: Math.min(0.35 + sources.length * 0.08, 0.75),
    }
  }

  private getSettings(scope: OllamaScope): {
    apiBase: string
    apiKey: string
    maxResults: number
    timeout: number
  } {
    if (scope === 'deepsearch') {
      return {
        apiBase: resolveOllamaApiBase(this.config, 'deepsearch'),
        apiKey: resolveOllamaApiKey(this.config, 'deepsearch'),
        maxResults: Math.max(1, Math.min(this.config.deepSearch.ollamaSearchMaxResults || 5, 10)),
        timeout: Math.max(3000, Math.min(this.config.deepSearch.ollamaSearchTimeout || 15000, 120000)),
      }
    }

    return {
      apiBase: resolveOllamaApiBase(this.config, 'agent'),
      apiKey: resolveOllamaApiKey(this.config, 'agent'),
      maxResults: Math.max(1, Math.min(this.config.agent.ollamaSearchMaxResults || 5, 10)),
      timeout: Math.max(3000, Math.min(this.config.agent.ollamaSearchTimeout || 15000, 120000)),
    }
  }

  private normalizeItems(response: any): OllamaSearchItem[] {
    if (!response) return []
    if (Array.isArray(response)) return response
    if (Array.isArray(response.results)) return response.results
    if (Array.isArray(response.data)) return response.data
    if (Array.isArray(response.items)) return response.items
    return []
  }
}
