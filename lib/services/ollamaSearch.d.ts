import { Context } from 'koishi';
import { Config } from '../config';
import type { SearchResult } from '../types';
type OllamaScope = 'agent' | 'deepsearch';
/**
 * Ollama Search API 封装
 */
export declare class OllamaSearchService {
    private ctx;
    private config;
    private logger;
    constructor(ctx: Context, config: Config);
    search(query: string, perspective?: string, scope?: OllamaScope): Promise<SearchResult>;
    private getSettings;
    private normalizeItems;
}
export {};
