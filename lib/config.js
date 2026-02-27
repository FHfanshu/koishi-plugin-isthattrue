"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const koishi_1 = require("koishi");
// Tof 命令配置 Schema
const tofConfigSchema = koishi_1.Schema.object({
    model: koishi_1.Schema.dynamic('model')
        .default('google/gemini-3-flash')
        .description('判决模型 (用于最终判决，推荐 Gemini-3-Flash)'),
    searchModel: koishi_1.Schema.dynamic('model')
        .default('x-ai/grok-4-1')
        .description('搜索模型 (用于深度搜索，推荐 Grok-4-1)'),
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
}).description('基础设置');
const tofSearchSchema = koishi_1.Schema.object({
    tavilyApiKey: koishi_1.Schema.string()
        .default('')
        .role('secret')
        .description('Tavily API Key (可选，用于补充搜索)'),
    chatlunaSearchModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Chatluna Search 使用的模型 (可选；chatluna-search-service 不稳定时可留空并使用 fact_check 工具替代)'),
    enableChatlunaSearch: koishi_1.Schema.boolean()
        .default(false)
        .description('启用 Chatluna 搜索集成（默认关闭，建议优先使用 fact_check 工具作为 LLMSearch 替代）'),
    chatlunaSearchDiversifyModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('搜索关键词多样化模型 (可选，推荐 Gemini 2.5 Flash Lite)'),
}).description('搜索集成');
const tofOutputSchema = koishi_1.Schema.object({
    outputFormat: koishi_1.Schema.union([
        koishi_1.Schema.const('auto').description('自动 (QQ 使用纯文本)'),
        koishi_1.Schema.const('markdown').description('Markdown'),
        koishi_1.Schema.const('plain').description('纯文本'),
    ]).default('auto').description('输出格式'),
    useForwardMessage: koishi_1.Schema.boolean()
        .default(true)
        .description('使用合并转发消息展示详情 (仅支持 QQ)'),
    forwardMaxNodes: koishi_1.Schema.number()
        .min(0)
        .max(99)
        .default(8)
        .description('合并转发最大节点数，超过则回退普通消息（0 表示直接回退）'),
    forwardMaxTotalChars: koishi_1.Schema.number()
        .min(0)
        .max(20000)
        .default(3000)
        .description('合并转发总字符数上限，超过则回退普通消息（0 表示直接回退）'),
    forwardMaxSegmentChars: koishi_1.Schema.number()
        .min(50)
        .max(2000)
        .default(500)
        .description('合并转发单节点字符数上限'),
    verbose: koishi_1.Schema.boolean()
        .default(false)
        .description('显示详细验证过程 (进度提示)'),
}).description('输出格式');
const tofDebugSchema = koishi_1.Schema.object({
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
}).description('调试');
// Agent 工具配置 Schema
const agentToolSchema = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean()
        .default(true)
        .description('开启：注册事实核查为 Chatluna 可调用工具'),
    enableDeepTool: koishi_1.Schema.boolean()
        .default(false)
        .description('开启：注册多源深度搜索工具（legacy，默认关闭，建议使用 deep_search）'),
    enableQuickTool: koishi_1.Schema.boolean()
        .default(true)
        .description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
    name: koishi_1.Schema.string()
        .default('fact_check_deep')
        .description('多源深度搜索工具名称（legacy，建议避免与 fact_check 重名）'),
    quickToolName: koishi_1.Schema.string()
        .default('fact_check')
        .description('快速搜索工具名称（建议保持 fact_check）'),
    description: koishi_1.Schema.string()
        .default('【Legacy】用于多源并行深度搜索。建议优先使用 deep_search 工具进行可迭代深搜。')
        .description('多源深度搜索工具描述（legacy）'),
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
        .description('Gemini 快速搜索模型（留空时回退 geminiModel/chatlunaSearchModel）'),
    quickToolTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(15000)
        .description('Gemini 快速搜索超时（毫秒）'),
    appendChatlunaSearchContext: koishi_1.Schema.boolean()
        .default(false)
        .description('为 fact_check 工具追加 Chatluna Search Service 上下文（可选）'),
    chatlunaSearchContextTimeout: koishi_1.Schema.number()
        .min(3000)
        .max(120000)
        .default(12000)
        .description('追加 Chatluna Search 上下文超时（毫秒）'),
    chatlunaSearchContextMaxChars: koishi_1.Schema.number()
        .min(200)
        .max(8000)
        .default(1200)
        .description('追加 Chatluna Search 上下文最大字符数'),
    chatlunaSearchContextMaxSources: koishi_1.Schema.number()
        .min(1)
        .max(20)
        .default(5)
        .description('追加 Chatluna Search 上下文来源数量上限'),
}).description('Fact Check 工具');
const agentMultiSourceSchema = koishi_1.Schema.object({
    enableMultiSourceSearch: koishi_1.Schema.boolean()
        .default(true)
        .description('Agent 调用 fact_check 时，启用多源并行搜索'),
    searchUseGrok: koishi_1.Schema.boolean()
        .default(true)
        .description('多源搜索包含 Grok'),
    searchUseGemini: koishi_1.Schema.boolean()
        .default(true)
        .description('多源搜索包含 Gemini（需模型支持搜索工具）'),
    searchUseChatgpt: koishi_1.Schema.boolean()
        .default(false)
        .description('多源搜索包含 ChatGPT（需模型支持搜索工具）'),
    searchUseDeepseek: koishi_1.Schema.boolean()
        .default(false)
        .description('多源搜索包含 DeepSeek（需模型支持搜索工具）'),
    grokModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Grok 来源模型（留空时回退 searchModel）'),
    geminiModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Gemini 来源模型（留空则跳过 Gemini 来源）'),
    chatgptModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('ChatGPT 来源模型（留空则跳过 ChatGPT 来源）'),
    deepseekModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('DeepSeek 来源模型（留空则跳过 DeepSeek 来源）'),
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
}).description('多源搜索配置');
const deepSearchCoreSchema = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean()
        .default(false)
        .description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
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
    searchUseGrok: koishi_1.Schema.boolean()
        .default(true)
        .description('DeepSearch LLM 搜索源包含 Grok'),
    searchUseGemini: koishi_1.Schema.boolean()
        .default(true)
        .description('DeepSearch LLM 搜索源包含 Gemini'),
    searchUseChatgpt: koishi_1.Schema.boolean()
        .default(false)
        .description('DeepSearch LLM 搜索源包含 ChatGPT'),
    searchUseDeepseek: koishi_1.Schema.boolean()
        .default(false)
        .description('DeepSearch LLM 搜索源包含 DeepSeek'),
    grokModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Grok 模型（留空回退 agent.grokModel/tof.searchModel）'),
    geminiModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('Gemini 模型（留空回退 agent.geminiModel/tof.searchModel）'),
    chatgptModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('ChatGPT 模型（留空回退 agent.chatgptModel/tof.searchModel）'),
    deepseekModel: koishi_1.Schema.dynamic('model')
        .default('')
        .description('DeepSeek 模型（留空回退 agent.deepseekModel/tof.searchModel）'),
}).description('LLM 搜索源');
const deepSearchChatlunaIntegrationSchema = koishi_1.Schema.object({
    useChatlunaSearchTool: koishi_1.Schema.boolean()
        .default(true)
        .description('优先尝试调用 web_search 工具执行迭代搜索'),
    usePuppeteerBrowser: koishi_1.Schema.boolean()
        .default(false)
        .description('允许主控计划调用 browser 工具抓取页面'),
}).description('Chatluna 搜索集成');
const deepSearchSearXNGSchema = koishi_1.Schema.object({
    useSearXNG: koishi_1.Schema.boolean()
        .default(false)
        .description('启用 SearXNG 元搜索作为 DeepSearch 的额外来源'),
    searXNGApiBase: koishi_1.Schema.string()
        .default('http://127.0.0.1:8080')
        .description('SearXNG API 基础地址（例如 http://127.0.0.1:8080）'),
    searXNGEngines: koishi_1.Schema.string()
        .default('google,bing,duckduckgo')
        .description('SearXNG engines 参数，逗号分隔'),
    searXNGCategories: koishi_1.Schema.string()
        .default('general')
        .description('SearXNG categories 参数，逗号分隔'),
    searXNGNumResults: koishi_1.Schema.number()
        .min(1)
        .max(50)
        .default(10)
        .description('SearXNG 返回结果数'),
}).description('SearXNG 搜索集成');
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        tof: koishi_1.Schema.intersect([
            tofConfigSchema,
            tofSearchSchema,
            tofOutputSchema,
        ]).description('Tof 命令配置'),
        agent: koishi_1.Schema.intersect([
            agentToolSchema,
            agentMultiSourceSchema,
        ]).description('Agent 工具配置'),
        deepSearch: koishi_1.Schema.intersect([
            deepSearchCoreSchema,
            deepSearchLLMSourceSchema,
            deepSearchChatlunaIntegrationSchema,
            deepSearchSearXNGSchema,
        ]).description('DeepSearch 配置'),
    }),
    koishi_1.Schema.object({
        tof: tofDebugSchema,
    }),
]);
