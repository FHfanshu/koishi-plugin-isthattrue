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
  /** HTTP 代理模式 */
  proxyMode: 'follow-global' | 'direct' | 'custom'
  /** 自定义 HTTP 代理地址（仅 custom 模式） */
  proxyAddress: string
  /** 是否打印 LLM 请求体和响应 */
  logLLMDetails: boolean
}

/**
 * Agent 工具配置 - 用于 Chatluna fact_check 工具的调用场景
 */
export interface AgentToolConfig {
  /** 是否注册为 Chatluna 工具 */
  enable: boolean
  /** 是否注册多源深度搜索工具（legacy，默认关闭，建议改用 deep_search） */
  enableDeepTool: boolean
  /** 是否注册快速搜索工具（默认作为 fact_check） */
  enableQuickTool: boolean
  /** 多源深度搜索工具名称（legacy） */
  name: string
  /** 快速搜索工具名称 */
  quickToolName: string
  /** 多源深度搜索工具描述（legacy） */
  description: string
  /** 快速搜索工具描述 */
  quickToolDescription: string
  /** 工具输入最大长度 */
  maxInputChars: number
  /** 工具返回来源数量上限 */
  maxSources: number
  /** Gemini 快速搜索模型（留空时回退 geminiModel/chatlunaSearchModel） */
  quickToolModel: string
  /** Gemini 快速搜索超时（毫秒） */
  quickToolTimeout: number
  /** 追加 Chatluna Search 上下文到 fact_check 工具输出 */
  appendChatlunaSearchContext: boolean
  /** 追加 Chatluna Search 上下文超时（毫秒） */
  chatlunaSearchContextTimeout: number
  /** 追加 Chatluna Search 上下文最大字符数 */
  chatlunaSearchContextMaxChars: number
  /** 追加 Chatluna Search 上下文来源数量上限 */
  chatlunaSearchContextMaxSources: number
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
  /** 多源快速返回：最少成功来源数（达到即提前返回） */
  fastReturnMinSuccess: number
  /** 多源快速返回：最大等待时长（毫秒） */
  fastReturnMaxWaitMs: number
  /** 每个来源输出最大长度 */
  maxFindingsChars: number
}

/**
 * DeepSearch 配置
 * 用于迭代搜索主控与 deep_search 工具
 */
export interface DeepSearchConfig {
  /** 是否启用 DeepSearch 模式（主流程与工具注册） */
  enable: boolean
  /** 主控模型 */
  controllerModel: string
  /** 最大迭代轮数 */
  maxIterations: number
  /** 每轮超时（毫秒） */
  perIterationTimeout: number
  /** 最低置信度阈值（可选；留空时仅由 LLM 评估决定） */
  minConfidenceThreshold: number | null
  /** 最少来源数量阈值（可选；留空时仅由 LLM 评估决定） */
  minSourcesThreshold: number | null
  /** 启用 Grok 作为 DeepSearch LLM 搜索源 */
  searchUseGrok: boolean
  /** 启用 Gemini 作为 DeepSearch LLM 搜索源 */
  searchUseGemini: boolean
  /** 启用 ChatGPT 作为 DeepSearch LLM 搜索源 */
  searchUseChatgpt: boolean
  /** 启用 DeepSeek 作为 DeepSearch LLM 搜索源 */
  searchUseDeepseek: boolean
  /** Grok 模型（留空回退到 agent.grokModel/tof.searchModel） */
  grokModel: string
  /** Gemini 模型（留空回退到 agent.geminiModel/tof.searchModel） */
  geminiModel: string
  /** ChatGPT 模型（留空回退到 agent.chatgptModel/tof.searchModel） */
  chatgptModel: string
  /** DeepSeek 模型（留空回退到 agent.deepseekModel/tof.searchModel） */
  deepseekModel: string
  /** 允许使用 chatluna-search-service 的 web_search 工具 */
  useChatlunaSearchTool: boolean
  /** 允许使用 chatluna-search-service 的 browser 工具 */
  usePuppeteerBrowser: boolean
  /** 是否启用 SearXNG 作为额外搜索源 */
  useSearXNG: boolean
  /** SearXNG API 基础地址 */
  searXNGApiBase: string
  /** SearXNG engines 参数（逗号分隔） */
  searXNGEngines: string
  /** SearXNG categories 参数（逗号分隔） */
  searXNGCategories: string
  /** SearXNG 返回结果数 */
  searXNGNumResults: number
}

