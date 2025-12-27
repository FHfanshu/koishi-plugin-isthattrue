import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult } from '../types';
/**
 * 搜索Agent
 * 负责从特定角度搜索和收集信息
 */
export declare class SearchAgent {
    private ctx;
    private config;
    private id;
    private perspective;
    private model;
    private chatluna;
    constructor(ctx: Context, config: Config, agentIndex: number, model: string);
    /**
     * 执行搜索
     */
    search(content: string): Promise<SearchResult>;
    /**
     * 解析Agent响应的JSON
     */
    private parseResponse;
}
/**
 * 搜索Agent管理器
 * 负责创建和协调多个搜索Agent
 */
export declare class SearchAgentManager {
    private ctx;
    private config;
    private agents;
    private tavilyAgent;
    private anspireAgent;
    private kimiAgent;
    private zhipuAgent;
    private chatlunaSearchAgent;
    private logger;
    constructor(ctx: Context, config: Config);
    private initAgents;
    /**
     * 并行执行所有Agent的搜索
     */
    searchAll(content: string): Promise<SearchResult[]>;
    /**
     * 带超时的Promise包装 (LLM Agent)
     */
    private withTimeout;
    /**
     * 带超时的Promise包装 (通用)
     */
    private withTimeoutGeneric;
}
