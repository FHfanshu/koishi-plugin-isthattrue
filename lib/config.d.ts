import { Schema } from 'koishi';
/**
 * 插件配置 Schema
 */
export interface Config {
    /** 主控 Agent 模型 - 用于最终判决 (推荐 Gemini-3-Flash) */
    mainModel: string;
    /** 子搜索 Agent 模型 - 用于深度搜索 (推荐 Grok) */
    subSearchModel: string;
    /** Tavily API Key */
    tavilyApiKey: string;
    /** Anspire API Key */
    anspireApiKey: string;
    /** Kimi API Key */
    kimiApiKey: string;
    /** 智谱 API Key */
    zhipuApiKey: string;
    /** Chatluna Search 使用的模型 */
    chatlunaSearchModel: string;
    /** 启用 Chatluna 搜索集成 */
    enableChatlunaSearch: boolean;
    /** 搜索关键词多样化模型 */
    chatlunaSearchDiversifyModel: string;
    /** 超时时间(毫秒) */
    timeout: number;
    /** 最大重试次数 */
    maxRetries: number;
    /** 是否显示详细过程 */
    verbose: boolean;
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
    /** 是否绕过代理 */
    bypassProxy: boolean;
    /** 是否打印 LLM 请求体和响应 */
    logLLMDetails: boolean;
}
export declare const Config: Schema<Config>;