/**
 * 插件配置 Schema
 */
export interface Config {
  /** Tof 命令配置 */
  tof: TofConfig
  /** Agent 工具配置 */
  agent: AgentToolConfig
  /** DeepSearch 配置 */
  deepSearch: DeepSearchConfig
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
  proxyMode: Schema.union([
    Schema.const('follow-global').description('遵循全局代理设置'),
    Schema.const('direct').description('不使用代理（仅本插件的 HTTP 请求）'),
    Schema.const('custom').description('使用自定义代理地址（仅本插件的 HTTP 请求）'),
  ]).default('follow-global').description('HTTP 代理模式'),
  proxyAddress: Schema.string()
    .default('')
    .description('自定义 HTTP 代理地址（例如 http://127.0.0.1:7890，仅 custom 模式生效）'),
  logLLMDetails: Schema.boolean()
    .default(false)
    .description('是否打印 LLM 请求体和响应详情 (Debug 用)'),
}).description('调试')

// Agent 工具配置 Schema
const agentToolSchema = Schema.object({
  enable: Schema.boolean()
    .default(true)
    .description('开启：注册事实核查为 Chatluna 可调用工具'),
  enableDeepTool: Schema.boolean()
    .default(false)
    .description('开启：注册多源深度搜索工具（legacy，默认关闭，建议使用 deep_search）'),
  enableQuickTool: Schema.boolean()
    .default(true)
    .description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
  name: Schema.string()
    .default('fact_check_deep')
    .description('多源深度搜索工具名称（legacy，建议避免与 fact_check 重名）'),
  quickToolName: Schema.string()
    .default('fact_check')
    .description('快速搜索工具名称（建议保持 fact_check）'),
  description: Schema.string()
    .default('【Legacy】用于多源并行深度搜索。建议优先使用 deep_search 工具进行可迭代深搜。')
    .description('多源深度搜索工具描述（legacy）'),
  quickToolDescription: Schema.string()
    .default('用于快速网络搜索。输入待核查文本，返回来源与摘要，适合作为常规 fact_check 工具。')
    .description('快速搜索工具描述'),
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
  quickToolModel: Schema.dynamic('model')
    .default('')
    .description('Gemini 快速搜索模型（留空时回退 geminiModel/chatlunaSearchModel）'),
  quickToolTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(15000)
    .description('Gemini 快速搜索超时（毫秒）'),
  appendChatlunaSearchContext: Schema.boolean()
    .default(false)
    .description('为 fact_check 工具追加 Chatluna Search Service 上下文（可选）'),
  chatlunaSearchContextTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(12000)
    .description('追加 Chatluna Search 上下文超时（毫秒）'),
  chatlunaSearchContextMaxChars: Schema.number()
    .min(200)
    .max(8000)
    .default(1200)
    .description('追加 Chatluna Search 上下文最大字符数'),
  chatlunaSearchContextMaxSources: Schema.number()
    .min(1)
    .max(20)
    .default(5)
    .description('追加 Chatluna Search 上下文来源数量上限'),
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
  fastReturnMinSuccess: Schema.number()
    .min(1)
    .max(8)
    .default(2)
    .description('fact_check 多源模式：达到该成功来源数后提前返回'),
  fastReturnMaxWaitMs: Schema.number()
    .min(1000)
    .max(120000)
    .default(12000)
    .description('fact_check 多源模式：最大等待时长（毫秒），达到后提前返回'),
  maxFindingsChars: Schema.number()
    .min(200)
    .max(8000)
    .default(2000)
    .description('fact_check 输出中每个来源 findings 的最大字符数'),
}).description('多源搜索配置')

