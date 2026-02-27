import { Context } from 'koishi'
import { Config } from '../config'
import { SearchResult } from '../types'
import { ChatlunaAdapter } from './chatluna'

/**
 * Chatluna Search 服务
 * 使用 chatluna-search-service 插件进行联网搜索
 *
 * 实现方式：直接调用已注册的 web_search 工具进行搜索，
 * 然后使用配置的模型对搜索结果进行分析总结
 */
export class ChatlunaSearchAgent {
  private logger
  // 存储 toolInfo 而不是 tool 实例，每次搜索时重新创建
  private toolInfo: any = null
  private toolReady = false
  private emptyEmbeddings: any = null
  private chatluna: ChatlunaAdapter

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.logger = ctx.logger('isthattrue')
    this.chatluna = new ChatlunaAdapter(ctx, config)
    // 延迟初始化工具，等待 chatluna-search-service 完成注册
    this.initTool()
  }

  private async initTool() {
    // 等待一段时间让 chatluna-search-service 完成初始化
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      // 尝试导入 emptyEmbeddings
      try {
        const inMemory = await import('koishi-plugin-chatluna/llm-core/model/in_memory')
        this.emptyEmbeddings = inMemory.emptyEmbeddings
        this.logger.debug('[ChatlunaSearch] emptyEmbeddings 已导入')
      } catch {
        this.logger.debug('[ChatlunaSearch] 无法导入 emptyEmbeddings，将使用 null')
      }

      const chatluna = this.ctx.chatluna
      if (!chatluna?.platform) {
        this.logger.warn('[ChatlunaSearch] chatluna.platform 不可用')
        return
      }

      // 检查 web_search 工具是否已注册
      const tools = chatluna.platform.getTools()
      this.logger.debug(`[ChatlunaSearch] 可用工具列表: ${JSON.stringify(tools.value)}`)

      if (tools.value && tools.value.includes('web_search')) {
        this.toolInfo = chatluna.platform.getTool('web_search')
        this.logger.debug(`[ChatlunaSearch] toolInfo: ${JSON.stringify(this.toolInfo ? Object.keys(this.toolInfo) : null)}`)

        if (this.toolInfo && typeof this.toolInfo.createTool === 'function') {
          this.toolReady = true
          this.logger.info('[ChatlunaSearch] web_search 工具注册信息已获取')
        } else {
          this.logger.warn('[ChatlunaSearch] toolInfo 无效或没有 createTool 方法')
          this.toolInfo = null
        }
      } else {
        this.logger.warn('[ChatlunaSearch] web_search 工具未注册，请确保已启用 chatluna-search-service')
      }
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
        summaryType: 'speed'
      })

      this.logger.debug(`[ChatlunaSearch] 创建的 tool: name=${tool?.name}, type=${typeof tool}`)
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
    const enabled = this.config.enableChatlunaSearch !== false
    const hasModel = !!this.config.chatlunaSearchModel
    const hasChatluna = !!this.ctx.chatluna?.platform
    return enabled && hasModel && hasChatluna && this.toolReady
  }

  /**
   * 多样化搜索关键词
   * 使用小模型生成多个不同角度的搜索关键词
   */
  private async diversifyQuery(query: string): Promise<string[]> {
    const diversifyModel = this.config.chatlunaSearchDiversifyModel
    if (!diversifyModel) {
      return [query]
    }

    try {
      this.logger.info('[ChatlunaSearch] 使用小模型多样化搜索关键词...')
      const response = await this.chatluna.chatWithRetry({
        model: diversifyModel,
        systemPrompt: `你是一个搜索关键词优化专家。给定一个声明或问题，生成3个不同角度的搜索关键词，用于事实核查。

要求：
1. 关键词应该简洁有效，适合搜索引擎
2. 从不同角度切入：如正面验证、反面查证、相关背景
3. 每个关键词单独一行
4. 只输出关键词，不要编号或其他说明`,
        message: `请为以下内容生成3个多样化的搜索关键词：\n\n${query}`,
      }, this.config.maxRetries)

      const keywords = response.content
        .split('\n')
        .map(k => k.trim())
        .filter(k => k.length > 0 && k.length < 100)

      if (keywords.length > 0) {
        this.logger.info(`[ChatlunaSearch] 生成了 ${keywords.length} 个多样化关键词: ${keywords.join(' | ')}`)
        return keywords.slice(0, 3)
      }
    } catch (error) {
      this.logger.warn('[ChatlunaSearch] 关键词多样化失败，使用原始查询:', error)
    }

    return [query]
  }

  /**
   * 执行搜索
   */
  async search(query: string): Promise<SearchResult> {
    const startTime = Date.now()
    const modelName = this.config.chatlunaSearchModel
    const shortModelName = modelName.includes('/') ? modelName.split('/').pop()! : modelName
    this.logger.info(`[ChatlunaSearch] 开始搜索，模型: ${modelName}`)

    try {
      const chatluna = this.ctx.chatluna

      // 如果 toolInfo 还没准备好，尝试重新获取
      if (!this.toolReady || !this.toolInfo) {
        this.logger.info('[ChatlunaSearch] 工具未就绪，尝试重新获取...')
        const tools = chatluna.platform.getTools()
        if (tools.value && tools.value.includes('web_search')) {
          this.toolInfo = chatluna.platform.getTool('web_search')
          if (this.toolInfo && typeof this.toolInfo.createTool === 'function') {
            this.toolReady = true
            this.logger.info('[ChatlunaSearch] 工具重新获取成功')
          }
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
        // 每次搜索时创建新的工具实例
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

          // 解析搜索结果
          let searchData: any[] = []
          if (typeof searchResult === 'string') {
            try {
              searchData = JSON.parse(searchResult)
            } catch {
              searchData = [{ description: searchResult }]
            }
          } else if (Array.isArray(searchResult)) {
            searchData = searchResult
          }

          return searchData.map(item => ({ ...item, searchQuery: q }))
        } catch (err) {
          this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 搜索失败:`, err)
          return []
        }
      })

      // 等待所有搜索完成
      const searchResultsArray = await Promise.all(searchPromises)

      // 收集所有搜索结果
      const allSearchData: any[] = []
      const allSources: string[] = []

      for (const results of searchResultsArray) {
        if (Array.isArray(results)) {
          for (const item of results) {
            allSearchData.push(item)
            if (item.url && !allSources.includes(item.url)) {
              allSources.push(item.url)
            }
          }
        }
      }

      // 统计信息
      const totalResults = allSearchData.length
      this.logger.info(`[ChatlunaSearch] 共获取 ${totalResults} 条搜索结果，来自 ${queries.length} 个关键词`)

      // 格式化所有搜索结果（不截断）
      const formattedResults = allSearchData.length > 0
        ? allSearchData.map((item, i) =>
            `[${i + 1}] ${item.title || '未知标题'}\n来源: ${item.url || '未知'}\n${item.description || item.content || ''}`
          ).join('\n\n---\n\n')
        : '未找到搜索结果'

      // 添加统计摘要
      const summary = `=== Chatluna Search 统计 ===\n搜索关键词: ${queries.join(' | ')}\n返回结果数: ${totalResults}\n来源数: ${allSources.length}\n================================\n\n`

      const elapsed = Date.now() - startTime
      this.logger.info(`[ChatlunaSearch] 搜索完成，耗时 ${elapsed}ms，共 ${totalResults} 条结果`)

      return {
        agentId: 'chatluna-search',
        perspective: `Chatluna Search (${shortModelName})`,
        findings: summary + formattedResults,
        sources: allSources,
        confidence: totalResults > 0 ? Math.min(0.5 + totalResults * 0.05, 0.9) : 0.3,
      }
    } catch (error) {
      this.logger.error('[ChatlunaSearch] 搜索失败:', error)
      return {
        agentId: 'chatluna-search',
        perspective: `Chatluna Search (${shortModelName})`,
        findings: `搜索失败: ${(error as Error).message}`,
        sources: [],
        confidence: 0,
      }
    }
  }
}
