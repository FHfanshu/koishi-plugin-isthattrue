import { Tool } from '@langchain/core/tools'
import { Context } from 'koishi'
import { SubSearchAgent } from '../agents/subSearchAgent'
import { Config } from '../config'
import { SearchResult } from '../types'
import { ChatlunaSearchAgent } from './chatlunaSearch'
import { OllamaSearchService } from './ollamaSearch'
import {
  FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT,
  buildFactCheckToolSearchPrompt,
} from '../utils/prompts'

interface ToolSearchProvider {
  key: 'grok' | 'gemini' | 'chatgpt' | 'ollama'
  label: string
  model: string
}

type ProviderOutcome = {
  index: number
  provider: ToolSearchProvider
  status: 'fulfilled' | 'rejected'
  value?: SearchResult
  reason?: unknown
}

type WaitOutcome = ProviderOutcome | { status: 'timeout' }
type ToolMode = 'deep' | 'quick'

class FactCheckTool extends Tool {
  name: string
  description: string
  private logger

  constructor(
    private ctx: Context,
    private config: Config,
    toolName: string,
    toolDescription: string,
    private mode: ToolMode = 'deep'
  ) {
    super()
    this.name = toolName
    this.description = toolDescription
    this.logger = ctx.logger('chatluna-fact-check')
  }

  private getQuickProvider(): ToolSearchProvider | null {
    const explicit = this.config.agent.quickToolModel?.trim()
    const gemini = this.config.agent.geminiModel?.trim()
    const chatlunaSearchModel = this.config.tof.chatlunaSearchModel?.trim()
    const fallback = explicit || gemini || chatlunaSearchModel
    if (!fallback) return null
    return {
      key: 'gemini',
      label: 'GeminiWebSearch',
      model: fallback,
    }
  }

  private normalizeFastReturnMinSuccess(providerCount: number): number {
    const configured = this.config.agent.fastReturnMinSuccess ?? 2
    return Math.max(1, Math.min(configured, providerCount))
  }

  private createProviderTask(
    subSearchAgent: SubSearchAgent,
    ollamaSearchService: OllamaSearchService,
    claim: string,
    provider: ToolSearchProvider,
    index: number
  ): Promise<ProviderOutcome> {
    if (provider.key === 'ollama') {
      return this.withTimeout(
        ollamaSearchService.search(claim, 'OllamaSearch', 'agent'),
        this.config.agent.ollamaSearchTimeout,
        provider.label
      )
        .then((value): ProviderOutcome => ({ index, provider, status: 'fulfilled', value }))
        .catch((reason): ProviderOutcome => ({ index, provider, status: 'rejected', reason }))
    }

    return this.withTimeout(
      subSearchAgent.deepSearchWithModel(
        claim,
        provider.model,
        `tool-${provider.key}`,
        provider.label,
        buildFactCheckToolSearchPrompt(claim),
        FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
      ),
      this.config.agent.perSourceTimeout,
      provider.label
    )
      .then((value): ProviderOutcome => ({ index, provider, status: 'fulfilled', value }))
      .catch((reason): ProviderOutcome => ({ index, provider, status: 'rejected', reason }))
  }

