import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'

/**
 * 智谱 GLM Web Search 服务
 * 使用独立的 Web Search API
 */
export class ZhipuSearchAgent {
  private apiKey: string
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.apiKey = (config as any).zhipuApiKey || ''
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
    this.logger.info('[智谱] 开始搜索:', query.substring(0, 50))

    try {
      const response = await this.ctx.http.post<{
        search_result: Array<{
          title: string
          content: string
          link: string
          media?: string
        }>
        request_id: string
      }>(
        'https://open.bigmodel.cn/api/paas/v4/web_search',
        {
          search_query: query,
          search_engine: 'search_pro', // 使用增强版搜索
          count: 5,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.config.timeout,
        }
      )

      const elapsed = Date.now() - startTime
      this.logger.info(`[智谱] 搜索完成，耗时 ${elapsed}ms，结果数: ${response.search_result?.length || 0}`)

      if (!response.search_result || response.search_result.length === 0) {
        return {
          agentId: 'zhipu',
          perspective: '智谱网络搜索',
          findings: '未找到相关搜索结果',
          sources: [],
          confidence: 0.3,
        }
      }

      // 整理搜索结果
      const sources = response.search_result.map(r => r.link).filter(Boolean)
      const findings = response.search_result
        .map(r => `【${r.title}】${r.content}`)
        .join('\n\n')

      return {
        agentId: 'zhipu',
        perspective: '智谱网络搜索',
        findings: findings || '搜索完成但未返回内容',
        sources,
        confidence: 0.7,
      }
    } catch (error) {
      this.logger.error('[智谱] 搜索失败:', error)
      return {
        agentId: 'zhipu',
        perspective: '智谱网络搜索',
        findings: `搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
      }
    }
  }
}
