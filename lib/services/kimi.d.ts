import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * Kimi 搜索服务
 * 使用 Kimi K2 的内置 $web_search 工具
 */
export declare class KimiSearchAgent {
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