  private async waitNextOutcome(
    active: Map<number, Promise<ProviderOutcome>>,
    remainingMs: number
  ): Promise<WaitOutcome> {
    if (active.size === 0) {
      return { status: 'timeout' }
    }
    if (remainingMs <= 0) {
      return { status: 'timeout' }
    }

    return Promise.race<WaitOutcome>([
      ...active.values(),
      new Promise<{ status: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ status: 'timeout' }), remainingMs)
      }),
    ])
  }

  private getToolProviders(): ToolSearchProvider[] {
    const providers: ToolSearchProvider[] = []

    const grokModel = this.config.agent.grokModel?.trim() || this.config.tof.searchModel
    if (this.config.agent.searchUseGrok && grokModel) {
      providers.push({ key: 'grok', label: 'GrokSearch', model: grokModel })
    }

    const geminiModel = this.config.agent.geminiModel?.trim()
    if (this.config.agent.searchUseGemini && geminiModel) {
      providers.push({ key: 'gemini', label: 'GeminiSearch', model: geminiModel })
    }

    const chatgptModel = this.config.agent.chatgptModel?.trim()
    if (this.config.agent.searchUseChatgpt && chatgptModel) {
      providers.push({ key: 'chatgpt', label: 'ChatGPTSearch', model: chatgptModel })
    }

    if (this.config.agent.searchUseOllama) {
      providers.push({
        key: 'ollama',
        label: 'OllamaSearch',
        model: 'ollama-search-api',
      })
    }

    if (providers.length === 0) {
      providers.push({
        key: 'grok',
        label: 'GrokSearch',
        model: this.config.tof.searchModel,
      })
    }

    return providers
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} 超时`)), timeout)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private truncate(text: string, maxChars: number): string {
    const normalized = (text || '').trim()
    if (!normalized) return '无可用搜索结果'
    return normalized.length > maxChars ? `${normalized.substring(0, maxChars)}...` : normalized
  }

  private formatSingleResult(result: SearchResult): string {
    const findings = this.truncate(result.findings, this.config.agent.maxFindingsChars)
    const sources = result.sources.slice(0, this.config.agent.maxSources)
    const sourceText = sources.length > 0
      ? sources.map(s => `- ${s}`).join('\n')
      : '- 无'
    return `[${result.perspective}]\n${findings}\n\n[Sources]\n${sourceText}`
  }

  private formatMultiResults(results: SearchResult[]): string {
    const parts: string[] = []
    const allSources = new Set<string>()

    for (const result of results) {
      parts.push(`[${result.perspective}]`)
      parts.push(this.truncate(result.findings, this.config.agent.maxFindingsChars))
      parts.push('')
      for (const source of result.sources) {
        if (source) allSources.add(source)
      }
    }

    const dedupedSources = [...allSources].slice(0, this.config.agent.maxSources)
    const sourceText = dedupedSources.length > 0
      ? dedupedSources.map(s => `- ${s}`).join('\n')
      : '- 无'

    parts.push('[Sources]')
    parts.push(sourceText)
    return parts.join('\n')
  }

  private formatChatlunaSearchContext(result: SearchResult): string {
    const findings = this.truncate(
      result.findings,
      this.config.agent.chatlunaSearchContextMaxChars
    )
    const totalSourceCount = result.sources.length
    const sources = result.sources.slice(0, this.config.agent.chatlunaSearchContextMaxSources)
    const domains = this.extractSourceDomains(result.sources)
    const domainPreview = domains.length > 0
      ? domains.slice(0, 10).join(', ')
      : '无'
    const sourceText = sources.length > 0
      ? sources.map(s => `- ${s}`).join('\n')
      : '- 无'

    return `[ChatlunaSearchContext]
${findings}

[ChatlunaSearchMeta]
搜索源总数: ${totalSourceCount}
搜索源域名: ${domainPreview}

