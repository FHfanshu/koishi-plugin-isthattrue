import { Tool } from '@langchain/core/tools'

import { SubSearchAgent } from '../agents/subSearchAgent'
import { withTimeout } from '../utils/async'
import { isOllamaEnabled } from '../utils/apiConfig'
import { buildFactCheckToolSearchPrompt, FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT } from '../utils/prompts'
import { truncate } from '../utils/text'
import { ChatlunaSearchAgent } from './chatlunaSearch'
import { OllamaSearchService } from './ollamaSearch'

import type { AgentSearchResult, PluginConfig, ProviderKey } from '../types'

type Ctx = any

interface ToolProvider {
  key: ProviderKey
  label: string
  model: string
}

type ProviderTaskOutcome =
  | { index: number; provider: ToolProvider; status: 'fulfilled'; value: AgentSearchResult }
  | { index: number; provider: ToolProvider; status: 'rejected'; reason: unknown }
  | { status: 'timeout' }

class FactCheckTool extends Tool {
  static HARD_TIMEOUT_MS = 120_000

  get name(): string {
    return this.toolName
  }

  get description(): string {
    return this.toolDescription
  }

  private readonly logger: any
  private readonly subSearchAgent: SubSearchAgent
  private readonly ollamaSearchService: OllamaSearchService
  private readonly backgroundTasks = new Set<Promise<ProviderTaskOutcome>>()
  private readonly toolName: string
  private readonly toolDescription: string

  constructor(
    private readonly ctx: Ctx,
    private readonly config: PluginConfig,
    toolName: string,
    toolDescription: string
  ) {
    super()
    this.toolName = toolName
    this.toolDescription = toolDescription
    this.logger = ctx.logger('chatluna-fact-check')
    this.subSearchAgent = new SubSearchAgent(ctx, config)
    this.ollamaSearchService = new OllamaSearchService(ctx, config)
  }

  private getQuickProvider(): ToolProvider | null {
    const gemini = this.config.factCheck.geminiModel?.trim()
    if (!gemini) return null

    return {
      key: 'gemini',
      label: 'GeminiWebSearch',
      model: gemini,
    }
  }

  private normalizeFastReturnMinSuccess(providerCount: number): number {
    const configured = this.config.factCheck.fastReturnMinSuccess ?? 2
    return Math.max(1, Math.min(configured, providerCount))
  }

  private buildInternalContextPreamble(): string {
    return [
      '[INTERNAL_TOOL_CONTEXT]',
      'INTERNAL_TOOL_CONTEXT_DO_NOT_QUOTE_VERBATIM',
      '以下内容仅用于 Agent 内部推理，不要逐字转发给用户。',
      '对用户回复时请只输出结论、关键依据和必要来源链接。',
      '',
    ].join('\n')
  }

  private toShortLine(text: string | undefined, maxChars: number): string {
    return truncate((text || '').replace(/\s+/g, ' ').trim(), maxChars, '无')
  }

  private formatSourcesForContext(sources: string[], limit: number): string {
    const items = (sources || []).filter(Boolean).slice(0, limit)
    if (items.length === 0) return '- 无'
    return items.map((s) => `- ${s}`).join('\n')
  }

  private createProviderTask(claim: string, provider: ToolProvider, index: number): Promise<ProviderTaskOutcome> {
    if (provider.key === 'ollama') {
      return withTimeout(
        this.ollamaSearchService.search(claim, 'OllamaSearch', 'agent'),
        this.config.factCheck.ollamaSearchTimeout,
        provider.label
      )
        .then((value) => ({ index, provider, status: 'fulfilled' as const, value }))
        .catch((reason) => ({ index, provider, status: 'rejected', reason }))
    }

    return withTimeout(
      this.subSearchAgent.deepSearchWithModel(
        claim,
        provider.model,
        `tool-${provider.key}`,
        provider.label,
        buildFactCheckToolSearchPrompt(claim),
        FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
      ),
      this.config.factCheck.perSourceTimeout,
      provider.label
    )
      .then((value) => ({ index, provider, status: 'fulfilled' as const, value }))
      .catch((reason) => ({ index, provider, status: 'rejected', reason }))
  }

  private trackBackgroundTask(task: Promise<ProviderTaskOutcome>, label: string): void {
    this.backgroundTasks.add(task)
    task.then(() => {
      this.logger.debug(`[ChatlunaTool] 后台任务完成: ${label}`)
    }).catch((error: any) => {
      this.logger.debug(`[ChatlunaTool] 后台任务失败: ${label}: ${error?.message || error}`)
    }).finally(() => {
      this.backgroundTasks.delete(task)
    })
  }

