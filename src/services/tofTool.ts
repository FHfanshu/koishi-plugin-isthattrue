import { Tool } from '@langchain/core/tools'
import { Context } from 'koishi'
import { MainAgent } from '../agents'
import type { Config } from '../config'
import { Verdict } from '../types'

class TofTool extends Tool {
  name: string
  description: string
  private logger

  constructor(
    private ctx: Context,
    private mainAgent: MainAgent,
    toolName: string,
    toolDescription: string
  ) {
    super()
    this.name = toolName
    this.description = toolDescription
    this.logger = ctx.logger('isthattrue')
  }

  async _call(input: string): Promise<string> {
    const text = (input || '').trim()
    if (!text) {
      return '请输入需要核查的文本内容。'
    }

    try {
      const result = await this.mainAgent.verify({ text, images: [], hasQuote: false })

      const verdictLabel: Record<Verdict, string> = {
        [Verdict.TRUE]: '真实',
        [Verdict.FALSE]: '虚假',
        [Verdict.PARTIALLY_TRUE]: '部分真实',
        [Verdict.UNCERTAIN]: '无法确定',
      }

      const confidence = Math.round(result.confidence * 100)
      const reasoning = result.reasoning?.trim() || '无'
      const sources = result.sources?.length
        ? result.sources.slice(0, 8).map(s => `- ${s}`).join('\n')
        : '- 无'

      return [
        `[tof] 判定: ${verdictLabel[result.verdict]} (${confidence}%)`,
        '',
        '[reasoning]',
        reasoning,
        '',
        '[sources]',
        sources,
      ].join('\n')
    } catch (error) {
      this.logger.error('[tof-tool] 核查失败:', error)
      return `tof 工具执行失败: ${(error as Error).message}`
    }
  }
}

export function registerTofTool(ctx: Context, config: Config, mainAgent: MainAgent) {
  const logger = ctx.logger('isthattrue')
  const chatluna = ctx.chatluna

  if (!chatluna?.platform?.registerTool) {
    logger.warn('[tof-tool] chatluna.platform.registerTool 不可用，跳过 tof 工具注册')
    return
  }

  const toolName = 'tof'
  const toolDescription = '用于事实核查。输入待验证的文本，返回结论、置信度、依据和来源链接。'

  ctx.effect(() => {
    logger.info('[tof-tool] 注册 ChatLuna 工具: tof')
    const dispose = (chatluna as any).platform.registerTool(toolName, {
      createTool() {
        return new TofTool(ctx, mainAgent, toolName, toolDescription)
      },
      selector() {
        return true
      },
    })

    return () => {
      if (typeof dispose === 'function') {
        dispose()
      }
    }
  })
}