[ChatlunaSearchSources]
${sourceText}`
  }

  private extractSourceDomains(sources: string[]): string[] {
    const domains = new Set<string>()
    for (const source of sources || []) {
      if (!source) continue
      try {
        domains.add(new URL(source).hostname)
      } catch {
        const simplified = source.trim().replace(/^https?:\/\//, '').split('/')[0]
        if (simplified) {
          domains.add(simplified)
        }
      }
    }
    return [...domains]
  }

  private async buildChatlunaSearchContext(claim: string): Promise<string | null> {
    if (!this.config.agent.appendChatlunaSearchContext) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (agent.appendChatlunaSearchContext=false)')
      return null
    }

    const chatlunaSearchEnabled = this.config.tof.enableChatlunaSearch !== false
    const chatlunaSearchModel = this.config.tof.chatlunaSearchModel?.trim()
    if (!chatlunaSearchEnabled || !chatlunaSearchModel) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (tof.enableChatlunaSearch=false or tof.chatlunaSearchModel empty)')
      return null
    }

    const chatlunaSearchAgent = new ChatlunaSearchAgent(this.ctx, this.config)
    if (!chatlunaSearchAgent.isAvailable()) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (chatluna-search-service unavailable)')
      return null
    }

    try {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: invoking chatluna-search-service')
      const searchResult = await this.withTimeout(
        chatlunaSearchAgent.search(claim),
        this.config.agent.chatlunaSearchContextTimeout,
        'ChatlunaSearchContext'
      )

      if (!searchResult || searchResult.failed) {
        this.logger.info('[ChatlunaTool] ChatlunaSearchContext: completed but no usable result')
        return null
      }

      const domains = this.extractSourceDomains(searchResult.sources)
      this.logger.info(`[ChatlunaTool] ChatlunaSearchContext: appended (sources=${searchResult.sources.length}, domains=${domains.join(', ') || 'none'})`)

      return this.formatChatlunaSearchContext(searchResult)
    } catch (error) {
      this.logger.warn(`[ChatlunaTool] 追加 Chatluna Search 上下文失败: ${(error as Error).message}`)
      return null
    }
  }

  private appendContext(baseOutput: string, context: string | null): string {
    if (!context) return baseOutput
    return `${baseOutput}\n\n${context}`
  }

  private formatOllamaSearchContext(result: SearchResult): string {
    const findings = this.truncate(
      result.findings,
      this.config.agent.ollamaSearchContextMaxChars
    )
    const totalSourceCount = result.sources.length
    const sources = result.sources.slice(0, this.config.agent.ollamaSearchContextMaxSources)
    const domains = this.extractSourceDomains(result.sources)
    const domainPreview = domains.length > 0
      ? domains.slice(0, 10).join(', ')
      : '无'
    const sourceText = sources.length > 0
      ? sources.map(s => `- ${s}`).join('\n')
      : '- 无'

    return `[OllamaSearchContext]
${findings}

[OllamaSearchMeta]
搜索源总数: ${totalSourceCount}
搜索源域名: ${domainPreview}

