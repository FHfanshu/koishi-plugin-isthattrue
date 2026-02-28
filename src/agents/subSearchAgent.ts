import { ChatlunaAdapter } from '../services/chatluna'
import { buildSubSearchPrompt, DEEP_SEARCH_AGENT_SYSTEM_PROMPT } from '../utils/prompts'

import type { AgentSearchResult, PluginConfig } from '../types'

type Ctx = any

interface ParsedSubSearchResponse {
  findings?: string
  sources?: string[]
  confidence?: number
}

export class SubSearchAgent {
  private readonly chatluna: ChatlunaAdapter
  private readonly logger: any

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.chatluna = new ChatlunaAdapter(ctx, config)
    this.logger = ctx.logger('chatluna-fact-check')
  }

  async deepSearch(claim: string): Promise<AgentSearchResult> {
    return this.deepSearchWithModel(
      claim,
      this.config.factCheck.grokModel || 'x-ai/grok-4-1',
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
  ): Promise<AgentSearchResult> {
    this.logger.info(`[SubSearchAgent] 开始深度搜索，模型: ${modelName}`)

    try {
      const response = await this.chatluna.chatWithRetry(
        {
          model: modelName,
          message: promptOverride || buildSubSearchPrompt(claim),
          systemPrompt: systemPromptOverride || DEEP_SEARCH_AGENT_SYSTEM_PROMPT,
          enableSearch: true,
        },
        this.config.debug.maxRetries
      )

      const parsed = this.parseResponse(response.content)
      const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(parsed.confidence, 1))
        : 0.3

      return {
        agentId,
        perspective,
        findings: parsed.findings || response.content,
        sources: parsed.sources || response.sources || [],
        confidence,
      }
    } catch (error: any) {
      this.logger.error('[SubSearchAgent] 搜索失败:', error)
      return {
        agentId,
        perspective,
        findings: `深度搜索失败: ${error?.message || error}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: error?.message || String(error),
      }
    }
  }

  private parseResponse(content: string): ParsedSubSearchResponse {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
      const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(content)

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
