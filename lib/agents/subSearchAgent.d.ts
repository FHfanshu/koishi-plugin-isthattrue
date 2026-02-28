import type { AgentSearchResult, PluginConfig } from '../types';
type Ctx = any;
export declare class SubSearchAgent {
    private readonly ctx;
    private readonly config;
    private readonly chatluna;
    private readonly logger;
    constructor(ctx: Ctx, config: PluginConfig);
    deepSearch(claim: string): Promise<AgentSearchResult>;
    deepSearchWithModel(claim: string, modelName: string, agentId?: string, perspective?: string, promptOverride?: string, systemPromptOverride?: string): Promise<AgentSearchResult>;
    private parseResponse;
}
export {};
