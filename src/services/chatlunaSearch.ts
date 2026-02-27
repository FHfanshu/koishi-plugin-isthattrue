import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'
import { ChatlunaAdapter } from './chatluna'
import { withTimeout } from '../utils/async'
import { truncate } from '../utils/text'
import { normalizeUrl } from '../utils/url'
import { normalizeResultItems } from '../utils/search'

const MAX_RESULTS_PER_QUERY = 8
const MAX_TOTAL_RESULTS = 24
const MAX_DESC_LENGTH = 320

/**
 * Chatluna Search 服务
 * 使用 chatluna-search-service 插件进行联网搜索
 *
 * 实现方式：直接调用已注册的 web_search 工具进行搜索，
 * 然后使用配置的模型对搜索结果进行分析总结
 */
export class ChatlunaSearchAgent {
  private logger
  // 缓存 web_search toolInfo，避免重复探测注册信息
  private toolInfo: any = null
  private toolReady = false
  private toolInitPromise: Promise<void> | null = null
  private emptyEmbeddings: any = null
  private chatluna: ChatlunaAdapter

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.chatluna = new ChatlunaAdapter(ctx, config)
    this.toolInitPromise = this.initTool()
  }

  private async refreshToolInfo(): Promise<boolean> {
    const chatluna = (this.ctx as any).chatluna
    if (!chatluna?.platform) {
      return false
    }

    const tools = chatluna.platform.getTools()
    this.logger.debug(`[ChatlunaSearch] 可用工具列表: ${JSON.stringify(tools.value)}`)
    if (!tools.value || !tools.value.includes('web_search')) {
      return false
    }

    const nextToolInfo = chatluna.platform.getTool('web_search')
    this.logger.debug(`[ChatlunaSearch] toolInfo: ${JSON.stringify(nextToolInfo ? Object.keys(nextToolInfo) : null)}`)
    if (!nextToolInfo || typeof nextToolInfo.createTool !== 'function') {
      return false
    }

    if (this.toolInfo !== nextToolInfo) {
      this.logger.debug('[ChatlunaSearch] 检测到 web_search toolInfo 变更')
    }
    this.toolInfo = nextToolInfo
    this.toolReady = true
    return true
  }

  private async initTool() {
    try {
      try {
        const inMemory = require('koishi-plugin-chatluna/llm-core/model/in_memory')
        this.emptyEmbeddings = inMemory.emptyEmbeddings
        this.logger.debug('[ChatlunaSearch] emptyEmbeddings 已导入')
      } catch {
        this.logger.debug('[ChatlunaSearch] 无法导入 emptyEmbeddings，将使用 null')
      }

      const maxWaitMs = 10000
      const intervalMs = 200
      const start = Date.now()
      while (Date.now() - start < maxWaitMs) {
        if (await this.refreshToolInfo()) {
          this.logger.info('[ChatlunaSearch] web_search 工具注册信息已获取')
          return
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }

      this.logger.warn('[ChatlunaSearch] web_search 工具未在 10 秒内就绪，请确保已启用 chatluna-search-service')
    } catch (error) {
      this.logger.warn('[ChatlunaSearch] 初始化工具失败:', error)
    }
  }

  /**
   * 创建搜索工具实例
   */
  private createSearchTool(): any {
    if (!this.toolInfo) {
      return null
    }

    try {
      const tool = this.toolInfo.createTool({
        embeddings: this.emptyEmbeddings,
        summaryType: 'performance'
      })

      // 强制覆盖 summaryType，防止 balanced 模式下因 llm ref 为 null
      // 且 config.configurable 未传导致 TypeError: Cannot read properties of undefined (reading 'model')
      // 某些旧版 chatluna-search-service 的 createTool 不接受 summaryType 参数覆盖
      if (tool && tool.summaryType === 'balanced') {
        this.logger.info('[ChatlunaSearch] 强制覆盖 summaryType: balanced → speed')
        tool.summaryType = 'speed'
      }

      this.logger.debug(`[ChatlunaSearch] 创建的 tool: name=${tool?.name}, type=${typeof tool}, summaryType=${tool?.summaryType}`)
      this.logger.debug(`[ChatlunaSearch] tool.invoke: ${typeof tool?.invoke}`)
      this.logger.debug(`[ChatlunaSearch] tool._call: ${typeof tool?._call}`)

      return tool
    } catch (error) {
      this.logger.error('[ChatlunaSearch] createTool 失败:', error)
      return null
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    const hasChatluna = !!(this.ctx as any).chatluna?.platform
    return hasChatluna
  }

  /**
   * 多样化搜索关键词
   * 使用小模型生成多个不同角度的搜索关键词
   */
  private async diversifyQuery(query: string): Promise<string[]> {
    return [query]
  }

  /**
   * 执行搜索
   */
  async search(query: string): Promise<SearchResult> {
    const startTime = Date.now()
    const modelName = this.config.deepSearch.controllerModel?.trim()
      || this.config.agent.geminiModel?.trim()
      || this.config.agent.grokModel?.trim()
      || 'unknown'
    const shortModelName = modelName.includes('/') ? modelName.split('/').pop()! : modelName
    const perQueryTimeout = Math.max(3000, Math.min(this.config.factCheck.timeout || 60000, 120000))
    this.logger.info(`[ChatlunaSearch] 开始搜索，模型: ${modelName}`)

    try {
      const chatluna = (this.ctx as any).chatluna

      if (this.toolInitPromise) {
        await this.toolInitPromise
      }

      // 如果 toolInfo 还没准备好，尝试重新获取
      if (!this.toolReady || !this.toolInfo) {
        this.logger.info('[ChatlunaSearch] 工具未就绪，尝试重新获取...')
        if (chatluna?.platform && await this.refreshToolInfo()) {
          this.logger.info('[ChatlunaSearch] 工具重新获取成功')
        }
      }

      if (!this.toolReady || !this.toolInfo) {
        throw new Error('web_search 工具未就绪，请确保已启用 chatluna-search-service 并配置了搜索引擎')
      }

      // 多样化搜索关键词
      const queries = await this.diversifyQuery(query)
      this.logger.info(`[ChatlunaSearch] 将并行执行 ${queries.length} 次搜索`)

      // 并行执行所有关键词搜索
      const searchPromises = queries.map(async (q) => {
        return withTimeout((async () => {
          const searchTool = this.createSearchTool()
          if (!searchTool) {
            this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 创建搜索工具失败`)
            return []
          }

          try {
            this.logger.info(`[ChatlunaSearch] 正在搜索关键词: ${q}`)
            let searchResult: any

            if (typeof searchTool.invoke === 'function') {
              searchResult = await searchTool.invoke(q)
            } else if (typeof searchTool._call === 'function') {
              searchResult = await searchTool._call(q, undefined, {})
            } else {
              throw new Error('搜索工具没有可用的调用方法')
            }

            const searchData = normalizeResultItems(searchResult)
              .slice(0, MAX_RESULTS_PER_QUERY)

            return searchData.map(item => ({ ...item, searchQuery: q }))
          } catch (err) {
            this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 搜索失败，将尝试重建工具:`, err)
            const recreatedTool = this.createSearchTool()
            if (!recreatedTool) {
              return []
            }
            try {
              let retryResult: any
              if (typeof recreatedTool.invoke === 'function') {
                retryResult = await recreatedTool.invoke(q)
              } else if (typeof recreatedTool._call === 'function') {
                retryResult = await recreatedTool._call(q, undefined, {})
              } else {
                throw new Error('重建后的搜索工具没有可用调用方法')
              }
              const retryData = normalizeResultItems(retryResult)
                .slice(0, MAX_RESULTS_PER_QUERY)
              return retryData.map(item => ({ ...item, searchQuery: q }))
            } catch (retryErr) {
              this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 重试失败:`, retryErr)
              return []
            }
          }
        })(), perQueryTimeout, `ChatlunaSearch(${q})`)
          .catch((err) => {
            this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 超时/失败: ${(err as Error).message}`)
            return []
          })
      })

      // 等待所有搜索完成
      const searchResultsArray = await Promise.all(searchPromises)

      // 收集所有搜索结果
      const allSearchData: any[] = []

      for (const results of searchResultsArray) {
        if (Array.isArray(results)) {
          for (const item of results) {
            allSearchData.push(item)
          }
        }
      }

      const dedupedSearchData: any[] = []
      const seenKeys = new Set<string>()
      for (const item of allSearchData) {
        const url = normalizeUrl(item?.url || '')
        const key = url || `${item?.title || ''}|${item?.description || item?.content || ''}`
        if (!key || seenKeys.has(key)) continue
        seenKeys.add(key)
        dedupedSearchData.push(item)
      }

      const finalSearchData = dedupedSearchData.slice(0, MAX_TOTAL_RESULTS)
      const allSources = [...new Set(
        finalSearchData
          .map(item => normalizeUrl(item?.url || ''))
          .filter(Boolean)
      )]

      // 统计信息
      const totalResults = finalSearchData.length
      this.logger.info(
        `[ChatlunaSearch] 原始 ${allSearchData.length} 条，去重后 ${dedupedSearchData.length} 条，最终保留 ${totalResults} 条`
      )

      // 格式化搜索结果（保留必要信息并限制长度）
      const formattedResults = finalSearchData.length > 0
        ? finalSearchData.map((item, i) =>
            `[${i + 1}] ${truncate(item.title || '未知标题', 120)}\n来源: ${item.url || '未知'}\n${truncate(item.description || item.content || '', MAX_DESC_LENGTH)}`
          ).join('\n\n---\n\n')
        : '未找到搜索结果'

      // 添加统计摘要
      const summary = `=== Chatluna Search 统计 ===\n搜索关键词: ${queries.join(' | ')}\n原始结果数: ${allSearchData.length}\n去重后结果数: ${dedupedSearchData.length}\n返回结果数: ${totalResults}\n来源数: ${allSources.length}\n================================\n\n`

      const elapsed = Date.now() - startTime
      this.logger.info(`[ChatlunaSearch] 搜索完成，耗时 ${elapsed}ms，共 ${totalResults} 条结果`)

      return {
        agentId: 'chatluna-search',
        perspective: `Chatluna Search (${shortModelName})`,
        findings: summary + formattedResults,
        sources: allSources,
        confidence: totalResults > 0 ? Math.min(0.45 + allSources.length * 0.06, 0.85) : 0,
      }
    } catch (error) {
      this.logger.error('[ChatlunaSearch] 搜索失败:', error)
      return {
        agentId: 'chatluna-search',
        perspective: `Chatluna Search (${shortModelName})`,
        findings: `搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: (error as Error).message,
      }
    }
  }
}
