import { Context, h } from 'koishi'
import { MessageContent } from '../types'

/**
 * 消息解析服务
 * 用于解析引用消息中的文本和图片内容
 */
export class MessageParser {
  constructor(private ctx: Context) {}

  /**
   * 从会话中提取引用消息的内容
   */
  async parseQuotedMessage(session: any): Promise<MessageContent | null> {
    const result: MessageContent = {
      text: '',
      images: [],
      hasQuote: false,
    }

    // 尝试获取引用消息
    const quote = session.quote
    if (!quote) {
      // 没有引用消息，检查是否有其他方式传递的内容
      return null
    }

    result.hasQuote = true

    // 解析引用消息的元素
    const elements = quote.elements || []

    for (const element of elements) {
      if (element.type === 'text') {
        result.text += element.attrs?.content || ''
      } else if (element.type === 'img' || element.type === 'image') {
        const src = element.attrs?.src || element.attrs?.url
        if (src) {
          result.images.push(src)
        }
      }
    }

    // 如果elements为空，尝试直接从content获取
    if (elements.length === 0 && quote.content) {
      const parsed = this.parseContent(quote.content)
      result.text = parsed.text
      result.images = parsed.images
    }

    return result
  }

  /**
   * 从整个会话中提取可验证内容
   * 同时解析引用消息和当前消息，合并内容
   */
  async parseSession(session: any): Promise<MessageContent | null> {
    const result: MessageContent = {
      text: '',
      images: [],
      hasQuote: false,
    }

    // 1. 解析引用消息（如果有）
    const quoted = await this.parseQuotedMessage(session)
    if (quoted) {
      result.hasQuote = true
      result.images = [...quoted.images]
      // 引用的文本作为基础
      if (quoted.text.trim()) {
        result.text = quoted.text
      }
    }

    // 2. 解析当前消息的内容（用户输入的文字和图片）
    const elements = session.elements || []
    this.ctx.logger('isthattrue').debug('Parsing session elements:', JSON.stringify(elements))

    let currentText = ''
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      if (element.type === 'text') {
        let content = element.attrs?.content || ''
        // 如果是第一个文本元素且包含指令别名，尝试移除它
        if (i === 0) {
          // 移除开头的指令名或别名及随后的空格
          content = content.replace(/^[^\s]+\s*/, '')
        }
        currentText += content
      } else if (element.type === 'img' || element.type === 'image') {
        const src = element.attrs?.src || element.attrs?.url
        if (src && !result.images.includes(src)) {
          result.images.push(src)
        }
      }
    }

    // 3. 合并当前消息的文字（作为用户评论/问题）
    currentText = currentText.trim()
    if (currentText) {
      if (result.text) {
        // 如果有引用文本，把用户输入作为补充说明
        result.text = `${result.text}\n\n[用户评论]: ${currentText}`
      } else {
        result.text = currentText
      }
      this.ctx.logger('isthattrue').info(`用户附加文字: ${currentText}`)
    }

    if (result.text.trim() || result.images.length > 0) {
      return result
    }

    return null
  }

  /**
   * 解析消息内容字符串
   */
  parseContent(content: string): { text: string; images: string[] } {
    const text: string[] = []
    const images: string[] = []

    // 使用 koishi 的 h 解析器
    try {
      const elements = h.parse(content)
      for (const el of elements) {
        if (el.type === 'text') {
          text.push(el.attrs?.content || String(el))
        } else if (el.type === 'img' || el.type === 'image') {
          const src = el.attrs?.src || el.attrs?.url
          if (src) {
            images.push(src)
          }
        }
      }
    } catch {
      // 解析失败时直接使用原文本
      text.push(content)
    }

    return {
      text: text.join(' ').trim(),
      images,
    }
  }

  /**
   * 获取图片的base64编码
   */
  async imageToBase64(url: string): Promise<string | null> {
    try {
      // 处理已经是base64的情况
      if (url.startsWith('data:image')) {
        return url.split(',')[1] || url
      }

      // 处理本地文件
      if (url.startsWith('file://')) {
        // 暂不支持本地文件
        this.ctx.logger('isthattrue').warn('本地文件暂不支持:', url)
        return null
      }

      // 下载远程图片
      const response = await this.ctx.http.get(url, {
        responseType: 'arraybuffer',
      })

      const rawData = (response as any)?.data ?? response
      const buffer = Buffer.from(rawData as ArrayBuffer)
      return buffer.toString('base64')
    } catch (error) {
      this.ctx.logger('isthattrue').error('图片转换失败:', error)
      return null
    }
  }

  /**
   * 准备消息内容用于LLM处理
   * 将图片转换为base64，合并文本
   */
  async prepareForLLM(content: MessageContent): Promise<{
    text: string
    imageBase64List: string[]
  }> {
    const imageBase64List: string[] = []

    for (const imageUrl of content.images) {
      const base64 = await this.imageToBase64(imageUrl)
      if (base64) {
        imageBase64List.push(base64)
      }
    }

    return {
      text: content.text,
      imageBase64List,
    }
  }
}
