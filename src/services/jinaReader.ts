import type { PluginConfig } from '../types'
import { isSafePublicHttpUrl } from '../utils/url'
import { resolveProxyAgent } from '../utils/http'

export interface JinaReaderResult {
  url: string
  title: string
  content: string
}

export class JinaReaderService {
  private readonly logger: any

  constructor(
    private readonly ctx: any,
    private readonly config: PluginConfig,
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  async fetch(targetUrl: string): Promise<JinaReaderResult | null> {
    // SSRF protection - must check before making any HTTP request
    if (!isSafePublicHttpUrl(targetUrl)) {
      this.logger.warn(`jina reader: url blocked by safety policy: ${targetUrl}`)
      return null
    }

    const timeout = (this.config.services.jinaTimeout || 30) * 1000
    const proxyAgent = resolveProxyAgent(this.config.debug)

    // First attempt with API key (if configured)
    const apiKey = this.config.services.jinaApiKey?.trim()
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'X-Timeout': '25', // seconds, slightly less than our own timeout
    }

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    try {
      const result = await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent)
      return result
    } catch (error) {
      const statusCode = (error as any)?.response?.status

      // 401/402: API key invalid or quota exceeded, retry without key
      if ((statusCode === 401 || statusCode === 402) && apiKey) {
        this.logger.warn(
          `Jina API key invalid or quota exceeded (${statusCode}), retrying without key`,
        )
        delete headers['Authorization']
        try {
          return await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent)
        } catch (retryError) {
          this.logger.warn(`jina reader: failed without key: ${String(retryError)}`)
          return null
        }
      }

      // 429: rate limit, retry with backoff
      if (statusCode === 429) {
        this.logger.warn('jina reader: rate limited (429), retrying after 2s')
        await this._sleep(2000)
        try {
          return await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent)
        } catch (retryError) {
          this.logger.warn(`jina reader: failed after 429 retry: ${String(retryError)}`)
          return null
        }
      }

      // Other errors
      this.logger.warn(`jina reader: failed to fetch ${targetUrl}: ${String(error)}`)
      return null
    }
  }

  private async _fetchWithRetry(
    targetUrl: string,
    timeout: number,
    headers: Record<string, string>,
    proxyAgent: string | undefined,
  ): Promise<JinaReaderResult | null> {
    const apiUrl = `https://r.jina.ai/${encodeURIComponent(targetUrl)}`

    const response = await this.ctx.http.get(apiUrl, {
      timeout,
      headers,
      ...(proxyAgent !== undefined ? { proxyAgent } : {}),
    })

    // Parse Jina response: {"code": 200, "status": 20000, "data": {"url": "...", "title": "...", "content": "..."}}
    const url = response.data?.url
    const title = response.data?.title
    const content = response.data?.content

    if (!content || content.trim() === '') {
      this.logger.warn(`jina reader: empty content from ${targetUrl}`)
      return null
    }

    return {
      url: url || targetUrl,
      title: title || '',
      content,
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
