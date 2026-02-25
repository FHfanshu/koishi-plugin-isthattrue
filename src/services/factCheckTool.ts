import { Tool } from '@langchain/core/tools'
import { Context } from 'koishi'
import { MainAgent } from '../agents'
import { Config } from '../config'
import { Verdict } from '../types'

const verdictLabel: Record<string, string> = {
  [Verdict.TRUE]: '真实',
  [Verdict.FALSE]: '虚假',
  [Verdict.PARTIALLY_TRUE]: '部分真实',
  [Verdict.UNCERTAIN]: '无法确定',
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
    this.logger = ctx.logger('isthattrue')
  }

  async _call(input: string): Promise<string> {
    const rawClaim = (input || '').trim()
    if (!rawClaim) {
      return JSON.stringify({
        ok: false,
        error: 'EMPTY_INPUT',
        message: '请输入需要核查的声明文本',
      })
    }

    const limit = this.config.chatlunaToolMaxInputChars
    const claim = rawClaim.substring(0, limit)
    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`)
    }

    try {
      this.logger.info('[ChatlunaTool] 收到事实核查请求')

      const mainAgent = new MainAgent(this.ctx, this.config)
      const result = await mainAgent.verify({
        text: claim,
        images: [],
        hasQuote: false,
      })

      const sources = result.sources.slice(0, this.config.chatlunaToolMaxSources)

      return JSON.stringify({
        ok: true,
        verdict: result.verdict,
        verdictLabel: verdictLabel[result.verdict] || result.verdict,
        confidence: Number(result.confidence.toFixed(3)),
        reasoning: result.reasoning,
        sources,
        processingTimeMs: result.processingTime,
      })
    } catch (error) {
      this.logger.error('[ChatlunaTool] 核查失败:', error)
      return JSON.stringify({
        ok: false,
        error: 'VERIFY_FAILED',
        message: (error as Error).message,
      })
    }
  }
}

export function registerFactCheckTool(ctx: Context, config: Config) {
  const logger = ctx.logger('isthattrue')

  if (!config.enableChatlunaTool) {
    logger.info('[ChatlunaTool] 已禁用工具注册')
    return
  }

  const chatluna = (ctx as any).chatluna
  if (!chatluna?.platform?.registerTool) {
    logger.warn('[ChatlunaTool] chatluna.platform.registerTool 不可用，跳过注册')
    return
  }

  const name = config.chatlunaToolName?.trim() || 'fact_check'
  const description = config.chatlunaToolDescription?.trim()
    || '用于事实核查。输入待验证声明文本，返回结论、置信度、判决依据和来源链接。'

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