  private async waitNextOutcome(
    active: Map<number, Promise<ProviderTaskOutcome>>,
    remainingMs: number
  ): Promise<ProviderTaskOutcome> {
    if (active.size === 0 || remainingMs <= 0) {
      return { status: 'timeout' }
    }

    return Promise.race([
      ...active.values(),
      new Promise<ProviderTaskOutcome>((resolve) => {
        setTimeout(() => resolve({ status: 'timeout' }), remainingMs)
      }),
    ])
  }

  private getToolProviders(): ToolProvider[] {
    const providers: ToolProvider[] = []

    const grokModel = this.config.factCheck.grokModel?.trim()
    if (grokModel) providers.push({ key: 'grok', label: 'GrokSearch', model: grokModel })

    const geminiModel = this.config.factCheck.geminiModel?.trim()
    if (geminiModel) providers.push({ key: 'gemini', label: 'GeminiSearch', model: geminiModel })

    const chatgptModel = this.config.factCheck.chatgptModel?.trim()
    if (chatgptModel) providers.push({ key: 'chatgpt', label: 'ChatGPTSearch', model: chatgptModel })

    if (isOllamaEnabled(this.config)) {
      providers.push({ key: 'ollama', label: 'OllamaSearch', model: 'ollama-search-api' })
    }

    return providers
  }

  private formatSingleResult(result: AgentSearchResult): string {
    const findings = this.toShortLine(result.findings, Math.min(this.config.factCheck.maxFindingsChars, 600))
    const confidence = Number.isFinite(result.confidence)
      ? `${Math.round(result.confidence * 100)}%`
      : '未知'

    const sourceText = this.formatSourcesForContext(result.sources, this.config.factCheck.maxSources)

    return `${this.buildInternalContextPreamble()}[FactCheckContext]
模式: single-source
视角: ${result.perspective}
置信度: ${confidence}
关键发现: ${findings}

[Sources]
${sourceText}`
  }

  private formatMultiResults(results: AgentSearchResult[]): string {
    const parts: string[] = [this.buildInternalContextPreamble(), '[FactCheckContext]', '模式: multi-source']
    const allSources = new Set<string>()

    for (const result of results) {
      const confidence = Number.isFinite(result.confidence)
        ? `${Math.round(result.confidence * 100)}%`
        : '未知'

      parts.push(`- 视角: ${result.perspective}`)
      parts.push(`  置信度: ${confidence}`)
      parts.push(`  关键发现: ${this.toShortLine(result.findings, Math.min(this.config.factCheck.maxFindingsChars, 400))}`)

      for (const source of result.sources) {
        if (source) allSources.add(source)
      }
    }

    const dedupedSources = [...allSources].slice(0, this.config.factCheck.maxSources)
    parts.push('[Sources]')
    parts.push(this.formatSourcesForContext(dedupedSources, this.config.factCheck.maxSources))
    return parts.join('\n')
  }

