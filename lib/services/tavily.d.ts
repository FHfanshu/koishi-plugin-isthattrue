import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * Tavily 搜索服务
 * https://tavily.com/
 */
export declare class TavilySearchAgent {
    private ctx;
    private config;
    private apiKey;
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
     * 格式化搜索结果
     */
    private formatFindings;
    /**
     * 计算置信度
     */
    private calculateConfidence;
}
