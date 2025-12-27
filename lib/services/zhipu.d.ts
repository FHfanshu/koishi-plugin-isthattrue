import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * 智谱 GLM Web Search 服务
 * 使用独立的 Web Search API
 */
export declare class ZhipuSearchAgent {
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
}
