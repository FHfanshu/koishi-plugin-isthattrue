import { Schema } from 'koishi'

/**
 * Tof 命令配置 - 用于 tof 指令的事实核查流程
 */
export interface TofConfig {
  /** 判决模型 */
  model: string
  /** 搜索模型 */
  searchModel: string
  /** TavilyAPI Key（可选，用于补充搜索） */
  tavilyApiKey: string
  /** Chatluna Search 使用的模型 */
  chatlunaSearchModel: string
  /** 启用 Chatluna 搜索集成 */
  enableChatlunaSearch: boolean
  /** 搜索关键词多样化模型 */
  chatlunaSearchDiversifyModel: string
  /** 超时时间（毫秒） */
  timeout: number
  /** 最大重试次数 */
  maxRetries: number
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
  /** 是否显示详细过程 */
  verbose: boolean
  /** 是否绕过代理 */
  bypassProxy: boolean
  /** 是否打印 LLM 请求体和响应 */
  logLLMDetails: boolean
}

/**
 * Agent 工具配置 - 用于 Chatluna fact_check 工具的调用场景
 */
export interface AgentToolConfig {
  /** 是否注册为 Chatluna 工具 */
  enable: boolean
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具输入最大长度 */
  maxInputChars: number
  /** 工具返回来源数量上限 */
  maxSources: number
  /** 启用多源并行搜索 */
  enableMultiSourceSearch: boolean
  /** 启用 Grok 源 */
  searchUseGrok: boolean
  /** 启用 Gemini 源 */
  searchUseGemini: boolean
  /** 启用 ChatGPT 源 */
  searchUseChatgpt: boolean
  /** 启用 DeepSeek 源 */
  searchUseDeepseek: boolean
  /** Grok 模型 */
  grokModel: string
  /** Gemini 模型 */
  geminiModel: string
  /** ChatGPT 模型 */
  chatgptModel: string
  /** DeepSeek 模型 */
  deepseekModel: string
  /** 每个来源超时（毫秒） */
  perSourceTimeout: number
  /** 每个来源输出最大长度 */
  maxFindingsChars: number
}

/**
 * 插件配置 Schema
 */
export interface Config {
  /** Tof 命令配置 */
  tof: TofConfig
  /** Agent 工具配置 */
  agent: AgentToolConfig
}

// Tof 命令配置 Schema
const tofConfigSchema = Schema.object({
  model: Schema.dynamic('model')
    .default('google/gemini-3-flash')
    .description('判决模型 (用于最终判决，推荐 Gemini-3-Flash)'),
  searchModel: Schema.dynamic('model')
    .default('x-ai/grok-4-1')
    .description('搜索模型 (用于深度搜索，推荐 Grok-4-1)'),
  timeout: Schema.number()
    .min(10000)
    .max(300000)
    .default(60000)
    .description('单次请求超时时间 (毫秒)'),
  maxRetries: Schema.number()
    .min(0)
    .max(5)
    .default(2)
    .description('失败重试次数'),
}).description('基础设置')

const tofSearchSchema = Schema.object({
  tavilyApiKey: Schema.string()
    .default('')
    .role('secret')
    .description('Tavily API Key (可选，用于补充搜索)'),
  chatlunaSearchModel: Schema.dynamic('model')
    .default('')
    .description('Chatluna Search 使用的模型 (可选；chatluna-search-service 不稳定时可留空并使用 fact_check 工具替代)'),
  enableChatlunaSearch: Schema.boolean()
    .default(false)
    .description('启用 Chatluna 搜索集成（默认关闭，建议优先使用 fact_check 工具作为 LLMSearch 替代）'),
  chatlunaSearchDiversifyModel: Schema.dynamic('model')
    .default('')
    .description('搜索关键词多样化模型 (可选，推荐 Gemini 2.5 Flash Lite)'),
}).description('搜索集成')

