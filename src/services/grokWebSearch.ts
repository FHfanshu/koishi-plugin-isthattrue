import { resolveProxyAgent } from '../utils/http'
import type { PluginConfig } from '../types'

type Ctx = any

export interface GrokSearchResult {
  title: string
  url: string
  description: string
}

interface ChatCompletionRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

export class GrokWebSearchService {
  private readonly logger: any
  private readonly baseUrl: string
  private readonly timeout: number
  private readonly model: string

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.baseUrl = (config as any).grokWebSearch?.apiBaseUrl || 'http://127.0.0.1:28000/v1'
    this.timeout = (config as any).grokWebSearch?.timeout || 90000

    const rawModel = (config as any).factCheck?.grokModel || 'grok-4.1-fast'
    this.model = rawModel.replace(/^[^/]+\//, '')

    this.logger.debug(`GrokWebSearchService initialized: baseUrl=${this.baseUrl}, model=${this.model}, timeout=${this.timeout}`)
  }

  async search(query: string, maxResults = 5): Promise<GrokSearchResult[]> {
    const trimmedQuery = (query || '').trim()
    if (!trimmedQuery) {
      this.logger.warn('GrokWebSearch: empty query, returning empty results')
      return []
    }

    const systemPrompt = `You are a web search assistant. Search the web for the given query and return results as a pure JSON array with no markdown formatting. Each result must have exactly these fields: title (string), url (string), description (string, 20-50 words). Return ONLY the JSON array, no other text.`

    const userMessage = `Search the web for: ${trimmedQuery}\nReturn top ${maxResults} results as JSON array [{title, url, description}]`

    const requestBody: ChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      stream: false,
    }

    const proxyAgent = resolveProxyAgent(this.config.debug)
    const url = `${this.baseUrl}/chat/completions`

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.logger.debug(`GrokWebSearch attempt ${attempt + 1}/3: POST ${url}`)

        const response = await this.ctx.http.post(
          url,
          requestBody,
          {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'application/json',
            },
            ...(proxyAgent !== undefined ? { proxyAgent } : {}),
          }
        )

        const content = response?.choices?.[0]?.message?.content
        if (!content) {
          this.logger.warn('GrokWebSearch: no content in response')
          return []
        }

        const results = this.parseJson(content)
        this.logger.info(`GrokWebSearch: successfully parsed ${results.length} results`)
        return results.slice(0, maxResults)
      } catch (error) {
        const isLastAttempt = attempt >= 2
        const isRetryable = this.isRetryableError(error)

        this.logger.warn(`GrokWebSearch attempt ${attempt + 1} failed: ${error.message || error}`)

        if (isLastAttempt || !isRetryable) {
          this.logger.error(`GrokWebSearch: all attempts exhausted or non-retryable error, returning empty results`)
          return []
        }

        const delayMs = 1000 * (attempt + 1)
        this.logger.debug(`GrokWebSearch: retrying in ${delayMs}ms`)
        await this.sleep(delayMs)
      }
    }

    return []
  }

  private parseJson(content: string): GrokSearchResult[] {
    try {
      const trimmed = content.trim()
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return this.validateResults(parsed)
      }
      this.logger.debug('GrokWebSearch: Stage 1 parsed non-array, trying Stage 2')
    } catch (error) {
      this.logger.debug(`GrokWebSearch: Stage 1 JSON parse failed: ${error.message}`)
    }

    try {
      const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (markdownMatch) {
        const extracted = markdownMatch[1].trim()
        const parsed = JSON.parse(extracted)
        if (Array.isArray(parsed)) {
          this.logger.debug('GrokWebSearch: Stage 2 succeeded (markdown block)')
          return this.validateResults(parsed)
        }
      }
      this.logger.debug('GrokWebSearch: Stage 2 no markdown block or non-array, trying Stage 3')
    } catch (error) {
      this.logger.debug(`GrokWebSearch: Stage 2 extraction failed: ${error.message}`)
    }

    try {
      const firstBracket = content.indexOf('[')
      const lastBracket = content.lastIndexOf(']')
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        const extracted = content.slice(firstBracket, lastBracket + 1)
        const parsed = JSON.parse(extracted)
        if (Array.isArray(parsed)) {
          this.logger.debug('GrokWebSearch: Stage 3 succeeded (bracket extraction)')
          return this.validateResults(parsed)
        }
      }
      this.logger.warn('GrokWebSearch: Stage 3 no valid brackets or non-array')
    } catch (error) {
      this.logger.warn(`GrokWebSearch: Stage 3 extraction failed: ${error.message}`)
    }

    this.logger.error('GrokWebSearch: all 3 parsing stages failed, returning empty array')
    return []
  }

  private validateResults(parsed: unknown[]): GrokSearchResult[] {
    const results: GrokSearchResult[] = []

    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as any).title === 'string' &&
        typeof (item as any).url === 'string' &&
        typeof (item as any).description === 'string'
      ) {
        results.push({
          title: (item as any).title,
          url: (item as any).url,
          description: (item as any).description,
        })
      } else {
        this.logger.debug('GrokWebSearch: skipping invalid result item', item)
      }
    }

    return results
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false

    const status = error.response?.status || error.status || error.code
    if (typeof status === 'number' && RETRYABLE_STATUS_CODES.includes(status)) {
      return true
    }

    const message = (error.message || error.toString()).toLowerCase()
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    ) {
      return true
    }

    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
