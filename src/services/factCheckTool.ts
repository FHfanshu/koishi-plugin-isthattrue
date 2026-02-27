import { Tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { Context } from 'koishi'
import { SubSearchAgent } from '../agents/subSearchAgent'
import { Config } from '../config'
import { SearchResult } from '../types'
import { ChatlunaAdapter } from './chatluna'
import { ChatlunaSearchAgent } from './chatlunaSearch'
import { OllamaSearchService } from './ollamaSearch'
import { hasEnabledApiProvider } from '../utils/apiConfig'
import { withTimeout } from '../utils/async'
import { truncate } from '../utils/text'
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

class FactCheckTool extends Tool {
  name: string
  description: string
  private logger
  private subSearchAgent: SubSearchAgent
  private ollamaSearchService: OllamaSearchService

  constructor(
    private ctx: Context,
    private config: Config,
    toolName: string,
    toolDescription: string
  ) {
    super()
    this.name = toolName
    this.description = toolDescription
    this.logger = ctx.logger('chatluna-fact-check')
    this.subSearchAgent = new SubSearchAgent(ctx, config)
    this.ollamaSearchService = new OllamaSearchService(ctx, config)
  }

  private getQuickProvider(): ToolSearchProvider | null {
    const explicit = this.config.agent.quickToolModel?.trim()
    const gemini = this.config.agent.geminiModel?.trim()
    const fallback = explicit || gemini
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
    claim: string,
    provider: ToolSearchProvider,
    index: number
  ): Promise<ProviderOutcome> {
    if (provider.key === 'ollama') {
      return withTimeout(
        this.ollamaSearchService.search(claim, 'OllamaSearch', 'agent'),
        this.config.agent.ollamaSearchTimeout,
        provider.label
      )
        .then((value): ProviderOutcome => ({ index, provider, status: 'fulfilled', value }))
        .catch((reason): ProviderOutcome => ({ index, provider, status: 'rejected', reason }))
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

    const grokModel = this.config.agent.grokModel?.trim()
    if (grokModel) {
      providers.push({ key: 'grok', label: 'GrokSearch', model: grokModel })
    }

    const geminiModel = this.config.agent.geminiModel?.trim()
    if (geminiModel) {
      providers.push({ key: 'gemini', label: 'GeminiSearch', model: geminiModel })
    }

    const chatgptModel = this.config.agent.chatgptModel?.trim()
    if (chatgptModel) {
      providers.push({ key: 'chatgpt', label: 'ChatGPTSearch', model: chatgptModel })
    }

    if (hasEnabledApiProvider(this.config, 'ollama')) {
      providers.push({
        key: 'ollama',
        label: 'OllamaSearch',
        model: 'ollama-search-api',
      })
    }

    return providers
  }



  private formatSingleResult(result: SearchResult): string {
    const findings = truncate(result.findings, this.config.agent.maxFindingsChars, '无可用搜索结果')
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
      parts.push(truncate(result.findings, this.config.agent.maxFindingsChars, '无可用搜索结果'))
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
    const findings = truncate(
      result.findings,
      this.config.agent.chatlunaSearchContextMaxChars,
      '无可用搜索结果'
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

    const chatlunaSearchAgent = new ChatlunaSearchAgent(this.ctx, this.config)
    if (!chatlunaSearchAgent.isAvailable()) {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: skipped (chatluna-search-service unavailable)')
      return null
    }

    try {
      this.logger.info('[ChatlunaTool] ChatlunaSearchContext: invoking chatluna-search-service')
      const searchResult = await withTimeout(
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
    const findings = truncate(
      result.findings,
      this.config.agent.ollamaSearchContextMaxChars,
      '无可用搜索结果'
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

    try {
      const searchResult = await withTimeout(
        this.ollamaSearchService.search(claim, 'Ollama Search 上下文', 'agent'),
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

  /** 工具整体硬超时（毫秒），必须低于 chatluna-character 的 lock timeout (180s) */
  private static readonly HARD_TIMEOUT_MS = 120_000

  /** 异步模式下后台任务的宽松超时（毫秒） */
  private static readonly ASYNC_TIMEOUT_MS = 5 * 60_000

  async _call(
    input: string,
    _runManager?: CallbackManagerForToolRun,
    config?: RunnableConfig
  ): Promise<string> {
    const rawClaim = (input || '').trim()
    if (!rawClaim) {
      return '[GrokSearch]\n输入为空，请提供需要检索的文本。'
    }

    // 异步模式：秒返 + 后台执行 + session.send() 推送结果
    const session = (config as any)?.configurable?.session
    if (this.config.agent.asyncMode && session) {
      this.logger.info('[ChatlunaTool] 异步模式启动')
      this.executeAsync(rawClaim, session)
      return '[FactCheck]\n搜索任务已在后台启动，结果将稍后自动发送到本会话。请基于当前已有信息回答用户，不要猜测搜索结果。'
    }

    // 同步模式：硬超时兜底
    try {
      return await withTimeout(
        this._callInner(rawClaim),
        FactCheckTool.HARD_TIMEOUT_MS,
        'FactCheck 整体'
      )
    } catch (error) {
      this.logger.error('[ChatlunaTool] 核查失败（可能超时）:', error)
      return `[FactCheck]\n搜索失败: ${(error as Error).message}`
    }
  }

  /**
   * 异步后台执行：不阻塞工具返回，完成后通过 session.send() 推送结果。
   * 返回 void；错误在内部处理，不抛出。
   */
  private executeAsync(rawClaim: string, session: any): void {
    withTimeout(
      this._callInner(rawClaim),
      FactCheckTool.ASYNC_TIMEOUT_MS,
      'FactCheck 异步'
    )
      .then(async (result) => {
        const summaryModel = this.config.agent.asyncResultSummaryModel?.trim()
        if (summaryModel) {
          try {
            const chatluna = new ChatlunaAdapter(this.ctx, this.config)
            const summary = await withTimeout(
              chatluna.chat({
                model: summaryModel,
                systemPrompt: '你是一个信息汇总助手。请将以下来自多个来源的搜索结果整合成清晰易读的自然语言回答。要求：保留关键信息和数据，去除格式标签（如[GeminiSearch]等），不要重复相同内容，用分段或列表组织，末尾附来源链接。',
                message: `问题：${rawClaim}\n\n${result}`,
              }),
              30000,
              'AsyncResultSummary'
            )
            return session.send(summary.content)
          } catch (summaryErr) {
            this.logger.warn('[ChatlunaTool] 异步结果汇总失败，回退到原始结果:', (summaryErr as Error).message)
          }
        }
        return session.send(`[FactCheck 异步结果]\n${result}`)
      })
      .catch((error: Error) => {
        this.logger.error('[ChatlunaTool] 异步执行失败:', error)
        return session.send(`[FactCheck 异步结果]\n搜索失败: ${error.message}`).catch(() => {})
      })
      .catch(() => {
        // session.send 失败（如会话已过期），静默忽略
      })
  }

  private async _callInner(rawClaim: string): Promise<string> {
    const limit = this.config.agent.maxInputChars
    const claim = rawClaim.substring(0, limit)
    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`)
    }

    try {
      this.logger.info('[ChatlunaTool] 收到事实核查请求')

      const providers = this.config.agent.enableMultiSourceSearch
        ? this.getToolProviders()
        : (() => {
            const provider = this.getQuickProvider()
            return provider ? [provider] : []
          })()

      this.logger.info(`[ChatlunaTool] providers=${providers.map(p => `${p.key}:${p.model}`).join(', ') || 'none'}`)

      if (providers.length === 0) {
        return '[FactCheck]\n搜索失败: 未配置可用搜索来源。请配置 agent.grokModel / agent.geminiModel / agent.chatgptModel，或在 api.apiKeys 启用 ollama。'
      }

      if (!this.config.agent.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0]
        const timeout = this.config.agent.enableMultiSourceSearch
          ? this.config.agent.perSourceTimeout
          : this.config.agent.quickToolTimeout
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
        active.set(index, this.createProviderTask(claim, provider, index))
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

  /** 供外部配置覆盖硬超时（测试/调试用） */
  static setHardTimeout(_ms: number) {
    // reserved
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

  const quickToolName = config.agent.quickToolName?.trim() || 'fact_check'
  const quickToolDescription = config.agent.quickToolDescription?.trim()
    || '用于网络搜索与事实核查。输入待核查文本，返回来源与摘要。'

  ctx.effect(() => {
    const disposables: Array<() => void> = []

    if (config.agent.enableQuickTool) {
      logger.info(`[ChatlunaTool] 注册工具: ${quickToolName}`)
      const disposeQuick = chatluna.platform.registerTool(quickToolName, {
        createTool() {
          return new FactCheckTool(ctx, config, quickToolName, quickToolDescription)
        },
        selector() {
          return true
        },
      })
      if (typeof disposeQuick === 'function') {
        disposables.push(disposeQuick)
      }
    }

    if (!config.agent.enableQuickTool) {
      logger.warn('[ChatlunaTool] agent.enableQuickTool=false，未注册 fact_check 工具')
    }

    return () => {
      disposables.forEach(dispose => dispose())
    }
  })
}
