import type { PluginConfig } from '../types';
type Ctx = any;
export interface GrokSearchResult {
    title: string;
    url: string;
    description: string;
}
export declare class GrokWebSearchService {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    private readonly baseUrl;
    private readonly timeout;
    private readonly model;
    constructor(ctx: Ctx, config: PluginConfig);
    search(query: string, maxResults?: number): Promise<GrokSearchResult[]>;
    private parseJson;
    private validateResults;
    private isRetryableError;
    private sleep;
}
export {};
