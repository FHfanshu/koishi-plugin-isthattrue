import { Schema } from 'koishi'

/**
 * FactCheck 运行配置
 */
export interface FactCheckConfig {
  /** 超时时间（毫秒） */
  timeout: number
  /** 最大重试次数 */
  maxRetries: number
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
  /** 是否注册快速搜索工具（默认作为 fact_check） */
  enableQuickTool: boolean
  /** 快速搜索工具名称 */
  quickToolName: string
  /** 快速搜索工具描述 */
  quickToolDescription: string
  /** 工具输入最大长度 */
  maxInputChars: number
  /** 工具返回来源数量上限 */
  maxSources: number
  /** Gemini 快速搜索模型（留空时回退 geminiModel/factCheck.chatlunaSearchModel） */
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
  /** 追加 Ollama Search 上下文到 fact_check 工具输出 */
  appendOllamaSearchContext: boolean
  /** 追加 Ollama Search 上下文超时（毫秒） */
  ollamaSearchContextTimeout: number
  /** 追加 Ollama Search 上下文最大字符数 */
  ollamaSearchContextMaxChars: number
  /** 追加 Ollama Search 上下文来源数量上限 */
  ollamaSearchContextMaxSources: number
  /** 启用多源并行搜索 */
  enableMultiSourceSearch: boolean
  /** Grok 模型 */
  grokModel: string
  /** Gemini 模型 */
  geminiModel: string
  /** ChatGPT 模型 */
  chatgptModel: string
  /** Ollama Search 返回结果数 */
  ollamaSearchMaxResults: number
  /** Ollama Search 超时（毫秒） */
  ollamaSearchTimeout: number
  /** 每个来源超时（毫秒） */
  perSourceTimeout: number
  /** 多源快速返回：最少成功来源数（达到即提前返回） */
  fastReturnMinSuccess: number
  /** 多源快速返回：最大等待时长（毫秒） */
  fastReturnMaxWaitMs: number
  /** 每个来源输出最大长度 */
  maxFindingsChars: number
  /** 启用异步模式（工具秒返，完成后自动推送结果到会话，规避 chatluna-character 锁超时） */
  asyncMode: boolean
}

/**
 * DeepSearch 配置
 * 用于迭代搜索主控与 deep_search 工具
 */
export interface DeepSearchConfig {
  /** 是否启用 DeepSearch 模式（主流程与工具注册） */
  enable: boolean
  /** 是否启用 DeepSearch 异步任务模式（deep_search 的 submit/status/result） */
  asyncEnable: boolean
  /** DeepSearch 异步任务最大并发 worker 数 */
  asyncMaxWorkers: number
  /** DeepSearch 异步任务过期时间（毫秒） */
  asyncTaskTtlMs: number
  /** DeepSearch 异步任务队列上限（包含运行中与排队中任务） */
  asyncMaxQueuedTasks: number
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
  /** Grok 模型（留空则跳过 Grok 源） */
  grokModel: string
  /** Gemini 模型（留空则跳过 Gemini 源） */
  geminiModel: string
  /** ChatGPT 模型（留空则跳过 ChatGPT 源） */
  chatgptModel: string
  /** Ollama Search 返回结果数 */
  ollamaSearchMaxResults: number
  /** Ollama Search 超时（毫秒） */
  ollamaSearchTimeout: number
  /** 允许使用 chatluna-search-service 的 web_search 工具 */
  useChatlunaSearchTool: boolean
  /** 允许使用 chatluna-search-service 的 browser 工具 */
  usePuppeteerBrowser: boolean
}

/**
 * API Key / Base URL 统一配置
 */
export interface ApiConfig {
  /** Ollama API Key */
  ollamaApiKey: string
  /** Ollama Base URL（留空使用默认） */
  ollamaBaseUrl: string
  /** 是否启用 Ollama 搜索 */
  ollamaEnabled: boolean
}

/**
 * 插件配置 Schema
 */
export interface Config {
  /** API Key / Base URL 统一配置 */
  api: ApiConfig
  /** FactCheck 运行配置 */
  factCheck: FactCheckConfig
  /** Agent 工具配置 */
  agent: AgentToolConfig
  /** DeepSearch 配置 */
  deepSearch: DeepSearchConfig
}

// FactCheck 运行配置 Schema
const factCheckDebugSchema = Schema.object({
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
}).description('调试与排障')

// Agent 工具配置 Schema
const agentToolSchema = Schema.object({
  enable: Schema.boolean()
    .default(true)
    .description('开启：注册事实核查为 Chatluna 可调用工具'),
  enableQuickTool: Schema.boolean()
    .default(true)
    .description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
  quickToolName: Schema.string()
    .default('fact_check')
    .description('快速搜索工具名称（建议保持 fact_check）'),
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
    .description('Gemini 快速搜索模型（留空时回退 geminiModel/factCheck.chatlunaSearchModel）'),
  quickToolTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(15000)
    .description('Gemini 快速搜索超时（毫秒）'),
}).description('Fact Check 工具')

