/**
 * 消息内容类型
 */
export interface MessageContent {
    /** 原始文本 */
    text: string;
    /** 图片URL列表 */
    images: string[];
    /** 是否包含引用消息 */
    hasQuote: boolean;
}
/**
 * 搜索结果
 */
export interface SearchResult {
    /** Agent ID */
    agentId: string;
    /** 搜索角度/关键词 */
    perspective: string;
    /** 搜索发现 */
    findings: string;
    /** 相关来源 */
    sources: string[];
    /** 可信度评分 0-1 */
    confidence: number;
    /** 是否为失败结果 */
    failed?: boolean;
    /** 失败原因（可选） */
    error?: string;
}
/**
 * 验证结论
 */
export declare enum Verdict {
    TRUE = "true",
    FALSE = "false",
    UNCERTAIN = "uncertain",
    PARTIALLY_TRUE = "partially_true"
}
/**
 * 最终验证结果
 */
export interface VerificationResult {
    /** 待验证的原始内容 */
    originalContent: MessageContent;
    /** 各Agent搜索结果 */
    searchResults: SearchResult[];
    /** 最终判决 */
    verdict: Verdict;
    /** 判决理由 */
    reasoning: string;
    /** 参考来源汇总 */
    sources: string[];
    /** 可信度评分 0-1 */
    confidence: number;
    /** 处理耗时(ms) */
    processingTime: number;
}
/**
 * Agent 配置
 */
export interface AgentConfig {
    /** Agent 名称 */
    name: string;
    /** 使用的模型 */
    model: string;
    /** 搜索角度描述 */
    perspective: string;
    /** 系统提示词 */
    systemPrompt?: string;
}
/**
 * Chatluna 聊天请求
 */
export interface ChatRequest {
    /** 模型名称 */
    model: string;
    /** 消息内容 */
    message: string;
    /** 图片(base64) */
    images?: string[];
    /** 系统提示词 */
    systemPrompt?: string;
    /** 是否启用搜索 */
    enableSearch?: boolean;
}
/**
 * Chatluna 聊天响应
 */
export interface ChatResponse {
    /** 回复内容 */
    content: string;
    /** 搜索结果来源(如果有) */
    sources?: string[];
    /** 使用的模型 */
    model: string;
    /** token使用量 */
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}
/**
 * DeepSearch 来源提供方
 */
export type DeepSearchProvider = 'grok' | 'gemini' | 'chatgpt' | 'deepseek' | 'ollama';
/**
 * DeepSearch 可调用工具
 */
export type DeepSearchToolType = 'web_search' | 'browser' | 'searxng' | 'ollama_search';
/**
 * DeepSearch 单任务的 SearXNG 参数覆盖
 */
export interface DeepSearchSearXNGConfig {
    engines?: string;
    categories?: string;
    numResults?: number;
}
/**
 * DeepSearch 单条搜索任务
 */
export interface DeepSearchQuery {
    /** 搜索关键词 */
    query: string;
    /** 指定模型来源 */
    provider?: DeepSearchProvider;
    /** 搜索重点 */
    focus: string;
    /** 优先使用的工具 */
    useTool?: DeepSearchToolType;
    /** 工具参数 */
    toolArgs?: {
        url?: string;
        action?: string;
        params?: string;
    };
    /** SearXNG 参数覆盖（仅 useTool=searxng 生效） */
    searxngConfig?: DeepSearchSearXNGConfig;
}
/**
 * DeepSearch 单轮计划
 */
export interface DeepSearchPlan {
    queries: DeepSearchQuery[];
    rationale: string;
}
/**
 * DeepSearch 轮次评估结果
 */
export interface DeepSearchEvaluation {
    shouldStop: boolean;
    reason: string;
    confidence: number;
    gaps?: string[];
}
/**
 * DeepSearch 单轮历史
 */
export interface DeepSearchRound {
    round: number;
    plan: DeepSearchPlan;
    results: SearchResult[];
    evaluation: DeepSearchEvaluation;
    elapsedMs: number;
}
/**
 * DeepSearch 全量历史
 */
export interface DeepSearchHistory {
    rounds: DeepSearchRound[];
}
/**
 * DeepSearch 最终报告
 */
export interface DeepSearchReport {
    summary: string;
    keyFindings: string[];
    sources: string[];
    confidence: number;
    conclusion: string;
    rounds: number;
}
