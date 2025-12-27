import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult, VerificationResult, MessageContent, Verdict } from '../types'
import { SubSearchAgent } from './subSearchAgent'
import { VerifyAgent } from './verifyAgent'
import { ChatlunaSearchAgent } from '../services/chatlunaSearch'
import { ChatlunaAdapter } from '../services/chatluna'
import { MessageParser } from '../services/messageParser'
import { injectCensorshipBypass } from '../utils/url'
import { IMAGE_DESCRIPTION_PROMPT } from '../utils/prompts'

/**
 * 主控 Agent
 * 流程：并行搜索 (Chatluna + Grok) -> URL处理 -> Gemini判决
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
    this.messageParser = new MessageParser(ctx)
    this.logger = ctx.logger('isthattrue')
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

      // Phase 1+2: 并行执行搜索
      this.logger.info('[Phase 1+2] 并行搜索中 (Chatluna + Grok)...')

      const searchPromises: Promise<SearchResult | null>[] = []

      // Chatluna 搜索 (通用网页)
      if (this.chatlunaSearchAgent.isAvailable()) {
        searchPromises.push(
          this.withTimeout(
            this.chatlunaSearchAgent.search(searchText),
            this.config.timeout,
            'ChatlunaSearch'
          )
        )
      }

      // Grok 深度搜索 (独立，专注 X/Twitter)
      searchPromises.push(
        this.withTimeout(
          this.subSearchAgent.deepSearch(searchText),
          this.config.timeout,
          'GrokSearch'
        )
      )

      const results = await Promise.allSettled(searchPromises)

      // 收集成功的结果
      const searchResults: SearchResult[] = results
        .filter((r): r is PromiseFulfilledResult<SearchResult | null> =>
          r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value!)

      // 记录失败的搜索
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          this.logger.warn(`搜索 ${i === 0 ? 'Chatluna' : 'Grok'} 失败: ${r.reason}`)
        }
      })

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

      // 对所有结果进行 URL 混淆处理
      const processedResults = searchResults.map(r => ({
        ...r,
        findings: injectCensorshipBypass(r.findings)
      }))

      // Phase 3: Gemini 综合判决 (传递原图)
      this.logger.info('[Phase 3] Gemini 判决中...')
      const finalResult = await this.verifyAgent.verify(
        content,
        processedResults,
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

  /**
   * 带超时的 Promise 包装
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    name: string
  ): Promise<T | null> {
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${name} 超时`)), timeout)
        )
      ])
    } catch (error) {
      this.logger.warn(`[${name}] 失败: ${(error as Error).message}`)
      return null
    }
  }

  /**
   * 从图片中提取描述（用于纯图片输入场景）
   */
  private async extractImageDescription(images: string[]): Promise<string> {
    try {
      const response = await this.chatluna.chat({
        model: this.config.mainModel,
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
