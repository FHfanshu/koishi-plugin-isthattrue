import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'
import { ChatlunaAdapter } from '../services/chatluna'
import {
  DEEP_SEARCH_AGENT_SYSTEM_PROMPT,
  buildSubSearchPrompt,
} from '../utils/prompts'

/**
 * 子搜索 Agent
 * 专门负责深度搜索（主要使用 Grok，擅长 X/Twitter 搜索）
 * 独立搜索，不依赖其他搜索结果
 */
export class SubSearchAgent {
  private chatluna: ChatlunaAdapter
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.chatluna = new ChatlunaAdapter(ctx, config)
    this.logger = ctx.logger('chatluna-fact-check')
  }

  /**
   * 执行深度搜索
   * @param claim 原始声明文本
   */
  async deepSearch(claim: string): Promise<SearchResult> {
    return this.deepSearchWithModel(
      claim,
      this.config.agent.grokModel || 'x-ai/grok-4-1',
      'grok-deep-search',
      'Grok 深度搜索 (X/Twitter)'
    )
  }

  async deepSearchWithModel(
    claim: string,
    modelName: string,
    agentId = 'multi-search',
    perspective = '多源深度搜索',
    promptOverride?: string,
    systemPromptOverride?: string
  ): Promise<SearchResult> {
    this.logger.info(`[SubSearchAgent] 开始深度搜索，模型: ${modelName}`)

    try {
      const response = await this.chatluna.chatWithRetry(
        {
          model: modelName,
          message: promptOverride || buildSubSearchPrompt(claim),
          systemPrompt: systemPromptOverride || DEEP_SEARCH_AGENT_SYSTEM_PROMPT,
          enableSearch: true,
        },
        this.config.factCheck.maxRetries
      )

      // 解析响应
      const parsed = this.parseResponse(response.content)

      return {
        agentId,
        perspective,
        findings: parsed.findings || response.content,
        sources: parsed.sources || response.sources || [],
        confidence: parsed.confidence || 0.8,
      }
    } catch (error) {
      this.logger.error('[SubSearchAgent] 搜索失败:', error)
      return {
        agentId,
        perspective,
        findings: `深度搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: (error as Error).message,
      }
    }
  }

  private parseResponse(content: string): {
    findings?: string
    sources?: string[]
    confidence?: number
  } {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
      let parsed: any

      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        parsed = JSON.parse(content)
      }

      return {
        findings: parsed.findings,
        sources: parsed.sources,
        confidence: parsed.confidence,
      }
    } catch {
      return {}
    }
  }
}
