import type { AgentSearchResult, PluginConfig } from '../types';
type Ctx = any;
export declare class ChatlunaSearchAgent {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    private toolInfo;
    private toolReady;
    private toolInitPromise;
    private emptyEmbeddings;
    constructor(ctx: Ctx, config: PluginConfig);
    private refreshToolInfo;
    private initTool;
    private createSearchTool;
    isAvailable(): boolean;
    search(query: string): Promise<AgentSearchResult>;
    private executeQuery;
    private invokeTool;
}
export {};
