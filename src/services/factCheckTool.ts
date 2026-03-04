import { Tool } from '@langchain/core/tools'

import { SubSearchAgent } from '../agents/subSearchAgent'
import { withTimeout } from '../utils/async'
import { buildFactCheckToolSearchPrompt, FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT } from '../utils/prompts'
import { maybeSummarize } from '../utils/summary'
import { truncate } from '../utils/text'

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
  static HARD_TIMEOUT_MS = 600_000

  name: string
  description: string

  private readonly logger: any
  private readonly subSearchAgent: SubSearchAgent
  private readonly backgroundTasks = new Set<Promise<ProviderTaskOutcome>>()

  constructor(
    private readonly ctx: Ctx,
    private readonly config: PluginConfig,
    toolName: string,
    toolDescription: string
  ) {
    super()
    this.name = sanitizeToolName(toolName, 'fact_check')
    this.description = sanitizeToolDescription(toolDescription, '用于网络搜索与事实核查。输入待核查文本,返回来源与摘要。')
    this.logger = ctx.logger('chatluna-fact-check')
    this.subSearchAgent = new SubSearchAgent(ctx, config)
  }

  private getQuickProvider(): ToolProvider | null {
    const gemini = this.config.models.geminiModel?.trim()
    if (!gemini) return null

    return {
      key: 'gemini',
      label: 'GeminiWebSearch',
      model: gemini,
    }
  }

  private normalizeFastReturnMinSuccess(providerCount: number): number {
    const configured = this.config.search.fastReturnMinSuccess ?? 2
    return Math.max(1, Math.min(configured, providerCount))
  }

  private getFastReturnPreferredProvider(): ProviderKey | null {
    const configured = this.config.search.fastReturnPreferredProvider
    return configured === 'grok' || configured === 'gemini' ? configured : null
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
    return withTimeout(
      this.subSearchAgent.deepSearchWithModel(
        claim,
        provider.model,
        `tool-${provider.key}`,
        provider.label,
        buildFactCheckToolSearchPrompt(claim),
        FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
      ),
      this.config.search.perSourceTimeout * 1000,
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

    const grokModel = this.config.models.grokModel?.trim()
    if (grokModel) providers.push({ key: 'grok', label: 'GrokSearch', model: grokModel })

    const geminiModel = this.config.models.geminiModel?.trim()
    if (geminiModel) providers.push({ key: 'gemini', label: 'GeminiSearch', model: geminiModel })

    return providers
  }

  private formatSingleResult(result: AgentSearchResult): string {
    const findings = this.toShortLine(result.findings, Math.min(this.config.search.maxFindingsChars, 600))
    const confidence = Number.isFinite(result.confidence)
      ? `${Math.round(result.confidence * 100)}%`
      : '未知'

    const sourceText = this.formatSourcesForContext(result.sources, this.config.tools.maxSources)

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
      parts.push(`  关键发现: ${this.toShortLine(result.findings, Math.min(this.config.search.maxFindingsChars, 400))}`)

      for (const source of result.sources) {
        if (source) allSources.add(source)
      }
    }

    const dedupedSources = [...allSources].slice(0, this.config.tools.maxSources)
    parts.push('[Sources]')
    parts.push(this.formatSourcesForContext(dedupedSources, this.config.tools.maxSources))
    return parts.join('\n')
  }

  async _call(input: string): Promise<string> {
    const rawClaim = (input || '').trim()
    if (!rawClaim) {
      return '[GrokSearch]\n输入为空，请提供需要检索的文本。'
    }

    try {
      return await withTimeout(this._callInner(rawClaim), this.getHardTimeoutMs(), 'FactCheck 整体')
    } catch (error: any) {
      this.logger.error('[ChatlunaTool] 核查失败（可能超时）:', error)
      return `[FactCheck]\n搜索失败: ${error?.message || error}`
    }
  }

  private getHardTimeoutMs(): number {
    const perSourceTimeoutMs = this.config.search.perSourceTimeout * 1000
    const providerCount = this.config.search.enableMultiSourceSearch
      ? this.getToolProviders().length
      : (this.getQuickProvider() ? 1 : 0)

    const estimated = Math.max(60_000, perSourceTimeoutMs * Math.max(1, providerCount) + 30_000)
    return Math.min(Math.max(estimated, 120_000), FactCheckTool.HARD_TIMEOUT_MS)
  }

  private async _callInner(rawClaim: string): Promise<string> {
    const limit = this.config.tools.maxInputChars
    const claim = rawClaim.substring(0, limit)

    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`)
    }

    try {
      this.logger.info('[ChatlunaTool] 收到事实核查请求')

      const providers = this.config.search.enableMultiSourceSearch
        ? this.getToolProviders()
        : (() => {
            const provider = this.getQuickProvider()
            return provider ? [provider] : []
          })()

      this.logger.info(`[ChatlunaTool] providers=${providers.map((p) => `${p.key}:${p.model}`).join(', ') || 'none'}`)

      if (providers.length === 0) {
        return '[FactCheck]\n搜索失败: 未配置可用搜索来源。请配置 models.grokModel / models.geminiModel。'
      }

      if (!this.config.search.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0]

        const result = await withTimeout(
          this.subSearchAgent.deepSearchWithModel(
            claim,
            provider.model,
            `tool-${provider.key}`,
            provider.label,
            buildFactCheckToolSearchPrompt(claim),
            FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
          ),
          this.config.search.perSourceTimeout * 1000,
          provider.label
        )

        if (result.failed) {
          return `[${provider.label}]\n搜索失败: ${result.error || result.findings}`
        }

        return this.summarizeOutput(this.formatSingleResult(result), 'fact_check(single)')
      }

      const successResults: AgentSearchResult[] = []
      const failedLabels: string[] = []
      const start = Date.now()

      const minSuccess = this.normalizeFastReturnMinSuccess(providers.length)
      const preferredProvider = this.getFastReturnPreferredProvider()
      const shouldWaitPreferred = !!preferredProvider && providers.some((p) => p.key === preferredProvider)
      let preferredProviderSucceeded = false
      const maxWaitMs = Math.max(
        1000,
        Math.min((this.config.search.fastReturnMaxWait ?? 12) * 1000, this.config.search.perSourceTimeout * 1000)
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
            if (shouldWaitPreferred && outcome.provider.key === preferredProvider) {
              preferredProviderSucceeded = true
              this.logger.info(`[ChatlunaTool] 优先来源 ${outcome.provider.label} 已成功，提前返回`)
              break
            }
          }
        } else {
          failedLabels.push(outcome.provider.label)
          this.logger.warn(`[ChatlunaTool] ${outcome.provider.label} 失败: ${(outcome.reason as any)?.message || outcome.reason}`)
        }

        const elapsed = Date.now() - start
        if (successResults.length >= minSuccess) {
          if (shouldWaitPreferred && !preferredProviderSucceeded) {
            this.logger.info(
              `[ChatlunaTool] 已获得 ${successResults.length} 个成功来源，但仍等待优先来源 ${preferredProvider}`
            )
          } else {
          this.logger.info(`[ChatlunaTool] 已获得 ${successResults.length} 个成功来源，提前返回`)
          break
          }
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
      if (failedLabels.length > 0) {
        return this.summarizeOutput(`${output}\n\n[Failed]\n- ${failedLabels.join('\n- ')}`, 'fact_check(multi)')
      }

      return this.summarizeOutput(output, 'fact_check(multi)')
    } catch (error: any) {
      this.logger.error('[ChatlunaTool] 核查失败:', error)
      return `[MultiSourceSearch]\n搜索失败: ${error?.message || error}`
    }
  }

  private async summarizeOutput(output: string, label: string): Promise<string> {
    return maybeSummarize(this.ctx, this.config, output, label)
  }

  static setHardTimeout(_ms: number): void {
    // reserved
  }
}

export function registerFactCheckTool(ctx: Ctx, config: PluginConfig): void {
  const logger = ctx.logger('chatluna-fact-check')

  if (!config.tools.factCheckEnable) {
    logger.info('[ChatlunaTool] 已禁用工具注册')
    return
  }

  const chatluna = ctx.chatluna
  if (!chatluna?.platform?.registerTool) {
    logger.warn('[ChatlunaTool] chatluna.platform.registerTool 不可用，跳过注册')
    return
  }

  const quickToolName = sanitizeToolName(config.tools.quickToolName, 'fact_check')
  const quickToolDescription = sanitizeToolDescription(
    config.tools.quickToolDescription,
    '用于网络搜索与事实核查。输入待核查文本，返回来源与摘要。'
  )

  ctx.effect(() => {
    const disposables: Array<() => void> = []

    if (config.tools.enableQuickTool) {
      logger.info(`[ChatlunaTool] 注册工具: ${quickToolName}`)

      const disposeQuick = chatluna.platform.registerTool(quickToolName, {
        createTool() {
          const tool = new FactCheckTool(ctx, config, quickToolName, quickToolDescription)
          const resolvedName = sanitizeToolName(tool.name, '')
          if (!resolvedName) {
            tool.name = 'fact_check'
            logger.warn('[ChatlunaTool] 检测到空工具名，已回退为 fact_check')
          }

          tool.description = sanitizeToolDescription(
            tool.description,
            '用于网络搜索与事实核查。输入待核查文本，返回来源与摘要。'
          )
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
      logger.warn('[ChatlunaTool] tools.enableQuickTool=false，未注册 fact_check 工具')
    }

    return () => {
      disposables.forEach((dispose) => dispose())
    }
  })
}

function sanitizeToolName(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    return fallback
  }

  const normalized = text
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)

  return normalized || fallback
}

function sanitizeToolDescription(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}
