import type { AgentSearchResult, PluginConfig, SearchScope } from '../types';
type Ctx = any;
export declare class OllamaSearchService {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    constructor(ctx: Ctx, config: PluginConfig);
    search(query: string, perspective?: string, scope?: SearchScope): Promise<AgentSearchResult>;
    private getSettings;
    private normalizeItems;
}
export {};
