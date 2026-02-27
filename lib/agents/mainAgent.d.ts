import { Context } from 'koishi';
import { Config } from '../config';
import { VerificationResult, MessageContent } from '../types';
/**
 * 主控 Agent
 * 流程：DeepSearch(可选) / 并行搜索 -> URL处理 -> Gemini判决
 */
export declare class MainAgent {
    private ctx;
    private config;
    private subSearchAgent;
    private chatlunaSearchAgent;
    private verifyAgent;
    private chatluna;
    private messageParser;
    private logger;
    constructor(ctx: Context, config: Config);
    /**
     * 执行完整的核查流程
     */
    verify(content: MessageContent): Promise<VerificationResult>;
    private searchEvidence;
    private searchEvidenceLegacy;
    /**
     * 带超时的 Promise 包装
     */
    private withTimeout;
    /**
     * 从图片中提取描述（用于纯图片输入场景）
     */
    private extractImageDescription;
}
