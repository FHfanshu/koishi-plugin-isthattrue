import { Context } from 'koishi';
import { Config } from '../config';
import type { DeepSearchQuery, SearchResult } from '../types';
/**
 * SearXNG 搜索封装
 */
export declare class SearXNGSearchService {
    private ctx;
    private config;
    private logger;
    constructor(ctx: Context, config: Config);
    search(query: DeepSearchQuery): Promise<SearchResult>;
    private normalizeEndpoint;
    private normalizeResponse;
    private normalizeUrl;
    private truncate;
}