const deepSearchCoreSchema = Schema.object({
  enable: Schema.boolean()
    .default(false)
    .description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
  controllerModel: Schema.dynamic('model')
    .default('google/gemini-3-flash')
    .description('DeepSearch 主控模型（用于规划、评估、综合）'),
  maxIterations: Schema.number()
    .min(1)
    .max(8)
    .default(3)
    .description('DeepSearch 最大迭代轮数'),
  perIterationTimeout: Schema.number()
    .min(5000)
    .max(180000)
    .default(30000)
    .description('DeepSearch 每轮超时（毫秒）'),
  minConfidenceThreshold: Schema.union([
    Schema.number().min(0).max(1).description('最低置信度阈值'),
    Schema.const(null).description('不限制'),
  ])
    .default(null)
    .description('可选：最低置信度阈值（留空则仅按 LLM 评估）'),
  minSourcesThreshold: Schema.union([
    Schema.number().min(1).max(20).description('最少来源数量阈值'),
    Schema.const(null).description('不限制'),
  ])
    .default(null)
    .description('可选：最少来源数量阈值（留空则仅按 LLM 评估）'),
}).description('DeepSearch 迭代搜索')

const deepSearchLLMSourceSchema = Schema.object({
  searchUseGrok: Schema.boolean()
    .default(true)
    .description('DeepSearch LLM 搜索源包含 Grok'),
  searchUseGemini: Schema.boolean()
    .default(true)
    .description('DeepSearch LLM 搜索源包含 Gemini'),
  searchUseChatgpt: Schema.boolean()
    .default(false)
    .description('DeepSearch LLM 搜索源包含 ChatGPT'),
  searchUseDeepseek: Schema.boolean()
    .default(false)
    .description('DeepSearch LLM 搜索源包含 DeepSeek'),
  grokModel: Schema.dynamic('model')
    .default('')
    .description('Grok 模型（留空回退 agent.grokModel/tof.searchModel）'),
  geminiModel: Schema.dynamic('model')
    .default('')
    .description('Gemini 模型（留空回退 agent.geminiModel/tof.searchModel）'),
  chatgptModel: Schema.dynamic('model')
    .default('')
    .description('ChatGPT 模型（留空回退 agent.chatgptModel/tof.searchModel）'),
  deepseekModel: Schema.dynamic('model')
    .default('')
    .description('DeepSeek 模型（留空回退 agent.deepseekModel/tof.searchModel）'),
}).description('LLM 搜索源')

const deepSearchChatlunaIntegrationSchema = Schema.object({
  useChatlunaSearchTool: Schema.boolean()
    .default(true)
    .description('优先尝试调用 web_search 工具执行迭代搜索'),
  usePuppeteerBrowser: Schema.boolean()
    .default(false)
    .description('允许主控计划调用 browser 工具抓取页面'),
}).description('Chatluna 搜索集成')

const deepSearchSearXNGSchema = Schema.object({
  useSearXNG: Schema.boolean()
    .default(false)
    .description('启用 SearXNG 元搜索作为 DeepSearch 的额外来源'),
  searXNGApiBase: Schema.string()
    .default('http://127.0.0.1:8080')
    .description('SearXNG API 基础地址（例如 http://127.0.0.1:8080）'),
  searXNGEngines: Schema.string()
    .default('google,bing,duckduckgo')
    .description('SearXNG engines 参数，逗号分隔'),
  searXNGCategories: Schema.string()
    .default('general')
    .description('SearXNG categories 参数，逗号分隔'),
  searXNGNumResults: Schema.number()
    .min(1)
    .max(50)
    .default(10)
    .description('SearXNG 返回结果数'),
}).description('SearXNG 搜索集成')

export const Config = Schema.intersect([
  Schema.object({
    tof: Schema.intersect([
      tofConfigSchema,
      tofSearchSchema,
      tofOutputSchema,
    ]).description('Tof 命令配置'),
    agent: Schema.intersect([
      agentToolSchema,
      agentMultiSourceSchema,
    ]).description('Agent 工具配置'),
    deepSearch: Schema.intersect([
      deepSearchCoreSchema,
      deepSearchLLMSourceSchema,
      deepSearchChatlunaIntegrationSchema,
      deepSearchSearXNGSchema,
    ]).description('DeepSearch 配置'),
  }),
  Schema.object({
    tof: tofDebugSchema,
  }),
]) as unknown as Schema<Config>
