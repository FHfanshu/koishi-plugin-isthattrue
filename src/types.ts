/**
 * 消息内容类型
 */
export interface MessageContent {
  /** 原始文本 */
  text: string
  /** 图片URL列表 */
  images: string[]
  /** 是否包含引用消息 */
  hasQuote: boolean
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** Agent ID */
  agentId: string
  /** 搜索角度/关键词 */
  perspective: string
  /** 搜索发现 */
  findings: string
  /** 相关来源 */
  sources: string[]
  /** 可信度评分 0-1 */
  confidence: number
}

/**
 * 验证结论
 */
export enum Verdict {
  TRUE = 'true',
  FALSE = 'false',
  UNCERTAIN = 'uncertain',
  PARTIALLY_TRUE = 'partially_true'
}

/**
 * 最终验证结果
 */
export interface VerificationResult {
  /** 待验证的原始内容 */
  originalContent: MessageContent
  /** 各Agent搜索结果 */
  searchResults: SearchResult[]
  /** 最终判决 */
  verdict: Verdict
  /** 判决理由 */
  reasoning: string
  /** 参考来源汇总 */
  sources: string[]
  /** 可信度评分 0-1 */
  confidence: number
  /** 处理耗时(ms) */
  processingTime: number
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** Agent 名称 */
  name: string
  /** 使用的模型 */
  model: string
  /** 搜索角度描述 */
  perspective: string
  /** 系统提示词 */
  systemPrompt?: string
}

/**
 * Chatluna 聊天请求
 */
export interface ChatRequest {
  /** 模型名称 */
  model: string
  /** 消息内容 */
  message: string
  /** 图片(base64) */
  images?: string[]
  /** 系统提示词 */
  systemPrompt?: string
  /** 是否启用搜索 */
  enableSearch?: boolean
}

/**
 * Chatluna 聊天响应
 */
export interface ChatResponse {
  /** 回复内容 */
  content: string
  /** 搜索结果来源(如果有) */
  sources?: string[]
  /** 使用的模型 */
  model: string
  /** token使用量 */
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}