[OllamaSearchSources]
${sourceText}`
  }

  private async buildOllamaSearchContext(claim: string): Promise<string | null> {
    if (!this.config.agent.appendOllamaSearchContext) {
      return null
    }

    const apiBase = this.config.agent.ollamaSearchApiBase?.trim()
    if (!apiBase) {
      this.logger.debug('[ChatlunaTool] appendOllamaSearchContext=true，但 ollamaSearchApiBase 未配置，已跳过')
      return null
    }

    const ollamaSearchService = new OllamaSearchService(this.ctx, this.config)
    try {
      const searchResult = await this.withTimeout(
        ollamaSearchService.search(claim, 'Ollama Search 上下文', 'agent'),
        this.config.agent.ollamaSearchContextTimeout,
        'OllamaSearchContext'
      )

      if (!searchResult || searchResult.failed) {
        return null
      }
      const domains = this.extractSourceDomains(searchResult.sources)
      this.logger.info(`[ChatlunaTool] OllamaSearchContext: appended (sources=${searchResult.sources.length}, domains=${domains.join(', ') || 'none'})`)
      return this.formatOllamaSearchContext(searchResult)
    } catch (error) {
      this.logger.warn(`[ChatlunaTool] 追加 Ollama Search 上下文失败: ${(error as Error).message}`)
      return null
    }
  }

  async _call(input: string): Promise<string> {
    const rawClaim = (input || '').trim()
    if (!rawClaim) {
      return '[GrokSearch]\n输入为空，请提供需要检索的文本。'
    }

    const limit = this.config.agent.maxInputChars
    const claim = rawClaim.substring(0, limit)
    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`)
    }

    try {
      this.logger.info('[ChatlunaTool] 收到事实核查请求')

      const subSearchAgent = new SubSearchAgent(this.ctx, this.config)
      const ollamaSearchService = new OllamaSearchService(this.ctx, this.config)
      const providers = this.mode === 'quick'
        ? (() => {
            const provider = this.getQuickProvider()
            return provider ? [provider] : []
          })()
        : this.getToolProviders()

      this.logger.info(`[ChatlunaTool] Tool mode=${this.mode}, providers=${providers.map(p => `${p.key}:${p.model}`).join(', ') || 'none'}`)

      if (providers.length === 0) {
        if (this.mode === 'quick') {
          return '[GeminiWebSearch]\n搜索失败: 未配置可用的 Gemini 快速搜索模型，请设置 agent.quickToolModel 或 agent.geminiModel'
        }
        return '[MultiSourceSearch]\n搜索失败: 未配置可用的搜索来源'
      }

      if (!this.config.agent.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0]
        const timeout = this.mode === 'quick'
          ? this.config.agent.quickToolTimeout
          : this.config.agent.perSourceTimeout
        const result = await this.withTimeout(
          provider.key === 'ollama'
            ? ollamaSearchService.search(claim, provider.label, 'agent')
            : subSearchAgent.deepSearchWithModel(
                claim,
                provider.model,
                `tool-${provider.key}`,
                provider.label,
                buildFactCheckToolSearchPrompt(claim),
                FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
              ),
          timeout,
          provider.label
        )
        if (result.failed) {
          return `[${provider.label}]\n搜索失败: ${result.error || result.findings}`
        }
        const output = this.formatSingleResult(result)
        const chatlunaContext = await this.buildChatlunaSearchContext(claim)
        const ollamaContext = await this.buildOllamaSearchContext(claim)
        this.logger.info(`[ChatlunaTool] Context append result: chatluna=${Boolean(chatlunaContext)}, ollama=${Boolean(ollamaContext)}`)
        return this.appendContext(this.appendContext(output, chatlunaContext), ollamaContext)
      }

      const successResults: SearchResult[] = []
      const failedLabels: string[] = []
      const start = Date.now()
      const minSuccess = this.normalizeFastReturnMinSuccess(providers.length)
      const maxWaitMs = Math.max(
        1000,
        Math.min(this.config.agent.fastReturnMaxWaitMs ?? 12000, this.config.agent.perSourceTimeout)
      )
      const targetConcurrency = minSuccess

      const active = new Map<number, Promise<ProviderOutcome>>()
      let nextProviderIndex = 0

      const launchNext = (): boolean => {
        if (nextProviderIndex >= providers.length) {
          return false
        }
        const index = nextProviderIndex
        const provider = providers[index]
        nextProviderIndex += 1
        active.set(index, this.createProviderTask(subSearchAgent, ollamaSearchService, claim, provider, index))
        return true
      }

      while (active.size < targetConcurrency && launchNext()) {
        // 预热首批并发任务
      }

      while (active.size > 0) {
        const remainingMs = maxWaitMs - (Date.now() - start)
        const outcome = await this.waitNextOutcome(active, remainingMs)

        if (outcome.status === 'timeout') {
          this.logger.info(`[ChatlunaTool] 达到快速返回等待上限 ${maxWaitMs}ms，提前返回`)
          break
        }

        active.delete(outcome.index)

        if (outcome.status === 'fulfilled') {
          if (outcome.value?.failed) {
            failedLabels.push(outcome.provider.label)
            this.logger.warn(`[ChatlunaTool] ${outcome.provider.label} 失败: ${outcome.value.error || outcome.value.findings}`)
          } else if (outcome.value) {
            successResults.push(outcome.value)
          }
        } else {
          failedLabels.push(outcome.provider.label)
          this.logger.warn(`[ChatlunaTool] ${outcome.provider.label} 失败: ${(outcome.reason as Error)?.message || outcome.reason}`)
        }

        const elapsed = Date.now() - start
        if (successResults.length >= minSuccess) {
          this.logger.info(`[ChatlunaTool] 已获得 ${successResults.length} 个成功来源，提前返回`)
          break
        }

        // 当前成功不足时，逐步扩展到后续来源，减少无效并发占用
        if (elapsed < maxWaitMs) {
          while (active.size < targetConcurrency && launchNext()) {
            // 补齐并发槽位
          }
        }
      }

      if (active.size > 0) {
        // 提前返回后不再等待剩余来源，避免阻塞工具输出
        active.forEach(task => {
          task.then((outcome) => {
            if (outcome.status === 'fulfilled' && outcome.value?.failed) {
              this.logger.debug(`[ChatlunaTool] 延迟完成但失败: ${outcome.provider.label}`)
            }
          }).catch(() => {
            // no-op，避免未处理 Promise 警告
          })
        })
      }

      if (successResults.length === 0) {
        return `[MultiSourceSearch]\n搜索失败: ${failedLabels.join('、') || '全部来源不可用'}`
      }

      const output = this.formatMultiResults(successResults)
      const chatlunaContext = await this.buildChatlunaSearchContext(claim)
      const ollamaContext = await this.buildOllamaSearchContext(claim)
      this.logger.info(`[ChatlunaTool] Context append result: chatluna=${Boolean(chatlunaContext)}, ollama=${Boolean(ollamaContext)}`)
      const outputWithContext = this.appendContext(
        this.appendContext(output, chatlunaContext),
        ollamaContext
      )
      if (failedLabels.length > 0) {
        return `${outputWithContext}\n\n[Failed]\n- ${failedLabels.join('\n- ')}`
      }
      return outputWithContext
    } catch (error) {
      this.logger.error('[ChatlunaTool] 核查失败:', error)
      return `[MultiSourceSearch]\n搜索失败: ${(error as Error).message}`
    }
  }
}

