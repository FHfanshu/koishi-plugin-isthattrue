import { HumanMessage, SystemMessage } from '@langchain/core/messages'

import type { ChatRequest, ChatResponse, PluginConfig } from '../types'

type Ctx = any

export class ChatlunaAdapter {
  private readonly logger: any

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  isAvailable(): boolean {
    return Boolean(this.ctx.chatluna)
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isAvailable()) {
      throw new Error('Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna')
    }

    const startTime = Date.now()
    const modelRef = await this.ctx.chatluna.createChatModel(request.model)
    const model = modelRef.value

    if (!model) {
      throw new Error(`无法创建模型：${request.model}，请确保模型已正确配置`)
    }

    const messages: any[] = []
    if (request.systemPrompt) {
      messages.push(new SystemMessage(request.systemPrompt))
    }

    const messageContent = request.message

    if (request.images && request.images.length > 0) {
      const multimodalContent: any[] = [{ type: 'text', text: request.message }]

      for (const base64Image of request.images) {
        multimodalContent.push({
          type: 'image_url',
          image_url: `data:image/jpeg;base64,${base64Image}`,
        })
      }

      messages.push(new HumanMessage({ content: multimodalContent }))
      this.logger.debug(`构建多模态消息，包含 ${request.images.length} 张图片`)
    } else {
      messages.push(new HumanMessage(messageContent))
    }

    if (this.config.debug.logLLMDetails) {
      this.logger.info(
        `[LLM Request] Model: ${request.model}\nSystem: ${request.systemPrompt || 'None'}\nMessage: ${typeof messageContent === 'string' ? messageContent.substring(0, 500) : 'Complex content'}`
      )
    }

    const invokeOptions = request.enableSearch
      ? { configurable: { enableSearch: true } }
      : undefined

    const response = await model.invoke(messages, invokeOptions)
    const processingTime = Date.now() - startTime
    this.logger.debug(`Chatluna 请求完成，耗时 ${processingTime}ms`)

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    if (this.config.debug.logLLMDetails) {
      this.logger.info(`[LLM Response] Model: ${request.model}\nContent: ${content}`)
    }

    return {
      content,
      model: request.model,
      sources: this.extractSources(content),
    }
  }

  async chatWithRetry(request: ChatRequest, maxRetries = 2, fallbackModel?: string): Promise<ChatResponse> {
    let lastError: any = null
    let currentModel = request.model

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.chat({ ...request, model: currentModel })
      } catch (error: any) {
        lastError = error
        this.logger.warn(`请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error)

        if (attempt === maxRetries - 1 && fallbackModel && fallbackModel !== currentModel) {
          this.logger.info(`切换到备用模型：${fallbackModel}`)
          currentModel = fallbackModel
        }

        if (attempt < maxRetries) {
          await this.sleep(1000 * (attempt + 1))
        }
      }
    }

    throw lastError || new Error('请求失败，已达最大重试次数')
  }

  private extractSources(content: string): string[] {
    const sources: string[] = []
    const urlRegex = /https?:\/\/[^\s\])"']+/g
    const matches = content.match(urlRegex)
    if (matches) sources.push(...matches)

    const sourceRegex = /\[来源 [：:]\s*([^\]]+)\]/g
    let match: RegExpExecArray | null
    while ((match = sourceRegex.exec(content)) !== null) {
      sources.push(match[1])
    }

    return [...new Set(sources)]
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
