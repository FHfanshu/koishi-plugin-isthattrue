import type { ChatRequest, ChatResponse, PluginConfig } from '../types';
type Ctx = any;
export declare class ChatlunaAdapter {
    private readonly ctx;
    private readonly config;
    private readonly logger;
    constructor(ctx: Ctx, config: PluginConfig);
    isAvailable(): boolean;
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatWithRetry(request: ChatRequest, maxRetries?: number, fallbackModel?: string): Promise<ChatResponse>;
    private extractSources;
    private sleep;
}
export {};
