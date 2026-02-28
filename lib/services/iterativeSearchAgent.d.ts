import type { AgentSearchResult, DeepSearchQuery, PluginConfig } from '../types';
type Ctx = any;
export declare class IterativeSearchAgent {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    private readonly subSearchAgent;
    private readonly ollamaSearchService;
    private emptyEmbeddings;
    constructor(ctx: Ctx, config: PluginConfig);
    search(query: DeepSearchQuery): Promise<AgentSearchResult>;
    private tryLoadEmptyEmbeddings;
    private getPlatform;
    private getToolInfo;
    private createTool;
    private invokeTool;
    private parseWebSearchResult;
    private parseBrowserResult;
    private buildModelPrompt;
    private getEnabledProviders;
    private resolveProvider;
    private getModelName;
    private searchWithChatLunaTool;
    private searchWithBrowser;
    private searchWithOllama;
    private searchWithModel;
}
export {};
