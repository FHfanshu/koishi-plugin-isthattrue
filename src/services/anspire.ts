import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'

interface AnspireSearchResult {
  title: string
  content: string
  url: string
  score: number
  date?: string
}

interface AnspireResponse {
  query: string
  Uuid: string
  results: AnspireSearchResult[]
}

/**
 * Anspire 搜索服务
 * https://plugin.anspire.cn
 */
export class AnspireSearchAgent {
  private apiKey: string
  private logger

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.apiKey = config.anspireApiKey
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
    this.logger.info('[Anspire] 开始搜索:', query.substring(0, 50))

    try {
      // 截断查询到64字符
      const truncatedQuery = query.substring(0, 64)

      const response = await this.ctx.http.get<AnspireResponse>(
        'https://plugin.anspire.cn/api/ntsearch/search',
        {
          params: {
            query: truncatedQuery,
            top_k: '10',
          },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': '*/*',
          },
          timeout: this.config.timeout,
        }
      )

      const findings = this.formatFindings(response)
      const sources = response.results.map(r => r.url)

      const elapsed = Date.now() - startTime
      this.logger.info(`[Anspire] 搜索完成，耗时 ${elapsed}ms，找到 ${response.results.length} 条结果`)

      return {
        agentId: 'anspire',
        perspective: 'Anspire 网络搜索',
        findings,
        sources,
        confidence: this.calculateConfidence(response),
      }
    } catch (error) {
      this.logger.error('[Anspire] 搜索失败:', error)
      return {
        agentId: 'anspire',
        perspective: 'Anspire 网络搜索',
        findings: `搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
      }
    }
  }

  /**
   * 格式化搜索结果
   */
  private formatFindings(response: AnspireResponse): string {
    if (!response.results || response.results.length === 0) {
      return '未找到相关信息'
    }

    const parts: string[] = ['相关结果:']

    for (const result of response.results.slice(0, 5)) {
      const content = result.content.substring(0, 150)
      parts.push(`- ${result.title}: ${content}...`)
    }

    return parts.join('\n')
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(response: AnspireResponse): number {
    if (!response.results || response.results.length === 0) return 0.1

    // 基于结果数量和平均相关性评分
    const avgScore = response.results.reduce((sum, r) => sum + r.score, 0) / response.results.length
    return Math.min(Math.max(avgScore, 0.1), 0.9)
  }
}
