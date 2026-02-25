import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult, Verdict, VerificationResult, MessageContent } from '../types'
import { ChatlunaAdapter } from '../services/chatluna'
import {
  VERIFY_AGENT_SYSTEM_PROMPT,
  VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL,
  buildVerifyPrompt
} from '../utils/prompts'

/**
 * 验证Agent
 * 负责综合搜索结果并做出最终判决
 */
export class VerifyAgent {
  private chatluna: ChatlunaAdapter
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.chatluna = new ChatlunaAdapter(ctx, config)
    this.logger = ctx.logger('isthattrue')
  }

  /**
   * 执行验证判决
   * @param originalContent 原始消息内容
   * @param searchResults 搜索结果
   * @param images 可选的图片 base64 列表（多模态验证）
   */
  async verify(
    originalContent: MessageContent,
    searchResults: SearchResult[],
    images?: string[]
  ): Promise<VerificationResult> {
    const startTime = Date.now()
    const hasImages = images && images.length > 0
    this.logger.info(`开始综合验证...${hasImages ? ' (包含图片)' : ''}`)

    try {
      // 构建验证请求（默认使用完整搜索结果）
      let prompt = buildVerifyPrompt(
        originalContent.text,
        searchResults.map(r => ({
          perspective: r.perspective,
          findings: r.findings,
          sources: r.sources,
        })),
        hasImages  // 传递是否有图片
      )

      // 选择系统提示词（多模态或普通）
      const systemPrompt = hasImages
        ? VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL
        : VERIFY_AGENT_SYSTEM_PROMPT

      // 调用低幻觉率模型进行验证
      let response
      try {
        response = await this.chatluna.chatWithRetry(
          {
            model: this.config.mainModel,
            message: prompt,
            systemPrompt: systemPrompt,
            images: images,  // 传递图片
          },
          this.config.maxRetries
        )
      } catch (error) {
        // 如果首次验证失败，尝试缩短搜索结果后再请求一次
        this.logger.warn('验证请求失败，尝试使用压缩后的搜索结果重试...')
        const compactedResults = this.compactSearchResults(searchResults)
        prompt = buildVerifyPrompt(
          originalContent.text,
          compactedResults.map(r => ({
            perspective: r.perspective,
            findings: r.findings,
            sources: r.sources,
          })),
          hasImages
        )
        response = await this.chatluna.chatWithRetry(
          {
            model: this.config.mainModel,
            message: prompt,
            systemPrompt: systemPrompt,
            images: images,
          },
          0
        )
        // 用压缩结果参与输出与来源聚合，避免前端显示超长内容
        searchResults = compactedResults
      }

      // 解析验证结果
      const parsed = this.parseVerifyResponse(response.content)
      const processingTime = Date.now() - startTime

      const result: VerificationResult = {
        originalContent,
        searchResults,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        sources: this.aggregateSources(searchResults, parsed.sources),
        confidence: parsed.confidence,
        processingTime,
      }

      this.logger.info(`验证完成，判决: ${result.verdict}，可信度: ${result.confidence}`)

      return result
    } catch (error) {
      this.logger.error('验证失败:', error)

      return {
        originalContent,
        searchResults,
        verdict: Verdict.UNCERTAIN,
        reasoning: `验证过程发生错误: ${(error as Error).message}`,
        sources: this.aggregateSources(searchResults, []),
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  private compactSearchResults(searchResults: SearchResult[]): SearchResult[] {
    const maxFindingsChars = 800
    return searchResults.map(result => {
      let findings = result.findings || ''
      if (result.agentId === 'chatluna-search') {
        const summaryEndIndex = findings.indexOf('==============================')
        if (summaryEndIndex !== -1) {
          findings = findings.substring(0, summaryEndIndex + 32) + '\n\n(搜索详情已省略)'
        }
      }

      if (findings.length > maxFindingsChars) {
        findings = findings.substring(0, maxFindingsChars) + '...'
      }

      return { ...result, findings }
    })
  }

  /**
   * 解析验证响应
   */
  private parseVerifyResponse(content: string): {
    verdict: Verdict
    reasoning: string
    sources: string[]
    confidence: number
  } {
    try {
      // 提取JSON块
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
      let parsed: any

      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        // 尝试直接解析
        parsed = JSON.parse(content)
      }

      return {
        verdict: this.normalizeVerdict(parsed.verdict),
        reasoning: parsed.reasoning || parsed.key_evidence || '无详细说明',
        sources: parsed.sources || [],
        confidence: parsed.confidence ?? 0.5,
      }
    } catch {
      // 解析失败，尝试从文本中提取判决
      return {
        verdict: this.extractVerdictFromText(content),
        reasoning: content,
        sources: [],
        confidence: 0.3,
      }
    }
  }

  /**
   * 标准化判决结果
   */
  private normalizeVerdict(verdict: string): Verdict {
    const normalized = verdict?.toLowerCase()?.trim()

    const mapping: Record<string, Verdict> = {
      'true': Verdict.TRUE,
      '真实': Verdict.TRUE,
      '正确': Verdict.TRUE,
      'false': Verdict.FALSE,
      '虚假': Verdict.FALSE,
      '错误': Verdict.FALSE,
      'partially_true': Verdict.PARTIALLY_TRUE,
      'partial': Verdict.PARTIALLY_TRUE,
      '部分真实': Verdict.PARTIALLY_TRUE,
      'uncertain': Verdict.UNCERTAIN,
      '不确定': Verdict.UNCERTAIN,
      '无法确定': Verdict.UNCERTAIN,
    }

    return mapping[normalized] || Verdict.UNCERTAIN
  }

  /**
   * 从文本中提取判决
   */
  private extractVerdictFromText(text: string): Verdict {
    const lower = text.toLowerCase()

    if (lower.includes('虚假') || lower.includes('false') || lower.includes('错误')) {
      return Verdict.FALSE
    }
    if (lower.includes('部分真实') || lower.includes('partially')) {
      return Verdict.PARTIALLY_TRUE
    }
    if (lower.includes('真实') || lower.includes('true') || lower.includes('正确')) {
      return Verdict.TRUE
    }

    return Verdict.UNCERTAIN
  }

  /**
   * 汇总所有来源
   */
  private aggregateSources(
    searchResults: SearchResult[],
    verifySources: string[]
  ): string[] {
    const allSources = new Set<string>()

    for (const result of searchResults) {
      for (const source of result.sources) {
        allSources.add(source)
      }
    }

    for (const source of verifySources) {
      allSources.add(source)
    }

    return [...allSources]
  }
}
