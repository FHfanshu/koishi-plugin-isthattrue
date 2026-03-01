import { SubSearchAgent } from '../agents/subSearchAgent'
import { OllamaSearchService } from './ollamaSearch'
import { isOllamaEnabled } from '../utils/apiConfig'
import { DEEP_SEARCH_AGENT_SYSTEM_PROMPT } from '../utils/prompts'
import { truncate } from '../utils/text'
import { extractUrls, normalizeUrl } from '../utils/url'
import { normalizeResultItems } from '../utils/search'

import type { AgentSearchResult, DeepSearchQuery, PluginConfig, ProviderKey } from '../types'

type Ctx = any

export class IterativeSearchAgent {
  private readonly logger: any
  private readonly subSearchAgent: SubSearchAgent
  private readonly ollamaSearchService: OllamaSearchService
  private emptyEmbeddings: any = null

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.subSearchAgent = new SubSearchAgent(ctx, config)
    this.ollamaSearchService = new OllamaSearchService(ctx, config)
    this.tryLoadEmptyEmbeddings()
  }

  async search(query: DeepSearchQuery): Promise<AgentSearchResult> {
    if (query.useTool === 'web_search' && this.config.deepSearch.useChatlunaSearchTool) {
      try {
        return await this.searchWithChatLunaTool(query)
      } catch (error: any) {
        this.logger.warn(`[IterativeSearch] web_search 调用失败，回退模型搜索: ${error?.message || error}`)
      }
    }

    if (query.useTool === 'browser' && this.config.deepSearch.usePuppeteerBrowser) {
      try {
        return await this.searchWithBrowser(query)
      } catch (error: any) {
        this.logger.warn(`[IterativeSearch] browser 调用失败，回退模型搜索: ${error?.message || error}`)
      }
    }

    if (query.useTool === 'ollama_search' && isOllamaEnabled(this.config)) {
      try {
        return await this.searchWithOllama(query)
      } catch (error: any) {
        this.logger.warn(`[IterativeSearch] ollama_search 调用失败，回退模型搜索: ${error?.message || error}`)
      }
    }

    return this.searchWithModel(query)
  }

  private tryLoadEmptyEmbeddings(): void {
    try {
      const inMemory = require('koishi-plugin-chatluna/llm-core/model/in_memory')
      this.emptyEmbeddings = inMemory.emptyEmbeddings
    } catch {
      this.emptyEmbeddings = null
    }
  }

  private getPlatform(): any {
    return this.ctx.chatluna?.platform
  }

  private getToolInfo(name: string): any {
    const platform = this.getPlatform()
    if (!platform?.getTool) {
      throw new Error('chatluna.platform.getTool 不可用')
    }

    const toolInfo = platform.getTool(name)
    if (!toolInfo || typeof toolInfo.createTool !== 'function') {
      throw new Error(`${name} 工具不可用`)
    }

    return toolInfo
  }

  private createTool(name: string): any {
    const toolInfo = this.getToolInfo(name)
    const candidates = [
      { embeddings: this.emptyEmbeddings, summaryType: 'performance' },
      { summaryType: 'performance' },
      {},
    ]

    for (const params of candidates) {
      try {
        return toolInfo.createTool(params)
      } catch {
        // try next
      }
    }

    try {
      return toolInfo.createTool()
    } catch (error: any) {
      throw new Error(`${name} createTool 失败: ${error?.message || error}`)
    }
  }

  private async invokeTool(tool: any, input: unknown): Promise<unknown> {
    const runnableConfig = {
      configurable: {
        model:
          this.config.deepSearch.controllerModel?.trim()
          || this.config.factCheck.geminiModel?.trim()
          || this.config.factCheck.grokModel?.trim()
          || this.config.factCheck.grokModel,
      },
    }

    if (typeof tool?.invoke === 'function') {
      return tool.invoke(input, runnableConfig)
    }
    if (typeof tool?._call === 'function') {
      return tool._call(input, undefined, runnableConfig)
    }
    throw new Error('工具没有可用调用方法')
  }

  private parseWebSearchResult(rawResult: unknown, query: DeepSearchQuery): AgentSearchResult {
    const items = normalizeResultItems(rawResult)
    const rawText = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)

    if (items.length === 0) {
      return {
        agentId: 'deepsearch-web-search',
        perspective: `DeepSearch web_search: ${query.focus}`,
        findings: truncate(rawText, 1200, '无'),
        sources: extractUrls(rawText),
        confidence: 0.4,
      }
    }

    const lines = items.slice(0, 8).map((item, index) => {
      const title = truncate(item?.title || item?.name || '未知标题', 120, '无')
      const desc = truncate(item?.description || item?.content || '', 240, '无')
      const url = item?.url || item?.link || ''
      return `[${index + 1}] ${title}\n来源: ${url || '未知'}\n摘要: ${desc}`
    })

    const sources = [...new Set(
      items
        .map((item) => item?.url || item?.link || '')
        .map((url) => normalizeUrl(url || ''))
        .filter(Boolean)
    )]

    return {
      agentId: 'deepsearch-web-search',
      perspective: `DeepSearch web_search: ${query.focus}`,
      findings: lines.join('\n\n'),
      sources,
      confidence: Math.min(0.5 + sources.length * 0.06, 0.88),
    }
  }

  private parseBrowserResult(rawResult: unknown, query: DeepSearchQuery, url: string): AgentSearchResult {
    const text = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult)
    const sources = [...new Set([
      normalizeUrl(url),
      ...extractUrls(text),
    ].filter(Boolean))]

    return {
      agentId: 'deepsearch-browser',
      perspective: `DeepSearch browser: ${query.focus}`,
      findings: truncate(text, 1800, '无'),
      sources,
      confidence: sources.length > 0 ? 0.7 : 0.55,
    }
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
    if (isOllamaEnabled(this.config)) providers.push('ollama')
    if (this.config.factCheck.grokModel?.trim()) providers.push('grok')
    if (this.config.factCheck.chatgptModel?.trim()) providers.push('chatgpt')
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
      case 'chatgpt':
        return this.config.factCheck.chatgptModel?.trim() || ''
      case 'ollama':
        return 'ollama-search-api'
      default:
        return ''
    }
  }

  private async searchWithChatLunaTool(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const tool = this.createTool('web_search')
    const rawResult = await this.invokeTool(tool, query.query)
    return this.parseWebSearchResult(rawResult, query)
  }

  private async searchWithBrowser(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const targetUrl = query.toolArgs?.url?.trim()
    if (!targetUrl) {
      throw new Error('browser 工具缺少 url 参数')
    }

    const action = query.toolArgs?.action?.trim() || 'summarize'
    const params = query.toolArgs?.params?.trim() || ''
    const tool = this.createTool('browser')
    const rawResult = await this.invokeTool(tool, {
      url: targetUrl,
      action,
      params,
    })

    return this.parseBrowserResult(rawResult, query, targetUrl)
  }

  private async searchWithOllama(query: DeepSearchQuery): Promise<AgentSearchResult> {
    return this.ollamaSearchService.search(query.query, `Ollama Search: ${query.focus}`, 'deepsearch')
  }

  private async searchWithModel(query: DeepSearchQuery): Promise<AgentSearchResult> {
    const resolvedProvider = this.resolveProvider(query.provider)
    if (!resolvedProvider) {
      return {
        agentId: 'deepsearch-model',
        perspective: `DeepSearch 模型搜索: ${query.focus}`,
        findings: 'DeepSearch 未配置可用搜索来源。请配置 deepSearch.grokModel / geminiModel / chatgptModel，或在 api.ollamaEnabled 启用 ollama。',
        sources: [],
        confidence: 0,
        failed: true,
        error: 'no deepsearch providers configured',
      }
    }

    if (resolvedProvider === 'ollama') {
      return this.searchWithOllama(query)
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
