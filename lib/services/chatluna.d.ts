import { Context } from 'koishi';
import { ChatRequest, ChatResponse } from '../types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
declare module 'koishi' {
    interface Context {
        chatluna: ChatlunaService;
    }
}
interface ChatlunaToolInfo {
    createTool(options?: Record<string, unknown>): unknown;
}
interface ChaflunaPlatform {
    getTools(): {
        value?: string[];
    };
    getTool(name: string): ChatlunaToolInfo | undefined;
    registerTool(name: string, options: {
        createTool(): unknown;
        selector(): boolean;
    }): (() => void) | undefined;
}
interface ChatlunaService {
    createChatModel(fullModelName: string): Promise<{
        value: ChatModel | undefined;
    }>;
    platform?: ChaflunaPlatform;
}
interface ChatModel {
    invoke(messages: Array<HumanMessage | SystemMessage>, options?: {
        temperature?: number;
    }): Promise<{
        content: string | object;
    }>;
}
/**
 * Chatluna 集成服务
 * 封装对 koishi-plugin-chatluna 的调用
 */
export declare class ChatlunaAdapter {
    private ctx;
    private config?;
    private logger;
    private static proxyMutex;
    constructor(ctx: Context, config?: any);
    /**
     * 检查 Chatluna 服务是否可用
     */
    isAvailable(): boolean;
    /**
     * 在临时移除系统代理的环境中串行执行 fn，防止并发请求污染全局 env
     */
    private runWithProxyBypass;
    /**
     * 发送聊天请求
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
    /**
     * 实际发送请求（不处理代理）
     */
    private doChat;
    /**
     * 带重试的聊天请求
     */
    chatWithRetry(request: ChatRequest, maxRetries?: number, fallbackModel?: string): Promise<ChatResponse>;
    /**
     * 从响应中提取来源链接
     */
    private extractSources;
    private sleep;
}
export {};
