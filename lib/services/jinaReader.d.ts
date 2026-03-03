import type { PluginConfig } from '../types';
export interface JinaReaderResult {
    url: string;
    title: string;
    content: string;
}
export declare class JinaReaderService {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    constructor(ctx: any, config: PluginConfig);
    fetch(targetUrl: string): Promise<JinaReaderResult | null>;
    private _fetchWithRetry;
    private _sleep;
}
