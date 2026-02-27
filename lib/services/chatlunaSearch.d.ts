import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * Chatluna Search 服务
 * 使用 chatluna-search-service 插件进行联网搜索
 *
 * 实现方式：直接调用已注册的 web_search 工具进行搜索，
 * 然后使用配置的模型对搜索结果进行分析总结
 */
export declare class ChatlunaSearchAgent {
    private ctx;
    private config;
    private logger;
    private toolInfo;
    private toolReady;
    private toolInitPromise;
    private emptyEmbeddings;
    private chatluna;
    constructor(ctx: Context, config: Config);
    private normalizeResultItems;
    private normalizeUrl;
    private truncate;
    private withTimeout;
    private refreshToolInfo;
    private initTool;
    /**
     * 创建搜索工具实例
     */
    private createSearchTool;
    /**
     * 检查服务是否可用
     */
    isAvailable(): boolean;
    /**
     * 多样化搜索关键词
     * 使用小模型生成多个不同角度的搜索关键词
     */
    private diversifyQuery;
    /**
     * 执行搜索
     */
    search(query: string): Promise<SearchResult>;
}