  private formatChatlunaSearchContext(result: AgentSearchResult): string {
    const findings = truncate(
      result.findings,
      Math.min(this.config.factCheck.searchContextMaxChars, 500),
      '无可用搜索结果'
    )

    const totalSourceCount = result.sources.length
    const sources = result.sources.slice(0, this.config.factCheck.searchContextMaxSources)
    const domains = this.extractSourceDomains(result.sources)
    const domainPreview = domains.length > 0 ? domains.slice(0, 10).join(', ') : '无'
    const sourceText = sources.length > 0 ? sources.map((s) => `- ${s}`).join('\n') : '- 无'

    return `[ChatlunaSearchContextInternal]
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
        if (simplified) domains.add(simplified)
      }
    }

    return [...domains]
  }

  private async buildChatlunaSearchContext(claim: string): Promise<string | null> {
    if (!this.config.factCheck.appendChatlunaSearchContext) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (agent.appendChatlunaSearchContext=false)')
      return null
    }

    const chatlunaSearchAgent = new ChatlunaSearchAgent(this.ctx, this.config)
    if (!chatlunaSearchAgent.isAvailable()) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (chatluna-search-service unavailable)')
      return null
    }

    try {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: invoking chatluna-search-service')
      const searchResult = await withTimeout(
        chatlunaSearchAgent.search(claim),
        this.config.factCheck.searchContextTimeout,
        'ChatlunaSearchContext'
      )

      if (!searchResult || searchResult.failed) {
        this.logger.info('[ChatlunaTool] ChatlunaSearchContext: completed but no usable result')
        return null
      }

      const domains = this.extractSourceDomains(searchResult.sources)
      this.logger.info(`[ChatlunaTool] ChatlunaSearchContext: appended (sources=${searchResult.sources.length}, domains=${domains.join(', ') || 'none'})`)
      return this.formatChatlunaSearchContext(searchResult)
    } catch (error: any) {
      this.logger.warn(`[ChatlunaTool] 追加 Chatluna Search 上下文失败: ${error?.message || error}`)
      return null
    }
  }

  private appendContext(baseOutput: string, context: string | null): string {
    if (!context) return baseOutput
    return `${baseOutput}\n\n${context}`
  }

  private formatOllamaSearchContext(result: AgentSearchResult): string {
    const findings = truncate(
      result.findings,
      Math.min(this.config.factCheck.searchContextMaxChars, 500),
      '无可用搜索结果'
    )

    const totalSourceCount = result.sources.length
    const sources = result.sources.slice(0, this.config.factCheck.searchContextMaxSources)
    const domains = this.extractSourceDomains(result.sources)
    const domainPreview = domains.length > 0 ? domains.slice(0, 10).join(', ') : '无'
    const sourceText = sources.length > 0 ? sources.map((s) => `- ${s}`).join('\n') : '- 无'

    return `[OllamaSearchContextInternal]
${findings}

[OllamaSearchMeta]
搜索源总数: ${totalSourceCount}
搜索源域名: ${domainPreview}

[OllamaSearchSources]
${sourceText}`
  }

  private async buildOllamaSearchContext(claim: string): Promise<string | null> {
    if (!this.config.factCheck.appendOllamaSearchContext) {
      return null
    }

    try {
      const searchResult = await withTimeout(
        this.ollamaSearchService.search(claim, 'Ollama Search 上下文', 'agent'),
        this.config.factCheck.searchContextTimeout,
        'OllamaSearchContext'
      )

      if (!searchResult || searchResult.failed) {
        return null
      }

      const domains = this.extractSourceDomains(searchResult.sources)
      this.logger.info(`[ChatlunaTool] OllamaSearchContext: appended (sources=${searchResult.sources.length}, domains=${domains.join(', ') || 'none'})`)
      return this.formatOllamaSearchContext(searchResult)
    } catch (error: any) {
      this.logger.warn(`[ChatlunaTool] 追加 Ollama Search 上下文失败: ${error?.message || error}`)
      return null
    }
  }

  async _call(input: string): Promise<string> {
    const rawClaim = (input || '').trim()
    if (!rawClaim) {
      return '[GrokSearch]\n输入为空，请提供需要检索的文本。'
    }

    try {
      return await withTimeout(this._callInner(rawClaim), FactCheckTool.HARD_TIMEOUT_MS, 'FactCheck 整体')
    } catch (error: any) {
      this.logger.error('[ChatlunaTool] 核查失败（可能超时）:', error)
      return `[FactCheck]\n搜索失败: ${error?.message || error}`
    }
  }

  private async _callInner(rawClaim: string): Promise<string> {
    const limit = this.config.factCheck.maxInputChars
    const claim = rawClaim.substring(0, limit)

    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`)
    }

    try {
      this.logger.info('[ChatlunaTool] 收到事实核查请求')

      const providers = this.config.factCheck.enableMultiSourceSearch
        ? this.getToolProviders()
        : (() => {
            const provider = this.getQuickProvider()
            return provider ? [provider] : []
          })()

      this.logger.info(`[ChatlunaTool] providers=${providers.map((p) => `${p.key}:${p.model}`).join(', ') || 'none'}`)

      if (providers.length === 0) {
        return '[FactCheck]\n搜索失败: 未配置可用搜索来源。请配置 agent.grokModel / agent.geminiModel / agent.chatgptModel，或在 api.ollamaEnabled 启用 ollama。'
      }

      if (!this.config.factCheck.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0]
        const timeout = this.config.factCheck.perSourceTimeout

        const result = await withTimeout(
          provider.key === 'ollama'
            ? this.ollamaSearchService.search(claim, provider.label, 'agent')
            : this.subSearchAgent.deepSearchWithModel(
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

      const successResults: AgentSearchResult[] = []
      const failedLabels: string[] = []
      const start = Date.now()

      const minSuccess = this.normalizeFastReturnMinSuccess(providers.length)
      const maxWaitMs = Math.max(
        1000,
        Math.min(this.config.factCheck.fastReturnMaxWaitMs ?? 12_000, this.config.factCheck.perSourceTimeout)
      )

      const targetConcurrency = minSuccess
      const active = new Map<number, Promise<ProviderTaskOutcome>>()
      let nextProviderIndex = 0

      const launchNext = (): boolean => {
        if (nextProviderIndex >= providers.length) return false

        const index = nextProviderIndex
        const provider = providers[index]
        nextProviderIndex += 1
        active.set(index, this.createProviderTask(claim, provider, index))
        return true
      }

      while (active.size < targetConcurrency && launchNext()) {
        // warm-up
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
          this.logger.warn(`[ChatlunaTool] ${outcome.provider.label} 失败: ${(outcome.reason as any)?.message || outcome.reason}`)
        }

        const elapsed = Date.now() - start
        if (successResults.length >= minSuccess) {
          this.logger.info(`[ChatlunaTool] 已获得 ${successResults.length} 个成功来源，提前返回`)
          break
        }

        if (elapsed < maxWaitMs) {
          while (active.size < targetConcurrency && launchNext()) {
            // fill slots
          }
        }
      }

      if (active.size > 0) {
        active.forEach((task, index) => {
          const provider = providers[index]
          this.trackBackgroundTask(task, provider?.label || `provider-${index}`)
        })
      }

      if (successResults.length === 0) {
        return `[MultiSourceSearch]\n搜索失败: ${failedLabels.join('、') || '全部来源不可用'}`
      }

      const output = this.formatMultiResults(successResults)
      const chatlunaContext = await this.buildChatlunaSearchContext(claim)
      const ollamaContext = await this.buildOllamaSearchContext(claim)
      this.logger.info(`[ChatlunaTool] Context append result: chatluna=${Boolean(chatlunaContext)}, ollama=${Boolean(ollamaContext)}`)

      const outputWithContext = this.appendContext(this.appendContext(output, chatlunaContext), ollamaContext)
      if (failedLabels.length > 0) {
        return `${outputWithContext}\n\n[Failed]\n- ${failedLabels.join('\n- ')}`
      }

      return outputWithContext
    } catch (error: any) {
      this.logger.error('[ChatlunaTool] 核查失败:', error)
      return `[MultiSourceSearch]\n搜索失败: ${error?.message || error}`
    }
  }

  static setHardTimeout(_ms: number): void {
    // reserved
  }
}

