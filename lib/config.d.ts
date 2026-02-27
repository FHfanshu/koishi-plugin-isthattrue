import { Schema } from 'koishi';
/**
 * FactCheck 运行配置
 */
export interface FactCheckConfig {
    /** 超时时间（毫秒） */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** HTTP 代理模式 */
    proxyMode: 'follow-global' | 'direct' | 'custom';
    /** 自定义 HTTP 代理地址（仅 custom 模式） */
    proxyAddress: string;
    /** 是否打印 LLM 请求体和响应 */
    logLLMDetails: boolean;
}
/**
 * Agent 工具配置 - 用于 Chatluna fact_check 工具的调用场景
 */
export interface AgentToolConfig {
    /** 是否注册为 Chatluna 工具 */
    enable: boolean;
    /** 是否注册快速搜索工具（默认作为 fact_check） */
    enableQuickTool: boolean;
    /** 快速搜索工具名称 */
    quickToolName: string;
    /** 快速搜索工具描述 */
    quickToolDescription: string;
    /** 工具输入最大长度 */
    maxInputChars: number;
    /** 工具返回来源数量上限 */
    maxSources: number;
    /** Gemini 快速搜索模型（留空时回退 geminiModel/factCheck.chatlunaSearchModel） */
    quickToolModel: string;
    /** Gemini 快速搜索超时（毫秒） */
    quickToolTimeout: number;
    /** 追加 Chatluna Search 上下文到 fact_check 工具输出 */
    appendChatlunaSearchContext: boolean;
    /** 追加 Chatluna Search 上下文超时（毫秒） */
    chatlunaSearchContextTimeout: number;
    /** 追加 Chatluna Search 上下文最大字符数 */
    chatlunaSearchContextMaxChars: number;
    /** 追加 Chatluna Search 上下文来源数量上限 */
    chatlunaSearchContextMaxSources: number;
    /** 追加 Ollama Search 上下文到 fact_check 工具输出 */
    appendOllamaSearchContext: boolean;
    /** 追加 Ollama Search 上下文超时（毫秒） */
    ollamaSearchContextTimeout: number;
    /** 追加 Ollama Search 上下文最大字符数 */
    ollamaSearchContextMaxChars: number;
    /** 追加 Ollama Search 上下文来源数量上限 */
    ollamaSearchContextMaxSources: number;
    /** 启用多源并行搜索 */
    enableMultiSourceSearch: boolean;
    /** Grok 模型 */
    grokModel: string;
    /** Gemini 模型 */
    geminiModel: string;
    /** ChatGPT 模型 */
    chatgptModel: string;
    /** Ollama Search 返回结果数 */
    ollamaSearchMaxResults: number;
    /** Ollama Search 超时（毫秒） */
    ollamaSearchTimeout: number;
    /** 每个来源超时（毫秒） */
    perSourceTimeout: number;
    /** 多源快速返回：最少成功来源数（达到即提前返回） */
    fastReturnMinSuccess: number;
    /** 多源快速返回：最大等待时长（毫秒） */
    fastReturnMaxWaitMs: number;
    /** 每个来源输出最大长度 */
    maxFindingsChars: number;
    /** 启用异步模式（工具秒返，完成后自动推送结果到会话，规避 chatluna-character 锁超时） */
    asyncMode: boolean;
    /** 异步结果发送前汇总模型（留空则直接发送原始搜索结果） */
    asyncResultSummaryModel: string;
}
/**
 * DeepSearch 配置
 * 用于迭代搜索主控与 deep_search 工具
 */
export interface DeepSearchConfig {
    /** 是否启用 DeepSearch 模式（主流程与工具注册） */
    enable: boolean;
    /** 是否启用 DeepSearch 异步任务模式（deep_search 的 submit/status/result） */
    asyncEnable: boolean;
    /** DeepSearch 异步任务最大并发 worker 数 */
    asyncMaxWorkers: number;
    /** DeepSearch 异步任务过期时间（毫秒） */
    asyncTaskTtlMs: number;
    /** DeepSearch 异步任务队列上限（包含运行中与排队中任务） */
    asyncMaxQueuedTasks: number;
    /** 主控模型 */
    controllerModel: string;
    /** 最大迭代轮数 */
    maxIterations: number;
    /** 每轮超时（毫秒） */
    perIterationTimeout: number;
    /** 最低置信度阈值（可选；留空时仅由 LLM 评估决定） */
    minConfidenceThreshold: number | null;
    /** 最少来源数量阈值（可选；留空时仅由 LLM 评估决定） */
    minSourcesThreshold: number | null;
    /** Grok 模型（留空则跳过 Grok 源） */
    grokModel: string;
    /** Gemini 模型（留空则跳过 Gemini 源） */
    geminiModel: string;
    /** ChatGPT 模型（留空则跳过 ChatGPT 源） */
    chatgptModel: string;
    /** Ollama Search 返回结果数 */
    ollamaSearchMaxResults: number;
    /** Ollama Search 超时（毫秒） */
    ollamaSearchTimeout: number;
    /** 允许使用 chatluna-search-service 的 web_search 工具 */
    useChatlunaSearchTool: boolean;
    /** 允许使用 chatluna-search-service 的 browser 工具 */
    usePuppeteerBrowser: boolean;
}
/**
 * API Key / Base URL 统一配置
 */
export interface ApiConfig {
    /** Ollama API Key */
    ollamaApiKey: string;
    /** Ollama Base URL（留空使用默认） */
    ollamaBaseUrl: string;
    /** 是否启用 Ollama 搜索 */
    ollamaEnabled: boolean;
}
/**
 * 插件配置 Schema
 */
export interface Config {
    /** API Key / Base URL 统一配置 */
    api: ApiConfig;
    /** FactCheck 运行配置 */
    factCheck: FactCheckConfig;
    /** Agent 工具配置 */
    agent: AgentToolConfig;
    /** DeepSearch 配置 */
    deepSearch: DeepSearchConfig;
}
export declare const Config: Schema<Config>;
