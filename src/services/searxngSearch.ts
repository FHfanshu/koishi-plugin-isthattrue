import { Context } from 'koishi'
import { Config } from '../config'
import type { DeepSearchQuery, SearchResult } from '../types'
import { resolveProxyAgent } from '../utils/http'
import { resolveSearXNGApiBase } from '../utils/apiConfig'

interface SearXNGResultItem {
  title?: string
  url?: string
  content?: string
  snippet?: string
  engine?: string
}

interface SearXNGResponse {
  results?: SearXNGResultItem[]
}

/**
 * SearXNG 搜索封装
 */
export class SearXNGSearchService {
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  async search(query: DeepSearchQuery): Promise<SearchResult> {
    const keyword = (query.query || '').trim()
    if (!keyword) {
      return {
        agentId: 'searxng',
        perspective: `SearXNG (${query.focus || '元搜索'})`,
        findings: '输入为空，未执行 SearXNG 搜索',
        sources: [],
        confidence: 0,
      }
    }

    const apiBase = resolveSearXNGApiBase(this.config)
    const endpoint = this.normalizeEndpoint(apiBase)
    const engines = query.searxngConfig?.engines || this.config.deepSearch.searXNGEngines || 'google,bing,duckduckgo'
    const categories = query.searxngConfig?.categories || this.config.deepSearch.searXNGCategories || 'general'
    const numResults = Math.max(1, Math.min(
      query.searxngConfig?.numResults || this.config.deepSearch.searXNGNumResults || 10,
      50
    ))
    const timeout = Math.max(5000, Math.min(this.config.deepSearch.perIterationTimeout, 120000))
    const proxyAgent = resolveProxyAgent(this.config.tof)

    this.logger.debug(`[SearXNG] 查询: ${keyword}, endpoint: ${endpoint}, engines: ${engines}, categories: ${categories}`)

    const response = await this.ctx.http.get<SearXNGResponse>(endpoint, {
      timeout,
      params: {
        q: keyword,
        format: 'json',
        engines,
        categories,
      },
      ...(proxyAgent !== undefined ? { proxyAgent } : {}),
    })

    const data = this.normalizeResponse(response)
    const items = (data.results || []).slice(0, numResults)

    if (!items.length) {
      return {
        agentId: 'searxng',
        perspective: `SearXNG (${query.focus || '元搜索'})`,
        findings: `SearXNG 未找到相关结果：${keyword}`,
        sources: [],
        confidence: 0,
      }
    }

    const lines = items.map((item, index) => {
      const title = this.truncate(item.title || '未知标题', 120)
      const snippet = this.truncate(item.content || item.snippet || '', 220)
      const source = this.normalizeUrl(item.url || '')
      const engine = item.engine ? ` [${item.engine}]` : ''
      return `[${index + 1}] ${title}${engine}\n来源: ${source || '未知'}\n摘要: ${snippet || '无'}`
    })

    const sources = [...new Set(
      items
        .map(item => this.normalizeUrl(item.url || ''))
        .filter(Boolean)
    )]

    return {
      agentId: 'searxng',
      perspective: `SearXNG (${query.focus || '元搜索'})`,
      findings: lines.join('\n\n'),
      sources,
      confidence: Math.min(0.35 + sources.length * 0.08, 0.78),
    }
  }

  private normalizeEndpoint(apiBase: string): string {
    const normalized = apiBase.replace(/\/+$/, '')
    if (normalized.endsWith('/search')) {
      return normalized
    }
    return `${normalized}/search`
  }

  private normalizeResponse(response: unknown): SearXNGResponse {
    if (!response) return {}
    if (typeof response === 'string') {
      try {
        return JSON.parse(response)
      } catch {
        return {}
      }
    }
    if (typeof response === 'object') {
      return response as SearXNGResponse
    }
    return {}
  }

  private normalizeUrl(url: string): string {
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

  private truncate(text: string, maxChars: number): string {
    const normalized = (text || '').replace(/\s+/g, ' ').trim()
    if (!normalized) return ''
    return normalized.length > maxChars ? `${normalized.substring(0, maxChars)}...` : normalized
  }
}
