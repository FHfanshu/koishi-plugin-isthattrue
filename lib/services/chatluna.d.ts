import { Context } from 'koishi';
import { ChatRequest, ChatResponse } from '../types';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
declare module 'koishi' {
    interface Context {
        chatluna: ChatlunaService;
    }
}
interface ChatlunaService {
    createChatModel(fullModelName: string): Promise<{
        value: ChatModel | undefined;
    }>;
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
    constructor(ctx: Context, config?: any);
    /**
     * 检查 Chatluna 服务是否可用
     */
    isAvailable(): boolean;
    /**
     * 发送聊天请求
     */
    chat(request: ChatRequest): Promise<ChatResponse>;
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
