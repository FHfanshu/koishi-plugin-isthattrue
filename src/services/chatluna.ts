import { Context } from 'koishi'
import { ChatRequest, ChatResponse } from '../types'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { MessageContentComplex } from '@langchain/core/messages'

// 声明 Chatluna 服务类型
declare module 'koishi' {
  interface Context {
    chatluna: ChatlunaService
  }
}

interface ChatlunaService {
  // 创建模型实例（无需 room）
  createChatModel(fullModelName: string): Promise<{ value: ChatModel | undefined }>
}

interface ChatModel {
  invoke(
    messages: Array<HumanMessage | SystemMessage>,
    options?: { temperature?: number }
  ): Promise<{ content: string | object }>
}

/**
 * Chatluna 集成服务
 * 封装对 koishi-plugin-chatluna 的调用
 */
export class ChatlunaAdapter {
  private logger

  constructor(private ctx: Context, private config?: any) {
    this.logger = ctx.logger('chatluna-fact-check')
  }

  /**
   * 检查 Chatluna 服务是否可用
   */
  isAvailable(): boolean {
    return !!this.ctx.chatluna
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isAvailable()) {
      throw new Error('Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna')
    }

    const startTime = Date.now()

    // 使用 createChatModel 创建模型实例（无需 room）
    const modelRef = await this.ctx.chatluna.createChatModel(request.model)
    const model = modelRef.value

    if (!model) {
      throw new Error(`无法创建模型：${request.model}，请确保模型已正确配置`)
    }

    // 构建消息数组
    const messages: Array<HumanMessage | SystemMessage> = []

    if (request.systemPrompt) {
      messages.push(new SystemMessage(request.systemPrompt))
    }

    // 构建用户消息内容
    const messageContent = request.message

    // 如果有图片，构建多模态消息
    if (request.images && request.images.length > 0) {
      const multimodalContent: MessageContentComplex[] = [
        { type: 'text', text: request.message }
      ]

      for (const base64Image of request.images) {
        multimodalContent.push({
          type: 'image_url',
          image_url: `data:image/jpeg;base64,${base64Image}`
        })
      }

      messages.push(new HumanMessage({ content: multimodalContent }))
      this.logger.debug(`构建多模态消息，包含 ${request.images.length} 张图片`)
    } else {
      messages.push(new HumanMessage(messageContent))
    }

    // 打印请求体
    if (this.config?.tof?.logLLMDetails || this.config?.logLLMDetails) {
      this.logger.info(`[LLM Request] Model: ${request.model}\nSystem: ${request.systemPrompt || 'None'}\nMessage: ${typeof messageContent === 'string' ? messageContent.substring(0, 500) : 'Complex content'}`)
    }

    // 调用模型
    const invokeOptions: any = {
      temperature: 0.3, // 低温度以减少幻觉
    }
    if (request.enableSearch) {
      invokeOptions.enableSearch = true
    }

    const response = await model.invoke(messages, invokeOptions)

    const processingTime = Date.now() - startTime
    this.logger.debug(`Chatluna 请求完成，耗时 ${processingTime}ms`)

    // 处理响应内容
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    // 打印响应体
    if (this.config?.tof?.logLLMDetails || this.config?.logLLMDetails) {
      this.logger.info(`[LLM Response] Model: ${request.model}\nContent: ${content}`)
    }

    return {
      content,
      model: request.model,
      sources: this.extractSources(content),
    }
  }

  /**
   * 带重试的聊天请求
   */
  async chatWithRetry(
    request: ChatRequest,
    maxRetries: number = 2,
    fallbackModel?: string
  ): Promise<ChatResponse> {
    let lastError: Error | null = null
    let currentModel = request.model

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat({
          ...request,
          model: currentModel,
        })
      } catch (error) {
        lastError = error as Error
        this.logger.warn(`请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error)

        // 最后一次尝试前切换到备用模型
        if (attempt === maxRetries - 1 && fallbackModel && fallbackModel !== currentModel) {
          this.logger.info(`切换到备用模型：${fallbackModel}`)
          currentModel = fallbackModel
        }

        // 等待后重试
        if (attempt < maxRetries) {
          await this.sleep(1000 * (attempt + 1))
        }
      }
    }

    throw lastError || new Error('请求失败，已达最大重试次数')
  }

  /**
   * 从响应中提取来源链接
   */
  private extractSources(content: string): string[] {
    const sources: string[] = []

    // 匹配 URL
    const urlRegex = /https?:\/\/[^\s\])"']+/g
    const matches = content.match(urlRegex)
    if (matches) {
      sources.push(...matches)
    }

    // 匹配 [来源：xxx] 格式
    const sourceRegex = /\[来源 [：:]\s*([^\]]+)\]/g
    let match
    while ((match = sourceRegex.exec(content)) !== null) {
      sources.push(match[1])
    }

    return [...new Set(sources)] // 去重
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
