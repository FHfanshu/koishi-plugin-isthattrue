import { ChatlunaAdapter } from './chatluna'

import type { PluginConfig } from '../types'

type Ctx = any

export interface GrokSearchResult {
  title: string
  url: string
  description: string
}

export class GrokWebSearchService {
  private readonly logger: any
  private readonly chatluna: ChatlunaAdapter

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.chatluna = new ChatlunaAdapter(ctx, config)
  }

  async search(query: string, maxResults = 5): Promise<GrokSearchResult[]> {
    const trimmedQuery = (query || '').trim()
    if (!trimmedQuery) {
      this.logger.warn('GrokWebSearch: empty query, returning empty results')
      return []
    }

    const model = this.config.models.grokModel?.trim()
    if (!model) {
      this.logger.warn('GrokWebSearch: models.grokModel 未配置，跳过 Grok 搜索')
      return []
    }

    const systemPrompt = 'You are a web search assistant. Search the web for the given query and return results as a pure JSON array with no markdown formatting. Each result must have exactly these fields: title (string), url (string), description (string, 20-50 words). Return ONLY the JSON array, no other text.'
    const userMessage = `Search the web for: ${trimmedQuery}\nReturn top ${maxResults} results as JSON array [{title, url, description}]`

    try {
      const response = await this.chatluna.chatWithRetry(
        {
          model,
          message: userMessage,
          systemPrompt,
          enableSearch: true,
        },
        this.config.debug.maxRetries
      )

      const results = this.parseJson(response.content)
      return results.slice(0, maxResults)
    } catch (error: any) {
      this.logger.warn(`GrokWebSearch: Chatluna 搜索失败: ${error?.message || error}`)
      return []
    }
  }

  private parseJson(content: string): GrokSearchResult[] {
    try {
      const parsed = JSON.parse(content.trim())
      if (Array.isArray(parsed)) return this.validateResults(parsed)
    } catch (error: any) {
      this.logger.debug(`GrokWebSearch: json parse stage1 failed: ${error?.message || error}`)
    }

    try {
      const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (markdownMatch) {
        const parsed = JSON.parse(markdownMatch[1].trim())
        if (Array.isArray(parsed)) return this.validateResults(parsed)
      }
    } catch (error: any) {
      this.logger.debug(`GrokWebSearch: json parse stage2 failed: ${error?.message || error}`)
    }

    try {
      const firstBracket = content.indexOf('[')
      const lastBracket = content.lastIndexOf(']')
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        const parsed = JSON.parse(content.slice(firstBracket, lastBracket + 1))
        if (Array.isArray(parsed)) return this.validateResults(parsed)
      }
    } catch (error: any) {
      this.logger.debug(`GrokWebSearch: json parse stage3 failed: ${error?.message || error}`)
    }

    return []
  }

  private validateResults(parsed: unknown[]): GrokSearchResult[] {
    const results: GrokSearchResult[] = []
    for (const item of parsed) {
      if (
        item
        && typeof item === 'object'
        && typeof (item as any).title === 'string'
        && typeof (item as any).url === 'string'
        && typeof (item as any).description === 'string'
      ) {
        results.push({
          title: (item as any).title,
          url: (item as any).url,
          description: (item as any).description,
        })
      }
    }
    return results
  }
}
