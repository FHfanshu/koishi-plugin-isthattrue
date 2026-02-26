import { Schema } from 'koishi';
/**
 * Tof 命令配置 - 用于 tof 指令的事实核查流程
 */
export interface TofConfig {
    /** 判决模型 */
    model: string;
    /** 搜索模型 */
    searchModel: string;
    /** TavilyAPI Key（可选，用于补充搜索） */
    tavilyApiKey: string;
    /** Chatluna Search 使用的模型 */
    chatlunaSearchModel: string;
    /** 启用 Chatluna 搜索集成 */
    enableChatlunaSearch: boolean;
    /** 搜索关键词多样化模型 */
    chatlunaSearchDiversifyModel: string;
    /** 超时时间（毫秒） */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 输出格式 */
    outputFormat: 'auto' | 'markdown' | 'plain';
    /** 是否使用合并转发消息 */
    useForwardMessage: boolean;
    /** 合并转发最大节点数，超过则回退普通消息 */
    forwardMaxNodes: number;
    /** 合并转发总字符数上限，超过则回退普通消息 */
    forwardMaxTotalChars: number;
    /** 合并转发单节点字符数上限 */
    forwardMaxSegmentChars: number;
    /** 是否显示详细过程 */
    verbose: boolean;
    /** 是否绕过代理 */
    bypassProxy: boolean;
    /** 是否打印 LLM 请求体和响应 */
    logLLMDetails: boolean;
}
/**
 * Agent 工具配置 - 用于 Chatluna fact_check 工具的调用场景
 */
export interface AgentToolConfig {
    /** 是否注册为 Chatluna 工具 */
    enable: boolean;
    /** 工具名称 */
    name: string;
    /** 工具描述 */
    description: string;
    /** 工具输入最大长度 */
    maxInputChars: number;
    /** 工具返回来源数量上限 */
    maxSources: number;
    /** 启用多源并行搜索 */
    enableMultiSourceSearch: boolean;
    /** 启用 Grok 源 */
    searchUseGrok: boolean;
    /** 启用 Gemini 源 */
    searchUseGemini: boolean;
    /** 启用 ChatGPT 源 */
    searchUseChatgpt: boolean;
    /** 启用 DeepSeek 源 */
    searchUseDeepseek: boolean;
    /** Grok 模型 */
    grokModel: string;
    /** Gemini 模型 */
    geminiModel: string;
    /** ChatGPT 模型 */
    chatgptModel: string;
    /** DeepSeek 模型 */
    deepseekModel: string;
    /** 每个来源超时（毫秒） */
    perSourceTimeout: number;
    /** 每个来源输出最大长度 */
    maxFindingsChars: number;
}
/**
 * 插件配置 Schema
 */
export interface Config {
    /** Tof 命令配置 */
    tof: TofConfig;
    /** Agent 工具配置 */
    agent: AgentToolConfig;
}
export declare const Config: Schema<Config>;
