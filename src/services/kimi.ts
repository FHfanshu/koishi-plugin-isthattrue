import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'

/**
 * Kimi 搜索服务
 * 使用 Kimi K2 的内置 $web_search 工具
 */
export class KimiSearchAgent {
  private apiKey: string
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.apiKey = config.kimiApiKey
    this.logger = ctx.logger('isthattrue')
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return !!this.apiKey
  }

  /**
   * 执行搜索
   */
  async search(query: string): Promise<SearchResult> {
    const startTime = Date.now()
    this.logger.info('[Kimi] 开始搜索:', query.substring(0, 50))

    try {
      const tools = [
        {
          type: 'builtin_function',
          function: {
            name: '$web_search',
          },
        },
      ]

      const messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [
        {
          role: 'system',
          content: '你是事实核查助手。请搜索验证以下声明的相关信息，返回搜索发现的关键证据。',
        },
        {
          role: 'user',
          content: `请搜索验证: "${query}"`,
        },
      ]

      let finishReason: string | null = null
      let finalContent = ''
      const sources: string[] = []

      // 循环处理工具调用
      while (finishReason === null || finishReason === 'tool_calls') {
        const response = await this.ctx.http.post<{
          choices: Array<{
            finish_reason: string
            message: {
              content: string | null
              role: string
              tool_calls?: Array<{
                id: string
                function: {
                  name: string
                  arguments: string
                }
              }>
            }
          }>
        }>(
          'https://api.moonshot.cn/v1/chat/completions',
          {
            model: 'kimi-k2-turbo-preview',
            messages,
            temperature: 0.6,
            tools,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.config.timeout,
          }
        )

        const choice = response.choices[0]
        finishReason = choice.finish_reason

        if (finishReason === 'tool_calls' && choice.message.tool_calls) {
          // 添加 assistant 消息
          messages.push(choice.message as any)

          // 处理每个工具调用
          for (const toolCall of choice.message.tool_calls) {
            const toolName = toolCall.function.name
            let toolResult: any

            if (toolName === '$web_search') {
              // Kimi 内置搜索会自动执行，我们只需返回参数确认
              const args = JSON.parse(toolCall.function.arguments)
              toolResult = args
              // 尝试从参数中提取 URL
              if (args.url) sources.push(args.url)
            } else {
              toolResult = { error: 'unknown tool' }
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify(toolResult),
            })
          }
        } else if (choice.message.content) {
          finalContent = choice.message.content
        }
      }

      const elapsed = Date.now() - startTime
      this.logger.info(`[Kimi] 搜索完成，耗时 ${elapsed}ms`)

      return {
        agentId: 'kimi',
        perspective: 'Kimi 网络搜索',
        findings: finalContent || '搜索完成但未返回内容',
        sources,
        confidence: finalContent ? 0.7 : 0.3,
      }
    } catch (error) {
      this.logger.error('[Kimi] 搜索失败:', error)
      return {
        agentId: 'kimi',
        perspective: 'Kimi 网络搜索',
        findings: `搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
      }
    }
  }
}
