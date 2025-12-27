import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * Grok 搜索服务
 *
 * 统一使用 /v1/chat/completions + tools: [{ type: 'web_search' }]
 * 兼容 xAI 官方 API 和第三方 OpenAI 兼容服务
 */
export declare class GrokSearchAgent {
    private ctx;
    private config;
    private logger;
    constructor(ctx: Context, config: Config);
    /**
     * 检查服务是否可用
     */
    isAvailable(): boolean;
    /**
     * 执行搜索
     */
    search(query: string): Promise<SearchResult>;
    /**
     * 调用 Chat Completions API
     * 使用 tools: [{ type: 'web_search' }]
     */
    private callChatCompletionsApi;
    /**
     * 发送 HTTP 请求
     */
    private makeRequest;
}
