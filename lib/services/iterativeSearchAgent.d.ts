import { Context } from 'koishi';
import { Config } from '../config';
import type { DeepSearchQuery, SearchResult } from '../types';
/**
 * 迭代搜索执行器
 * 优先调用 ChatLuna 工具（web_search/browser），失败后回退模型内置搜索
 */
export declare class IterativeSearchAgent {
    private ctx;
    private config;
    private logger;
    private subSearchAgent;
    private searXNGSearchService;
    private emptyEmbeddings;
    constructor(ctx: Context, config: Config);
    search(query: DeepSearchQuery): Promise<SearchResult>;
    private tryLoadEmptyEmbeddings;
    private getPlatform;
    private getToolInfo;
    private createTool;
    private invokeTool;
    private normalizeResultItems;
    private normalizeUrl;
    private extractUrls;
    private truncate;
    private parseWebSearchResult;
    private parseBrowserResult;
    private buildModelPrompt;
    private getEnabledProviders;
    private resolveProvider;
    private getModelName;
    private searchWithChatLunaTool;
    private searchWithBrowser;
    private searchWithSearXNG;
    private searchWithModel;
}
