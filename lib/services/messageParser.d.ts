import { Context } from 'koishi';
import { MessageContent } from '../types';
import type { FactCheckConfig } from '../config';
interface MessageParserOptions {
    imageTimeoutMs?: number;
    maxImageBytes?: number;
    factCheckConfig?: FactCheckConfig;
}
/**
 * 消息解析服务
 * 用于解析引用消息中的文本和图片内容
 */
export declare class MessageParser {
    private ctx;
    private imageTimeoutMs;
    private maxImageBytes;
    private factCheckConfig?;
    constructor(ctx: Context, options?: MessageParserOptions);
    /**
     * 从会话中提取引用消息的内容
     */
    parseQuotedMessage(session: any): Promise<MessageContent | null>;
    /**
     * 从整个会话中提取可验证内容
     * 同时解析引用消息和当前消息，合并内容
     */
    parseSession(session: any): Promise<MessageContent | null>;
    /**
     * 解析消息内容字符串
     */
    parseContent(content: string): {
        text: string;
        images: string[];
    };
    /**
     * 获取图片的base64编码
     */
    imageToBase64(url: string): Promise<string | null>;
    /**
     * 准备消息内容用于LLM处理
     * 将图片转换为base64，合并文本
     */
    prepareForLLM(content: MessageContent): Promise<{
        text: string;
        imageBase64List: string[];
    }>;
}
export {};
