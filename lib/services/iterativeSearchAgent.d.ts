import type { AgentSearchResult, DeepSearchQuery, PluginConfig } from '../types';
type Ctx = any;
export declare class IterativeSearchAgent {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    private readonly subSearchAgent;
    private readonly grokWebSearchService;
    private readonly jinaReaderService;
    constructor(ctx: Ctx, config: PluginConfig);
    search(query: DeepSearchQuery): Promise<AgentSearchResult>;
    private buildModelPrompt;
    private getEnabledProviders;
    private resolveProvider;
    private getModelName;
    private parseGrokSearchResult;
    private parseJinaReaderResult;
    private searchWithGrokWebSearch;
    private searchWithJinaReader;
    private searchWithModel;
}
export {};
