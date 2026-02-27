import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult, VerificationResult, MessageContent, Verdict } from '../types'
import { SubSearchAgent } from './subSearchAgent'
import { VerifyAgent } from './verifyAgent'
import { DeepSearchController } from './deepSearchController'
import { ChatlunaSearchAgent } from '../services/chatlunaSearch'
import { ChatlunaAdapter } from '../services/chatluna'
import { MessageParser } from '../services/messageParser'
import { IMAGE_DESCRIPTION_PROMPT } from '../utils/prompts'

/**
 * 主控 Agent
 * 流程：DeepSearch(可选) / 并行搜索 -> URL处理 -> Gemini判决
 */
export class MainAgent {
  private subSearchAgent: SubSearchAgent
  private chatlunaSearchAgent: ChatlunaSearchAgent
  private verifyAgent: VerifyAgent
  private chatluna: ChatlunaAdapter
  private messageParser: MessageParser
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.subSearchAgent = new SubSearchAgent(ctx, config)
    this.chatlunaSearchAgent = new ChatlunaSearchAgent(ctx, config)
    this.verifyAgent = new VerifyAgent(ctx, config)
    this.chatluna = new ChatlunaAdapter(ctx, config)
    this.messageParser = new MessageParser(ctx, {
      imageTimeoutMs: Math.min(config.tof.timeout, 30000),
      maxImageBytes: 8 * 1024 * 1024,
      tofConfig: config.tof,
    })
    this.logger = ctx.logger('chatluna-fact-check')
  }

  /**
   * 执行完整的核查流程
   */
  async verify(content: MessageContent): Promise<VerificationResult> {
    const startTime = Date.now()
    this.logger.info('开始主控 Agent 核查流程...')

    try {
      // 准备图片 base64
      let imageBase64List: string[] = []
      if (content.images.length > 0) {
        this.logger.info(`[Phase 0] 处理 ${content.images.length} 张图片...`)
        const prepared = await this.messageParser.prepareForLLM(content)
        imageBase64List = prepared.imageBase64List
        this.logger.info(`[Phase 0] 成功转换 ${imageBase64List.length} 张图片为 base64`)
      }

      // 确定搜索用的文本
      let searchText = content.text

      // 如果是纯图片（没有文本），先让 Gemini 描述图片
      if (!content.text.trim() && imageBase64List.length > 0) {
        this.logger.info('[Phase 0] 纯图片输入，提取图片描述...')
        searchText = await this.extractImageDescription(imageBase64List)
        this.logger.info(`[Phase 0] 图片描述：${searchText.substring(0, 100)}...`)
      }

      // Phase 1+2: 搜索证据（DeepSearch 模式优先，失败自动回退旧并行模式）
      const searchResults = await this.searchEvidence(searchText)
      this.logger.info(`[Phase 1+2] 搜索完成，成功 ${searchResults.length} 个`)

      // 如果没有任何搜索结果，返回不确定
      if (searchResults.length === 0) {
        return {
          originalContent: content,
          searchResults: [],
          verdict: Verdict.UNCERTAIN,
          reasoning: '所有搜索都失败了，无法验证',
          sources: [],
          confidence: 0,
          processingTime: Date.now() - startTime,
        }
      }

      // Phase 3: Gemini 综合判决 (传递原图)
      this.logger.info('[Phase 3] Gemini 判决中...')
      const finalResult = await this.verifyAgent.verify(
        content,
        searchResults,
        imageBase64List
      )

      return {
        ...finalResult,
        processingTime: Date.now() - startTime,
      }

    } catch (error) {
      this.logger.error('主控 Agent 流程出错:', error)
      return {
        originalContent: content,
        searchResults: [],
        verdict: Verdict.UNCERTAIN,
        reasoning: `流程执行失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
      }
    }
  }

  private async searchEvidence(searchText: string): Promise<SearchResult[]> {
    if (this.config.deepSearch.enable) {
      this.logger.info('[Phase 1+2] DeepSearch 迭代搜索中...')
      try {
        const controller = new DeepSearchController(this.ctx, this.config, this.chatluna)
        const report = await this.withTimeout(
          controller.search(searchText),
          this.config.deepSearch.maxIterations * this.config.deepSearch.perIterationTimeout + 5000,
          'DeepSearch'
        )
        if (!report) {
          throw new Error('DeepSearch 超时或无返回结果')
        }

        const keyFindings = report.keyFindings.length > 0
          ? report.keyFindings.slice(0, 6).map((item, index) => `${index + 1}. ${item}`).join('\n')
          : '无'

        return [{
          agentId: 'deep-search-controller',
          perspective: `DeepSearch 迭代搜索 (${report.rounds}轮)`,
          findings: `摘要: ${report.summary}\n\n关键发现:\n${keyFindings}\n\n结论: ${report.conclusion}`,
          sources: report.sources,
          confidence: report.confidence,
        }]
      } catch (error) {
        this.logger.warn(`[Phase 1+2] DeepSearch 失败，回退旧并行搜索: ${(error as Error).message}`)
      }
    }

    return this.searchEvidenceLegacy(searchText)
  }

  private async searchEvidenceLegacy(searchText: string): Promise<SearchResult[]> {
    this.logger.info('[Phase 1+2] 并行搜索中 (Chatluna + Grok)...')

    const searchTasks: Array<{ name: string; promise: Promise<SearchResult | null> }> = []

    if (this.chatlunaSearchAgent.isAvailable() && this.config.tof.enableChatlunaSearch) {
      searchTasks.push({
        name: 'ChatlunaSearch',
        promise: this.withTimeout(
          this.chatlunaSearchAgent.search(searchText),
          this.config.tof.timeout,
          'ChatlunaSearch'
        )
      })
    }

    searchTasks.push({
      name: 'GrokSearch',
      promise: this.withTimeout(
        this.subSearchAgent.deepSearch(searchText),
        this.config.tof.timeout,
        'GrokSearch'
      )
    })

    const results = await Promise.allSettled(searchTasks.map(t => t.promise))

    const allSearchResults: SearchResult[] = results
      .filter((r): r is PromiseFulfilledResult<SearchResult | null> =>
        r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value!)

    const searchResults = allSearchResults.filter(result => !result.failed)

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(`搜索 ${searchTasks[i]?.name || i} 失败: ${r.reason}`)
      }
    })

    allSearchResults
      .filter(result => result.failed)
      .forEach(result => {
        this.logger.warn(`搜索 ${result.perspective} 失败: ${result.error || result.findings}`)
      })

    return searchResults
  }

  /**
   * 带超时的 Promise 包装
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    name: string
  ): Promise<T | null> {
    let timer: NodeJS.Timeout | null = null
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          timer = setTimeout(() => reject(new Error(`${name} 超时`)), timeout)
        )
      ])
    } catch (error) {
      this.logger.warn(`[${name}] 失败: ${(error as Error).message}`)
      return null
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  /**
   * 从图片中提取描述（用于纯图片输入场景）
   */
  private async extractImageDescription(images: string[]): Promise<string> {
    try {
      const response = await this.chatluna.chat({
        model: this.config.tof.model,
        message: IMAGE_DESCRIPTION_PROMPT,
        images: images,
      })
      return response.content
    } catch (error) {
      this.logger.error('图片描述提取失败:', error)
      return '图片内容需要验证'
    }
  }
}