export function registerFactCheckTool(ctx: Ctx, config: PluginConfig): void {
  const logger = ctx.logger('chatluna-fact-check')

  if (!config.factCheck.enable) {
    logger.info('[ChatlunaTool] 已禁用工具注册')
    return
  }

  const chatluna = ctx.chatluna
  if (!chatluna?.platform?.registerTool) {
    logger.warn('[ChatlunaTool] chatluna.platform.registerTool 不可用，跳过注册')
    return
  }

  const quickToolName = config.factCheck.quickToolName?.trim() || 'fact_check'
  const quickToolDescription = config.factCheck.quickToolDescription?.trim()
    || '用于网络搜索与事实核查。输入待核查文本，返回来源与摘要。'

  ctx.effect(() => {
    const disposables: Array<() => void> = []

    if (config.factCheck.enableQuickTool) {
      logger.info(`[ChatlunaTool] 注册工具: ${quickToolName}`)

      const disposeQuick = chatluna.platform.registerTool(quickToolName, {
        createTool() {
          const tool = new FactCheckTool(ctx, config, quickToolName, quickToolDescription)
          const resolvedName = typeof tool.name === 'string' ? tool.name.trim() : ''
          if (!resolvedName) {
            ;(tool as any).name = 'fact_check'
            logger.warn('[ChatlunaTool] 检测到空工具名，已回退为 fact_check')
          }
          return tool
        },
        selector() {
          return true
        },
      })

      if (typeof disposeQuick === 'function') {
        disposables.push(disposeQuick)
      }
    } else {
      logger.warn('[ChatlunaTool] agent.enableQuickTool=false，未注册 fact_check 工具')
    }

    return () => {
      disposables.forEach((dispose) => dispose())
    }
  })
}
