import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * 子搜索 Agent
 * 专门负责深度搜索（主要使用 Grok，擅长 X/Twitter 搜索）
 * 独立搜索，不依赖其他搜索结果
 */
export declare class SubSearchAgent {
    private ctx;
    private config;
    private chatluna;
    private logger;
    constructor(ctx: Context, config: Config);
    /**
     * 执行深度搜索
     * @param claim 原始声明文本
     */
    deepSearch(claim: string): Promise<SearchResult>;
    private parseResponse;
}
