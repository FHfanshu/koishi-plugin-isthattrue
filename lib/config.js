"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const koishi_1 = require("koishi");
const toolsSchema = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        factCheckEnable: koishi_1.Schema.boolean().default(true).description('开启：注册事实核查为 Chatluna 可调用工具'),
        enableQuickTool: koishi_1.Schema.boolean().default(true).description('开启：注册快速网络搜索工具（默认工具名为 fact_check）'),
        quickToolName: koishi_1.Schema.string().default('fact_check').description('快速搜索工具名称（建议保持 fact_check）'),
        quickToolDescription: koishi_1.Schema.string().default('用于联网事实核查与时效信息搜索。默认优先返回 GrokSearch 的 findings 与原始来源链接，供上层 Agent 直接使用。').description('快速搜索工具描述'),
        maxInputChars: koishi_1.Schema.number().min(100).max(10000).default(1200).description('Chatluna 工具单次输入文本最大字符数'),
        maxSources: koishi_1.Schema.number().min(1).max(20).default(5).description('Chatluna 工具返回来源链接数量上限'),
        forceExposeSources: koishi_1.Schema.boolean().default(true).description('默认强制附带可直接发送给用户的原始来源链接区块，不由上层 LLM 自行决定是否附带'),
    }).description('Fact Check 工具'),
    koishi_1.Schema.object({
        deepSearchEnable: koishi_1.Schema.boolean().default(false).description('启用 DeepSearch 迭代搜索模式（同时注册 deep_search 工具）'),
    }).description('Deep Search 工具'),
    koishi_1.Schema.object({
        webFetchEnable: koishi_1.Schema.boolean().default(false).description('启用 web_fetch 工具注册'),
        webFetchToolName: koishi_1.Schema.string().default('web_fetch').description('web_fetch 工具名称'),
        webFetchToolDescription: koishi_1.Schema.string().default('用于获取指定 URL 的网页内容。输入 URL，返回提取后的正文文本。').description('web_fetch 工具描述'),
        webFetchMaxContentChars: koishi_1.Schema.number().min(500).max(50000).default(8000).description('web_fetch 返回内容最大字符数（超出则截断）'),
        webFetchProviderOrder: koishi_1.Schema.union([
            koishi_1.Schema.const('grok-first').description('优先 Grok，失败后回退 Jina Reader'),
            koishi_1.Schema.const('jina-first').description('优先 Jina Reader，失败后回退 Grok'),
        ]).default('grok-first').description('web_fetch 双源抓取排序配置'),
    }).description('Web Fetch 工具'),
]).description('工具注册');
const modelsSchema = koishi_1.Schema.object({
    grokModel: koishi_1.Schema.dynamic('model').default('Grok2api/grok-4.1-fast').description('FactCheck 使用的 Grok 来源模型（留空则跳过 Grok 来源）'),
    deepSearchGrokModel: koishi_1.Schema.dynamic('model').default('').description('DeepSearch 专用 Grok 模型（建议使用非 beta；留空则回退使用 grokModel）'),
    geminiModel: koishi_1.Schema.dynamic('model').default('').description('Gemini 来源模型（FactCheck 与 DeepSearch 共用，留空则跳过 Gemini 来源）'),
    controllerModel: koishi_1.Schema.dynamic('model').default('google/gemini-3-flash').description('DeepSearch 主控模型（用于规划、评估、综合）'),
    summaryModel: koishi_1.Schema.dynamic('model').default('').description('摘要压缩模型（留空则依次回退到 geminiModel → controllerModel）'),
}).description('LLM AI 接入');
const searchSchema = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        enableMultiSourceSearch: koishi_1.Schema.boolean().default(true).description('Agent 调用 fact_check 时，启用多源并行搜索'),
        fastReturnMinSuccess: koishi_1.Schema.number().min(1).max(8).default(2).description('fact_check 多源模式：达到该成功来源数后提前返回'),
        fastReturnPreferredProvider: koishi_1.Schema.union([
            koishi_1.Schema.const('').description('不指定优先来源'),
            koishi_1.Schema.const('grok').description('优先等待 Grok 来源'),
            koishi_1.Schema.const('gemini').description('优先等待 Gemini 来源'),
        ]).default('grok').description('fact_check 多源模式：指定优先来源时，优先来源成功后立即返回（其他来源作为补充）'),
    }).description('排序与策略'),
    koishi_1.Schema.object({
        maxFindingsChars: koishi_1.Schema.number().min(200).max(8000).default(2000).description('fact_check 输出中每个来源 findings 的最大字符数'),
        summaryMaxChars: koishi_1.Schema.number().min(200).max(4000).default(800).description('摘要压缩目标最大字符数（LLM 被要求将结果压缩到此长度以内）'),
    }).description('最大字数'),
    koishi_1.Schema.object({
        perSourceTimeout: koishi_1.Schema.number().min(5).max(180).default(45).description('fact_check 多源模式下每个来源的独立超时时间（秒）'),
        fastReturnMaxWait: koishi_1.Schema.number().min(1).max(120).default(12).description('fact_check 多源模式：最大等待时长（秒），达到后提前返回'),
        summaryTimeout: koishi_1.Schema.number().min(3).max(60).default(15).description('摘要压缩超时（秒），超时则跳过摘要直接截断'),
        perIterationTimeout: koishi_1.Schema.number().min(5).max(180).default(30).description('DeepSearch 每轮超时（秒）'),
        asyncTaskTtl: koishi_1.Schema.number().min(60).max(86400).default(600).description('DeepSearch 异步任务过期时间（秒，默认 10 分钟）'),
    }).description('超时配置'),
    koishi_1.Schema.object({
        enableSummary: koishi_1.Schema.boolean().default(false).description('启用摘要压缩：将搜索结果用 LLM 压缩后再注入 character 上下文，防止 token 过长触发 103 错误'),
        maxIterations: koishi_1.Schema.number().min(1).max(8).default(3).description('DeepSearch 最大迭代轮数'),
        asyncEnable: koishi_1.Schema.boolean().default(true).description('启用 DeepSearch 异步任务模式（在 deep_search 中使用 JSON action=submit/status/result）'),
        asyncMaxWorkers: koishi_1.Schema.number().min(1).max(8).default(2).description('DeepSearch 异步任务 worker 并发数（默认保守值 2）'),
        asyncMaxQueuedTasks: koishi_1.Schema.number().min(1).max(1000).default(100).description('DeepSearch 异步任务队列上限（超出将拒绝新任务）'),
        minConfidenceThreshold: koishi_1.Schema.union([
            koishi_1.Schema.number().min(0).max(1).description('最低置信度阈值'),
            koishi_1.Schema.const(null).description('不限制'),
        ]).default(null).description('可选：最低置信度阈值（留空则仅按 LLM 评估）'),
        minSourcesThreshold: koishi_1.Schema.union([
            koishi_1.Schema.number().min(1).max(20).description('最少来源数量阈值'),
            koishi_1.Schema.const(null).description('不限制'),
        ]).default(null).description('可选：最少来源数量阈值（留空则仅按 LLM 评估）'),
    }).description('搜索控制'),
]).description('搜索策略');
const servicesSchema = koishi_1.Schema.object({
    jinaApiKey: koishi_1.Schema.string().role('secret').default('').description('Jina Reader API Key'),
    jinaTimeout: koishi_1.Schema.number().min(5).max(60).default(30).description('Jina Reader 超时时间（秒）'),
}).description('外部服务');
const debugSchema = koishi_1.Schema.object({
    maxRetries: koishi_1.Schema.number().min(0).max(5).default(2).description('失败重试次数'),
    proxyMode: koishi_1.Schema.union([
        koishi_1.Schema.const('follow-global').description('遵循全局代理设置'),
        koishi_1.Schema.const('direct').description('不使用代理（仅本插件的 HTTP 请求）'),
        koishi_1.Schema.const('custom').description('使用自定义代理地址（仅本插件的 HTTP 请求）'),
    ]).default('follow-global').description('HTTP 代理模式'),
    proxyAddress: koishi_1.Schema.string().default('').description('自定义 HTTP 代理地址（例如 http://127.0.0.1:7890，仅 custom 模式生效）'),
    logLLMDetails: koishi_1.Schema.boolean().default(false).description('是否打印 LLM 请求体和响应详情 (Debug 用)'),
}).description('调试与排障');
exports.Config = koishi_1.Schema.intersect([
    koishi_1.Schema.object({
        tools: toolsSchema,
        models: modelsSchema,
        search: searchSchema,
        services: servicesSchema,
        debug: debugSchema,
    }),
]);
