import { SubSearchAgent } from '../agents/subSearchAgent'
import { GrokWebSearchService } from './grokWebSearch'
import { JinaReaderService } from './jinaReader'
import { DEEP_SEARCH_AGENT_SYSTEM_PROMPT } from '../utils/prompts'
import { truncate } from '../utils/text'
import { isSafePublicHttpUrl, normalizeUrl } from '../utils/url'

import type { AgentSearchResult, DeepSearchQuery, PluginConfig, ProviderKey } from '../types'
import type { GrokSearchResult } from './grokWebSearch'
import type { JinaReaderResult } from './jinaReader'

type Ctx = any

export class IterativeSearchAgent {
  private readonly logger: any
  private readonly subSearchAgent: SubSearchAgent
  private readonly grokWebSearchService: GrokWebSearchService
  private readonly jinaReaderService: JinaReaderService

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.subSearchAgent = new SubSearchAgent(ctx, config)
    this.grokWebSearchService = new GrokWebSearchService(ctx, config)
    this.jinaReaderService = new JinaReaderService(ctx, config)
  }

  async search(query: DeepSearchQuery): Promise<AgentSearchResult> {
    if (query.useTool === 'grok_web_search') {
      try {
        return await this.searchWithGrokWebSearch(query)
      } catch (error: any) {
        this.logger.warn(`[IterativeSearch] grok_web_search 调用失败，回退模型搜索: ${error?.message || error}`)
      }
    }

    if (query.useTool === 'jina_reader') {
      try {
        return await this.searchWithJinaReader(query)
      } catch (error: any) {
        this.logger.warn(`[IterativeSearch] jina_reader 调用失败，回退模型搜索: ${error?.message || error}`)
      }
    }

    return this.searchWithModel(query)
  }

  private buildModelPrompt(query: DeepSearchQuery): string {
    const focus = query.focus || '综合核查'
    return `请围绕以下重点执行事实核查检索，并返回结构化 findings + sources + confidence：

待核查内容：
"${query.query}"

本轮重点：
${focus}

要求：
1. 优先权威来源与一手证据
2. 给出可核查的来源链接
3. 结果简明，不要输出与任务无关说明`
  }

  private getEnabledProviders(): ProviderKey[] {
    const providers: ProviderKey[] = []
    if (this.config.factCheck.geminiModel?.trim()) providers.push('gemini')
    if (this.config.factCheck.grokModel?.trim()) providers.push('grok')
    return providers
  }

  private resolveProvider(provider?: ProviderKey): ProviderKey | null {
    const enabled = this.getEnabledProviders()
    if (enabled.length === 0) {
      return null
    }

    if (provider && enabled.includes(provider)) {
      return provider
    }

    if (provider && !enabled.includes(provider)) {
      this.logger.debug(`[IterativeSearch] provider=${provider} 已禁用，回退到 ${enabled[0]}`)
    }

    return enabled[0]
  }

  private getModelName(provider: ProviderKey): string {
    switch (provider) {
      case 'grok':
        return this.config.factCheck.grokModel?.trim() || ''
      case 'gemini':
        return this.config.factCheck.geminiModel?.trim() || ''
      default:
        return ''
    }
  }

  private parseGrokSearchResult(results: GrokSearchResult[], query: DeepSearchQuery): AgentSearchResult {
    if (results.length === 0) {
      return {
        agentId: 'deepsearch-grok-web-search',
        perspective: `DeepSearch grok_web_search: ${query.focus}`,
        findings: '无搜索结果',
        sources: [],
        confidence: 0.3,
      }
    }

    const lines = results.slice(0, 8).map((item, index) => {
      const title = truncate(item.title, 120, '无')
      const desc = truncate(item.description, 240, '无')
      return `[${index + 1}] ${title}\n来源: ${item.url}\n摘要: ${desc}`
    })

    const sources = [...new Set(
      results
        .map((item) => normalizeUrl(item.url))
        .filter(Boolean)
    )]

    return {
      agentId: 'deepsearch-grok-web-search',
      perspective: `DeepSearch grok_web_search: ${query.focus}`,
      findings: lines.join('\n\n'),
      sources,
      confidence: Math.min(0.5 + sources.length * 0.06, 0.88),
    }
  }

  private parseJinaReaderResult(result: JinaReaderResult | null, query: DeepSearchQuery, url: string): AgentSearchResult {
    if (!result) {
      return {
        agentId: 'deepsearch-jina-reader',
        perspective: `DeepSearch jina_reader: ${query.focus}`,
        findings: '无法获取内容',
        sources: [],
        confidence: 0.3,
      }
    }

    const sources = [normalizeUrl(result.url || url)].filter(Boolean)

    return {
      agentId: 'deepsearch-jina-reader',
      perspective: `DeepSearch jina_reader: ${query.focus}`,
      findings: truncate(result.content, 1800, '无'),
      sources,
      confidence: sources.length > 0 ? 0.7 : 0.55,
    }
  }

  private async searchWithGrokWebSearch(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const results = await this.grokWebSearchService.search(query.query, 5)
    return this.parseGrokSearchResult(results, query)
  }

  private async searchWithJinaReader(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const targetUrl = query.toolArgs?.url?.trim()
    if (!targetUrl) {
      return {
        agentId: 'deepsearch-jina-reader',
        perspective: `DeepSearch jina_reader: ${query.focus}`,
        findings: 'jina_reader 工具缺少 url 参数',
        sources: [],
        confidence: 0,
        failed: true,
        error: 'missing url parameter',
      }
    }

    const normalizedUrl = normalizeUrl(targetUrl)
    if (!isSafePublicHttpUrl(normalizedUrl)) {
      return {
        agentId: 'deepsearch-jina-reader',
        perspective: `DeepSearch jina_reader: ${query.focus}`,
        findings: `jina_reader 工具 URL 非法或不安全: ${targetUrl}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: 'unsafe url',
      }
    }

    const result = await this.jinaReaderService.fetch(normalizedUrl)
    return this.parseJinaReaderResult(result, query, normalizedUrl)
  }

  private async searchWithModel(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const resolvedProvider = this.resolveProvider(query.provider)
    if (!resolvedProvider) {
      return {
        agentId: 'deepsearch-model',
        perspective: `DeepSearch 模型搜索: ${query.focus}`,
        findings: 'DeepSearch 未配置可用搜索来源。请配置 factCheck.grokModel / factCheck.geminiModel。',
        sources: [],
        confidence: 0,
        failed: true,
        error: 'no deepsearch providers configured',
      }
    }

    const modelName = this.getModelName(resolvedProvider)
    return this.subSearchAgent.deepSearchWithModel(
      query.query,
      modelName,
      `deepsearch-${resolvedProvider}`,
      `DeepSearch ${resolvedProvider}: ${query.focus}`,
      this.buildModelPrompt(query),
      DEEP_SEARCH_AGENT_SYSTEM_PROMPT
    )
  }
}