const tofOutputSchema = Schema.object({
  outputFormat: Schema.union([
    Schema.const('auto').description('自动 (QQ 使用纯文本)'),
    Schema.const('markdown').description('Markdown'),
    Schema.const('plain').description('纯文本'),
  ]).default('auto').description('输出格式'),
  useForwardMessage: Schema.boolean()
    .default(true)
    .description('使用合并转发消息展示详情 (仅支持 QQ)'),
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
  verbose: Schema.boolean()
    .default(false)
    .description('显示详细验证过程 (进度提示)'),
}).description('输出格式')

const tofDebugSchema = Schema.object({
  bypassProxy: Schema.boolean()
    .default(false)
    .description('是否绕过系统代理'),
  logLLMDetails: Schema.boolean()
    .default(false)
    .description('是否打印 LLM 请求体和响应详情 (Debug 用)'),
}).description('调试')

// Agent 工具配置 Schema
const agentToolSchema = Schema.object({
  enable: Schema.boolean()
    .default(true)
    .description('开启：注册事实核查为 Chatluna 可调用工具'),
  name: Schema.string()
    .default('fact_check')
    .description('Chatluna 工具名称（需与预设中提及名称一致）'),
  description: Schema.string()
    .default('用于 LLM 网络搜索（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/DeepSeek），由上层 Agent 自行判断。')
    .description('Chatluna 工具描述，建议明确该工具只提供证据不做最终裁决'),
  maxInputChars: Schema.number()
    .min(100)
    .max(10000)
    .default(1200)
    .description('Chatluna 工具单次输入文本最大字符数'),
  maxSources: Schema.number()
    .min(1)
    .max(20)
    .default(5)
    .description('Chatluna 工具返回来源链接数量上限'),
}).description('Fact Check 工具')

const agentMultiSourceSchema = Schema.object({
  enableMultiSourceSearch: Schema.boolean()
    .default(true)
    .description('Agent 调用 fact_check 时，启用多源并行搜索'),
  searchUseGrok: Schema.boolean()
    .default(true)
    .description('多源搜索包含 Grok'),
  searchUseGemini: Schema.boolean()
    .default(true)
    .description('多源搜索包含 Gemini（需模型支持搜索工具）'),
  searchUseChatgpt: Schema.boolean()
    .default(false)
    .description('多源搜索包含 ChatGPT（需模型支持搜索工具）'),
  searchUseDeepseek: Schema.boolean()
    .default(false)
    .description('多源搜索包含 DeepSeek（需模型支持搜索工具）'),
  grokModel: Schema.dynamic('model')
    .default('')
    .description('Grok 来源模型（留空时回退 searchModel）'),
  geminiModel: Schema.dynamic('model')
    .default('')
    .description('Gemini 来源模型（留空则跳过 Gemini 来源）'),
  chatgptModel: Schema.dynamic('model')
    .default('')
    .description('ChatGPT 来源模型（留空则跳过 ChatGPT 来源）'),
  deepseekModel: Schema.dynamic('model')
    .default('')
    .description('DeepSeek 来源模型（留空则跳过 DeepSeek 来源）'),
  perSourceTimeout: Schema.number()
    .min(5000)
    .max(180000)
    .default(45000)
    .description('fact_check 多源模式下每个来源的独立超时时间（毫秒）'),
  maxFindingsChars: Schema.number()
    .min(200)
    .max(8000)
    .default(2000)
    .description('fact_check 输出中每个来源 findings 的最大字符数'),
}).description('多源搜索配置')

export const Config = Schema.intersect([
  Schema.object({
    tof: Schema.intersect([
      tofConfigSchema,
      tofSearchSchema,
      tofOutputSchema,
      tofDebugSchema,
    ]).description('Tof 命令配置'),
    agent: Schema.intersect([
      agentToolSchema,
      agentMultiSourceSchema,
    ]).description('Agent 工具配置'),
  }),
]) as unknown as Schema<Config>
