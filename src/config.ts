import { Schema } from 'koishi'

/**
 * 插件配置 Schema
 */
export interface Config {
  /** 主控 Agent 模型 - 用于最终判决 (推荐 Gemini-3-Flash) */
  mainModel: string
  /** 子搜索 Agent 模型 - 用于深度搜索 (推荐 Grok) */
  subSearchModel: string
  /** Tavily API Key */
  tavilyApiKey: string
  /** Anspire API Key */
  anspireApiKey: string
  /** Kimi API Key */
  kimiApiKey: string
  /** 智谱 API Key */
  zhipuApiKey: string
  /** Chatluna Search 使用的模型 */
  chatlunaSearchModel: string
  /** 启用 Chatluna 搜索集成 */
  enableChatlunaSearch: boolean
  /** 搜索关键词多样化模型 */
  chatlunaSearchDiversifyModel: string
  /** 超时时间(毫秒) */
  timeout: number
  /** 最大重试次数 */
  maxRetries: number
  /** 是否显示详细过程 */
  verbose: boolean
  /** 输出格式 */
  outputFormat: 'auto' | 'markdown' | 'plain'
  /** 是否使用合并转发消息 */
  useForwardMessage: boolean
  /** 合并转发最大节点数，超过则回退普通消息 */
  forwardMaxNodes: number
  /** 合并转发总字符数上限，超过则回退普通消息 */
  forwardMaxTotalChars: number
  /** 合并转发单节点字符数上限 */
  forwardMaxSegmentChars: number
  /** 是否绕过代理 */
  bypassProxy: boolean
  /** 是否打印 LLM 请求体和响应 */
  logLLMDetails: boolean
}

// 使用 Chatluna 的动态模型选择器
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    mainModel: Schema.dynamic('model')
      .default('google/gemini-3-flash')
      .description('主控 Agent 模型 (用于编排和最终判决，推荐 Gemini-3-Flash)'),

    subSearchModel: Schema.dynamic('model')
      .default('x-ai/grok-4-1')
      .description('子搜索 Agent 模型 (用于深度搜索，推荐 Grok-4-1)'),
  }).description('模型配置'),

  Schema.object({
    tavilyApiKey: Schema.string()
      .default('')
      .role('secret')
      .description('Tavily API Key (可选，用于补充搜索)'),

    anspireApiKey: Schema.string()
      .default('')
      .role('secret')
      .description('Anspire API Key (可选，用于补充搜索)'),

    kimiApiKey: Schema.string()
      .default('')
      .role('secret')
      .description('Kimi API Key (可选，用于 Kimi K2 内置搜索)'),

    zhipuApiKey: Schema.string()
      .default('')
      .role('secret')
      .description('智谱 API Key (可选，用于智谱 Web Search)'),

    chatlunaSearchModel: Schema.dynamic('model')
      .default('')
      .description('Chatluna Search 使用的模型 (可选，用于调用 chatluna-search-service)'),

    enableChatlunaSearch: Schema.boolean()
      .default(true)
      .description('启用 Chatluna 搜索集成'),

    chatlunaSearchDiversifyModel: Schema.dynamic('model')
      .default('')
      .description('搜索关键词多样化模型 (可选，推荐 Gemini 2.5 Flash Lite)'),
  }).description('搜索API配置'),

  Schema.object({
    timeout: Schema.number()
      .min(10000)
      .max(300000)
      .default(60000)
      .description('单次请求超时时间(毫秒)'),

    maxRetries: Schema.number()
      .min(0)
      .max(5)
      .default(2)
      .description('失败重试次数'),
  }).description('Agent配置'),

  Schema.object({
    verbose: Schema.boolean()
      .default(false)
      .description('显示详细验证过程 (进度提示)'),

    outputFormat: Schema.union([
      Schema.const('auto').description('自动 (QQ使用纯文本)'),
      Schema.const('markdown').description('Markdown'),
      Schema.const('plain').description('纯文本'),
    ]).default('auto').description('输出格式'),

    useForwardMessage: Schema.boolean()
      .default(true)
      .description('使用合并转发消息展示详情 (仅支持QQ)'),

    forwardMaxNodes: Schema.number()
      .min(0)
      .max(99)
      .default(8)
      .description('合并转发最大节点数，超过则回退普通消息（0 表示直接回退）'),

    forwardMaxTotalChars: Schema.number()
      .min(0)
      .max(20000)
      .default(3000)
      .description('合并转发总字符数上限，超过则回退普通消息（0 表示直接回退）'),

    forwardMaxSegmentChars: Schema.number()
      .min(50)
      .max(2000)
      .default(500)
      .description('合并转发单节点字符数上限'),

    bypassProxy: Schema.boolean()
      .default(false)
      .description('是否绕过系统代理'),

    logLLMDetails: Schema.boolean()
      .default(false)
      .description('是否打印 LLM 请求体和响应详情 (Debug用)'),
  }).description('其他设置'),
])