export function registerFactCheckTool(ctx: Context, config: Config) {
  const logger = ctx.logger('chatluna-fact-check')

  if (!config.agent.enable) {
    logger.info('[ChatlunaTool] 已禁用工具注册')
    return
  }

  const chatluna = (ctx as any).chatluna
  if (!chatluna?.platform?.registerTool) {
    logger.warn('[ChatlunaTool] chatluna.platform.registerTool 不可用，跳过注册')
    return
  }

  const deepToolName = config.agent.name?.trim() || 'fact_check_deep'
  const deepToolDescription = config.agent.description?.trim()
    || '用于 LLM 网络搜索（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/Ollama），由上层 Agent 自行判断。'
  const quickToolName = config.agent.quickToolName?.trim() || 'fact_check'
  const quickToolDescription = config.agent.quickToolDescription?.trim()
    || '用于快速网络搜索（Gemini 单源）。输入待核查文本，快速返回来源与摘要，适合日常场景。'

  ctx.effect(() => {
    const disposables: Array<() => void> = []
    const skipLegacyDeepTool = config.deepSearch.enable

    if (config.agent.enableDeepTool && !skipLegacyDeepTool) {
      logger.info(`[ChatlunaTool] 注册工具(深度): ${deepToolName}`)
      const disposeDeep = chatluna.platform.registerTool(deepToolName, {
        createTool() {
          return new FactCheckTool(ctx, config, deepToolName, deepToolDescription, 'deep')
        },
        selector() {
          return true
        },
      })
      if (typeof disposeDeep === 'function') {
        disposables.push(disposeDeep)
      }
    }
    if (config.agent.enableDeepTool && skipLegacyDeepTool) {
      logger.info('[ChatlunaTool] 已启用 deep_search，跳过 legacy 多源深搜工具注册')
    }

    if (config.agent.enableQuickTool) {
      if (quickToolName === deepToolName) {
        logger.warn('[ChatlunaTool] quickToolName 与深度工具名称重复，已跳过快速工具注册')
      } else {
        logger.info(`[ChatlunaTool] 注册工具(快速): ${quickToolName}`)
        const disposeQuick = chatluna.platform.registerTool(quickToolName, {
          createTool() {
            return new FactCheckTool(ctx, config, quickToolName, quickToolDescription, 'quick')
          },
          selector() {
            return true
          },
        })
        if (typeof disposeQuick === 'function') {
          disposables.push(disposeQuick)
        }
      }
    }

    if ((!config.agent.enableDeepTool || skipLegacyDeepTool) && !config.agent.enableQuickTool) {
      logger.warn('[ChatlunaTool] enableDeepTool 与 enableQuickTool 均为 false，未注册任何 fact check 工具')
    }

    return () => {
      disposables.forEach(dispose => dispose())
    }
  })
}