const agentContextInjectionSchema = Schema.object({
  appendChatlunaSearchContext: Schema.boolean()
    .default(false)
    .description('为 fact_check 输出追加 Chatluna Search 上下文（仅附加参考，不改变最终判定流程）'),
  chatlunaSearchContextTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(12000)
    .description('Chatluna Search 上下文查询超时（毫秒）；超时仅跳过附加上下文'),
  chatlunaSearchContextMaxChars: Schema.number()
    .min(200)
    .max(8000)
    .default(1200)
    .description('附加的 Chatluna Search 上下文最大字符数（防止输出过长）'),
  chatlunaSearchContextMaxSources: Schema.number()
    .min(1)
    .max(20)
    .default(5)
    .description('附加的 Chatluna Search 来源数量上限'),
  appendOllamaSearchContext: Schema.boolean()
    .default(false)
    .description('为 fact_check 输出追加 Ollama Search 上下文（仅附加参考，不改变最终判定流程）'),
  ollamaSearchContextTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(12000)
    .description('Ollama Search 上下文查询超时（毫秒）；超时仅跳过附加上下文'),
  ollamaSearchContextMaxChars: Schema.number()
    .min(200)
    .max(8000)
    .default(1200)
    .description('附加的 Ollama Search 上下文最大字符数（防止输出过长）'),
  ollamaSearchContextMaxSources: Schema.number()
    .min(1)
    .max(20)
    .default(5)
    .description('附加的 Ollama Search 来源数量上限'),
}).description('搜索源上下文注入')

const agentMultiSourceSchema = Schema.object({
  enableMultiSourceSearch: Schema.boolean()
    .default(true)
    .description('Agent 调用 fact_check 时，启用多源并行搜索'),
  grokModel: Schema.dynamic('model')
    .default('x-ai/grok-4-1')
    .description('Grok 来源模型（留空则跳过 Grok 来源）'),
  geminiModel: Schema.dynamic('model')
    .default('')
    .description('Gemini 来源模型（留空则跳过 Gemini 来源）'),
  chatgptModel: Schema.dynamic('model')
    .default('')
    .description('ChatGPT 来源模型（留空则跳过 ChatGPT 来源）'),
  ollamaSearchMaxResults: Schema.number()
    .min(1)
    .max(10)
    .default(5)
    .description('Ollama Search 返回结果数'),
  ollamaSearchTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(15000)
    .description('Ollama Search 超时（毫秒）'),
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
  asyncMode: Schema.boolean()
    .default(true)
    .description('启用异步模式：工具秒返"任务已启动"，完成后自动推送结果到会话。\\n开启后可规避 chatluna-character 的 180 秒锁超时，适合搜索耗时较长的场景。'),
}).description('多源搜索配置')

const deepSearchCoreSchema = Schema.object({
  enable: Schema.boolean()
    .default(false)
    .description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
  asyncEnable: Schema.boolean()
    .default(true)
    .description('启用 DeepSearch 异步任务模式（在 deep_search 中使用 JSON action=submit/status/result）'),
  asyncMaxWorkers: Schema.number()
    .min(1)
    .max(8)
    .default(2)
    .description('DeepSearch 异步任务 worker 并发数（默认保守值 2）'),
  asyncTaskTtlMs: Schema.number()
    .min(60000)
    .max(86400000)
    .default(600000)
    .description('DeepSearch 异步任务过期时间（毫秒，默认 10 分钟）'),
  asyncMaxQueuedTasks: Schema.number()
    .min(1)
    .max(1000)
    .default(100)
    .description('DeepSearch 异步任务队列上限（超出将拒绝新任务）'),
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
  grokModel: Schema.dynamic('model')
    .default('x-ai/grok-4-1')
    .description('Grok 模型（留空则跳过 Grok 源）'),
  geminiModel: Schema.dynamic('model')
    .default('')
    .description('Gemini 模型（留空则跳过 Gemini 源）'),
  chatgptModel: Schema.dynamic('model')
    .default('')
    .description('ChatGPT 模型（留空则跳过 ChatGPT 源）'),
  ollamaSearchMaxResults: Schema.number()
    .min(1)
    .max(10)
    .default(5)
    .description('Ollama Search 返回结果数'),
  ollamaSearchTimeout: Schema.number()
    .min(3000)
    .max(120000)
    .default(15000)
    .description('Ollama Search 超时（毫秒）'),
}).description('LLM 搜索源')

const deepSearchChatlunaIntegrationSchema = Schema.object({
  useChatlunaSearchTool: Schema.boolean()
    .default(true)
    .description('优先尝试调用 web_search 工具执行迭代搜索'),
  usePuppeteerBrowser: Schema.boolean()
    .default(false)
    .description('允许主控计划调用 browser 工具抓取页面'),
}).description('Chatluna 搜索集成')

const apiUnifiedSchema = Schema.object({
  ollamaApiKey: Schema.string()
    .role('secret')
    .default('')
    .description('Ollama API Key（从 https://ollama.com 获取，填入后即可启用 Ollama 搜索）'),
  ollamaBaseUrl: Schema.string()
    .default('')
    .description('Ollama Base URL（留空使用默认 https://ollama.com/api/web_search）'),
  ollamaEnabled: Schema.boolean()
    .default(true)
    .description('启用 Ollama 搜索（关闭后不会作为 fact_check 搜索来源）'),
}).description('Ollama 配置')

export const Config = Schema.intersect([
  Schema.object({
    api: apiUnifiedSchema,
    agent: Schema.intersect([
      agentToolSchema,
      agentContextInjectionSchema,
      agentMultiSourceSchema,
    ]).description('FactCheck 基础'),
    deepSearch: Schema.intersect([
      deepSearchCoreSchema,
      deepSearchLLMSourceSchema,
      deepSearchChatlunaIntegrationSchema,
    ]).description('DeepSearch'),
    factCheck: factCheckDebugSchema.description('FactCheck 运行配置'),
  }),
]) as unknown as Schema<Config>
