import { Schema } from 'koishi'

import type { PluginConfig } from './types'

const factCheckDebugSchema = Schema.object({
  maxRetries: Schema.number().min(0).max(5).default(2).description('失败重试次数'),
  proxyMode: Schema.union([
    Schema.const('follow-global').description('遵循全局代理设置'),
    Schema.const('direct').description('不使用代理（仅本插件的 HTTP 请求）'),
    Schema.const('custom').description('使用自定义代理地址（仅本插件的 HTTP 请求）'),
  ]).default('follow-global').description('HTTP 代理模式'),
  proxyAddress: Schema.string().default('').description('自定义 HTTP 代理地址（例如 http://127.0.0.1:7890，仅 custom 模式生效）'),
  logLLMDetails: Schema.boolean().default(false).description('是否打印 LLM 请求体和响应详情 (Debug 用)'),
}).description('调试与排障')

const agentToolSchema = Schema.object({
  enable: Schema.boolean().default(true).description('开启：注册事实核查为 Chatluna 可调用工具'),
  enableQuickTool: Schema.boolean().default(true).description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
  quickToolName: Schema.string().default('fact_check').description('快速搜索工具名称（建议保持 fact_check）'),
  quickToolDescription: Schema.string().default('用于快速网络搜索。输入待核查文本，返回来源与摘要，适合作为常规 fact_check 工具。').description('快速搜索工具描述'),
  maxInputChars: Schema.number().min(100).max(10_000).default(1_200).description('Chatluna 工具单次输入文本最大字符数'),
  maxSources: Schema.number().min(1).max(20).default(5).description('Chatluna 工具返回来源链接数量上限'),
}).description('Fact Check 工具')

const agentSearchSchema = Schema.object({
  // — 多源并行搜索 —
  enableMultiSourceSearch: Schema.boolean().default(true).description('Agent 调用 fact_check 时，启用多源并行搜索'),
  grokModel: Schema.dynamic('model').default('x-ai/grok-4-1').description('Grok 来源模型（FactCheck 与 DeepSearch 共用，留空则跳过 Grok 来源）'),
  geminiModel: Schema.dynamic('model').default('').description('Gemini 来源模型（FactCheck 与 DeepSearch 共用，留空则跳过 Gemini 来源）'),
  perSourceTimeout: Schema.number().min(5_000).max(180_000).default(45_000).description('fact_check 多源模式下每个来源的独立超时时间（毫秒）'),
  fastReturnMinSuccess: Schema.number().min(1).max(8).default(2).description('fact_check 多源模式：达到该成功来源数后提前返回'),
  fastReturnPreferredProvider: Schema.union([
    Schema.const('').description('不指定优先来源'),
    Schema.const('grok').description('优先等待 Grok 来源'),
    Schema.const('gemini').description('优先等待 Gemini 来源'),
  ]).default('').description('fact_check 多源模式：指定优先来源时，优先来源成功后立即返回（其他来源作为补充）'),
  fastReturnMaxWaitMs: Schema.number().min(1_000).max(120_000).default(12_000).description('fact_check 多源模式：最大等待时长（毫秒），达到后提前返回'),
  maxFindingsChars: Schema.number().min(200).max(8_000).default(2_000).description('fact_check 输出中每个来源 findings 的最大字符数'),
  // — 摘要压缩 —
  enableSummary: Schema.boolean().default(true).description('启用摘要压缩：将搜索结果用 LLM 压缩后再注入 character 上下文，防止 token 过长触发 103 错误'),
  summaryModel: Schema.dynamic('model').default('').description('摘要压缩模型（留空则依次回退到 geminiModel → controllerModel）'),
  summaryMaxChars: Schema.number().min(200).max(4_000).default(800).description('摘要压缩目标最大字符数（LLM 被要求将结果压缩到此长度以内）'),
  summaryTimeoutMs: Schema.number().min(3_000).max(60_000).default(15_000).description('摘要压缩超时（毫秒），超时则跳过摘要直接截断'),
}).description('搜索配置')

const deepSearchCoreSchema = Schema.object({
  enable: Schema.boolean().default(false).description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
  asyncEnable: Schema.boolean().default(true).description('启用 DeepSearch 异步任务模式（在 deep_search 中使用 JSON action=submit/status/result）'),
  asyncMaxWorkers: Schema.number().min(1).max(8).default(2).description('DeepSearch 异步任务 worker 并发数（默认保守值 2）'),
  asyncTaskTtlMs: Schema.number().min(60_000).max(86_400_000).default(600_000).description('DeepSearch 异步任务过期时间（毫秒，默认 10 分钟）'),
  asyncMaxQueuedTasks: Schema.number().min(1).max(1_000).default(100).description('DeepSearch 异步任务队列上限（超出将拒绝新任务）'),
  controllerModel: Schema.dynamic('model').default('google/gemini-3-flash').description('DeepSearch 主控模型（用于规划、评估、综合）'),
  maxIterations: Schema.number().min(1).max(8).default(3).description('DeepSearch 最大迭代轮数'),
   perIterationTimeout: Schema.number().min(5_000).max(180_000).default(30_000).description('DeepSearch 每轮超时（毫秒）'),
   minConfidenceThreshold: Schema.union([
     Schema.number().min(0).max(1).description('最低置信度阈值'),
     Schema.const(null).description('不限制'),
   ]).default(null).description('可选：最低置信度阈值（留空则仅按 LLM 评估）'),
   minSourcesThreshold: Schema.union([
     Schema.number().min(1).max(20).description('最少来源数量阈值'),
     Schema.const(null).description('不限制'),
   ]).default(null).description('可选：最少来源数量阈值（留空则仅按 LLM 评估）'),
}).description('迭代搜索')

const grokWebSearchSchema = Schema.object({
  apiBaseUrl: Schema.string().default('http://127.0.0.1:28000/v1').description('Grok 网络搜索 API 基础 URL'),
  timeout: Schema.number().min(5_000).max(180_000).default(90_000).description('Grok 网络搜索超时时间（毫秒）'),
}).description('Grok 网络搜索')

const jinaReaderSchema = Schema.object({
  apiKey: Schema.string().role('secret').default('').description('Jina Reader API Key'),
  timeout: Schema.number().min(5_000).max(60_000).default(30_000).description('Jina Reader 超时时间（毫秒）'),
}).description('Jina Reader 配置')

export const Config: Schema<PluginConfig> = Schema.intersect([
  Schema.object({
    grokWebSearch: grokWebSearchSchema,
    jina: jinaReaderSchema,
    factCheck: Schema.intersect([agentToolSchema, agentSearchSchema]).description('FactCheck 基础'),
    deepSearch: deepSearchCoreSchema.description('DeepSearch'),
    debug: factCheckDebugSchema.description('调试与排障'),
  }),
]) as Schema<PluginConfig>
