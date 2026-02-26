import { Tool } from '@langchain/core/tools'
import { Context } from 'koishi'
import { SubSearchAgent } from '../agents/subSearchAgent'
import { Config } from '../config'
import { SearchResult } from '../types'
import {
  FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT,
  buildFactCheckToolSearchPrompt,
} from '../utils/prompts'

interface ToolSearchProvider {
  key: 'grok' | 'gemini' | 'chatgpt' | 'deepseek'
  label: string
  model: string
}

class FactCheckTool extends Tool {
  name: string
  description: string
  private logger

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

    const deepseekModel = this.config.agent.deepseekModel?.trim()
    if (this.config.agent.searchUseDeepseek && deepseekModel) {
      providers.push({ key: 'deepseek', label: 'DeepSeekSearch', model: deepseekModel })
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
      const providers = this.getToolProviders()

      if (!this.config.agent.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0]
        const result = await this.withTimeout(
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
        if (result.failed) {
          return `[${provider.label}]\n搜索失败: ${result.error || result.findings}`
        }
        return this.formatSingleResult(result)
      }

      const settled = await Promise.allSettled(
        providers.map(provider =>
          this.withTimeout(
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
        )
      )

      const successResults: SearchResult[] = []
      const failedLabels: string[] = []

      settled.forEach((item, index) => {
        const provider = providers[index]
        if (item.status === 'fulfilled') {
          if (item.value.failed) {
            failedLabels.push(provider.label)
            this.logger.warn(`[ChatlunaTool] ${provider.label} 失败: ${item.value.error || item.value.findings}`)
          } else {
            successResults.push(item.value)
          }
        } else {
          failedLabels.push(provider.label)
          this.logger.warn(`[ChatlunaTool] ${provider.label} 失败: ${(item.reason as Error)?.message || item.reason}`)
        }
      })

      if (successResults.length === 0) {
        return `[MultiSourceSearch]\n搜索失败: ${failedLabels.join('、') || '全部来源不可用'}`
      }

      const output = this.formatMultiResults(successResults)
      if (failedLabels.length > 0) {
        return `${output}\n\n[Failed]\n- ${failedLabels.join('\n- ')}`
      }
      return output
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

  const name = config.agent.name?.trim() || 'fact_check'
  const description = config.agent.description?.trim()
    || '用于 LLM 网络搜索（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/DeepSeek），由上层 Agent 自行判断。'

  ctx.effect(() => {
    logger.info(`[ChatlunaTool] 注册工具: ${name}`)
    return chatluna.platform.registerTool(name, {
      createTool() {
        return new FactCheckTool(ctx, config, name, description)
      },
      selector() {
        return true
      },
    })
  })
}
