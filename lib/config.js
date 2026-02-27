"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const koishi_1 = require("koishi");
// FactCheck 运行配置 Schema
const factCheckDebugSchema = koishi_1.Schema.object({
    timeout: koishi_1.Schema.number()
        .min(10000)
        .max(300000)
        .default(60000)
        .description('单次请求超时时间 (毫秒)'),
    maxRetries: koishi_1.Schema.number()
        .min(0)
        .max(5)
        .default(2)
        .description('失败重试次数'),
    proxyMode: koishi_1.Schema.union([
        koishi_1.Schema.const('follow-global').description('遵循全局代理设置'),
        koishi_1.Schema.const('direct').description('不使用代理（仅本插件的 HTTP 请求）'),
        koishi_1.Schema.const('custom').description('使用自定义代理地址（仅本插件的 HTTP 请求）'),
    ]).default('follow-global').description('HTTP 代理模式'),
    proxyAddress: koishi_1.Schema.string()
        .default('')
        .description('自定义 HTTP 代理地址（例如 http://127.0.0.1:7890，仅 custom 模式生效）'),
    logLLMDetails: koishi_1.Schema.boolean()
        .default(false)
        .description('是否打印 LLM 请求体和响应详情 (Debug 用)'),
}).description('调试与排障');
// Agent 工具配置 Schema
const agentToolSchema = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean()
        .default(true)
        .description('开启：注册事实核查为 Chatluna 可调用工具'),
    enableQuickTool: koishi_1.Schema.boolean()
        .default(true)
        .description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
    quickToolName: koishi_1.Schema.string()
        .default('fact_check')
        .description('快速搜索工具名称（建议保持 fact_check）'),
    quickToolDescription: koishi_1.Schema.string()
        .default('用于快速网络搜索。输入待核查文本，返回来源与摘要，适合作为常规 fact_check 工具。')
        .description('快速搜索工具描述'),
    maxInputChars: koishi_1.Schema.number()
        .min(100)
        .max(10000)
        .default(1200)
        .description('Chatluna 工具单次输入文本最大字符数'),
    maxSources: koishi_1.Schema.number()
        .min(1)
        .max(20)
        .default(5)
        .description('Chatluna 工具返回来源链接数量上限'),
    quickToolModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Gemini 快速搜索模型（留空时回退 geminiModel/factCheck.chatlunaSearchModel）'),
    quickToolTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(15000)
        .description('Gemini 快速搜索超时（毫秒）'),
}).description('Fact Check 工具');
const agentContextInjectionSchema = koishi_1.Schema.object({
    appendChatlunaSearchContext: koishi_1.Schema.boolean()
        .default(false)
        .description('为 fact_check 输出追加 Chatluna Search 上下文（仅附加参考，不改变最终判定流程）'),
    chatlunaSearchContextTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(12000)
        .description('Chatluna Search 上下文查询超时（毫秒）；超时仅跳过附加上下文'),
    chatlunaSearchContextMaxChars: koishi_1.Schema.number()
        .min(200)
        .max(8000)
        .default(1200)
        .description('附加的 Chatluna Search 上下文最大字符数（防止输出过长）'),
    chatlunaSearchContextMaxSources: koishi_1.Schema.number()
        .min(1)
        .max(20)
        .default(5)
        .description('附加的 Chatluna Search 来源数量上限'),
    appendOllamaSearchContext: koishi_1.Schema.boolean()
        .default(false)
        .description('为 fact_check 输出追加 Ollama Search 上下文（仅附加参考，不改变最终判定流程）'),
    ollamaSearchContextTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(12000)
        .description('Ollama Search 上下文查询超时（毫秒）；超时仅跳过附加上下文'),
    ollamaSearchContextMaxChars: koishi_1.Schema.number()
        .min(200)
        .max(8000)
        .default(1200)
        .description('附加的 Ollama Search 上下文最大字符数（防止输出过长）'),
    ollamaSearchContextMaxSources: koishi_1.Schema.number()
        .min(1)
        .max(20)
        .default(5)
        .description('附加的 Ollama Search 来源数量上限'),
}).description('搜索源上下文注入');
const agentMultiSourceSchema = koishi_1.Schema.object({
    enableMultiSourceSearch: koishi_1.Schema.boolean()
        .default(true)
        .description('Agent 调用 fact_check 时，启用多源并行搜索'),
    grokModel: koishi_1.Schema.dynamic('model')
        .default('x-ai/grok-4-1')
        .description('Grok 来源模型（留空则跳过 Grok 来源）'),
    geminiModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Gemini 来源模型（留空则跳过 Gemini 来源）'),
    chatgptModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('ChatGPT 来源模型（留空则跳过 ChatGPT 来源）'),
    ollamaSearchMaxResults: koishi_1.Schema.number()
        .min(1)
        .max(10)
        .default(5)
        .description('Ollama Search 返回结果数'),
    ollamaSearchTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(15000)
        .description('Ollama Search 超时（毫秒）'),
    perSourceTimeout: koishi_1.Schema.number()
        .min(5000)
        .max(180000)
        .default(45000)
        .description('fact_check 多源模式下每个来源的独立超时时间（毫秒）'),
    fastReturnMinSuccess: koishi_1.Schema.number()
        .min(1)
        .max(8)
        .default(2)
        .description('fact_check 多源模式：达到该成功来源数后提前返回'),
    fastReturnMaxWaitMs: koishi_1.Schema.number()
        .min(1000)
        .max(120000)
        .default(12000)
        .description('fact_check 多源模式：最大等待时长（毫秒），达到后提前返回'),
    maxFindingsChars: koishi_1.Schema.number()
        .min(200)
        .max(8000)
        .default(2000)
        .description('fact_check 输出中每个来源 findings 的最大字符数'),
    asyncMode: koishi_1.Schema.boolean()
        .default(true)
        .description('启用异步模式：工具秒返"任务已启动"，完成后自动推送结果到会话。\\n开启后可规避 chatluna-character 的 180 秒锁超时，适合搜索耗时较长的场景。'),
}).description('多源搜索配置');
const deepSearchCoreSchema = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean()
        .default(false)
        .description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
    asyncEnable: koishi_1.Schema.boolean()
        .default(true)
        .description('启用 DeepSearch 异步任务模式（在 deep_search 中使用 JSON action=submit/status/result）'),
    asyncMaxWorkers: koishi_1.Schema.number()
        .min(1)
        .max(8)
        .default(2)
        .description('DeepSearch 异步任务 worker 并发数（默认保守值 2）'),
    asyncTaskTtlMs: koishi_1.Schema.number()
        .min(60000)
        .max(86400000)
        .default(600000)
        .description('DeepSearch 异步任务过期时间（毫秒，默认 10 分钟）'),
    asyncMaxQueuedTasks: koishi_1.Schema.number()
        .min(1)
        .max(1000)
        .default(100)
        .description('DeepSearch 异步任务队列上限（超出将拒绝新任务）'),
    controllerModel: koishi_1.Schema.dynamic('model')
        .default('google/gemini-3-flash')
        .description('DeepSearch 主控模型（用于规划、评估、综合）'),
    maxIterations: koishi_1.Schema.number()
        .min(1)
        .max(8)
        .default(3)
        .description('DeepSearch 最大迭代轮数'),
    perIterationTimeout: koishi_1.Schema.number()
        .min(5000)
        .max(180000)
        .default(30000)
        .description('DeepSearch 每轮超时（毫秒）'),
    minConfidenceThreshold: koishi_1.Schema.union([
        koishi_1.Schema.number().min(0).max(1).description('最低置信度阈值'),
        koishi_1.Schema.const(null).description('不限制'),
    ])
        .default(null)
        .description('可选：最低置信度阈值（留空则仅按 LLM 评估）'),
    minSourcesThreshold: koishi_1.Schema.union([
        koishi_1.Schema.number().min(1).max(20).description('最少来源数量阈值'),
        koishi_1.Schema.const(null).description('不限制'),
    ])
        .default(null)
        .description('可选：最少来源数量阈值（留空则仅按 LLM 评估）'),
}).description('DeepSearch 迭代搜索');
const deepSearchLLMSourceSchema = koishi_1.Schema.object({
    grokModel: koishi_1.Schema.dynamic('model')
        .default('x-ai/grok-4-1')
        .description('Grok 模型（留空则跳过 Grok 源）'),
    geminiModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Gemini 模型（留空则跳过 Gemini 源）'),
    chatgptModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('ChatGPT 模型（留空则跳过 ChatGPT 源）'),
    ollamaSearchMaxResults: koishi_1.Schema.number()
        .min(1)
        .max(10)
        .default(5)
        .description('Ollama Search 返回结果数'),
    ollamaSearchTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(15000)
        .description('Ollama Search 超时（毫秒）'),
}).description('LLM 搜索源');
const deepSearchChatlunaIntegrationSchema = koishi_1.Schema.object({
    useChatlunaSearchTool: koishi_1.Schema.boolean()
        .default(true)
        .description('优先尝试调用 web_search 工具执行迭代搜索'),
    usePuppeteerBrowser: koishi_1.Schema.boolean()
        .default(false)
        .description('允许主控计划调用 browser 工具抓取页面'),
}).description('Chatluna 搜索集成');
const apiUnifiedSchema = koishi_1.Schema.object({
    ollamaApiKey: koishi_1.Schema.string()
        .role('secret')
        .default('')
        .description('Ollama API Key（从 https://ollama.com 获取，填入后即可启用 Ollama 搜索）'),
    ollamaBaseUrl: koishi_1.Schema.string()
        .default('')
        .description('Ollama Base URL（留空使用默认 https://ollama.com/api/web_search）'),
    ollamaEnabled: koishi_1.Schema.boolean()
        .default(true)
        .description('启用 Ollama 搜索（关闭后不会作为 fact_check 搜索来源）'),
}).description('Ollama 配置');
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        api: apiUnifiedSchema,
        agent: koishi_1.Schema.intersect([
            agentToolSchema,
            agentContextInjectionSchema,
            agentMultiSourceSchema,
        ]).description('FactCheck 基础'),
        deepSearch: koishi_1.Schema.intersect([
            deepSearchCoreSchema,
            deepSearchLLMSourceSchema,
            deepSearchChatlunaIntegrationSchema,
        ]).description('DeepSearch'),
        factCheck: factCheckDebugSchema.description('FactCheck 运行配置'),
    }),
]);
