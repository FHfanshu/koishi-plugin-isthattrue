import { Context } from 'koishi';
import { Config } from '../config';
import { SearchResult, VerificationResult, MessageContent } from '../types';
/**
 * 验证Agent
 * 负责综合搜索结果并做出最终判决
 */
export declare class VerifyAgent {
    private ctx;
    private config;
    private chatluna;
    private logger;
    constructor(ctx: Context, config: Config);
    /**
     * 执行验证判决
     * @param originalContent 原始消息内容
     * @param searchResults 搜索结果
     * @param images 可选的图片 base64 列表（多模态验证）
     */
    verify(originalContent: MessageContent, searchResults: SearchResult[], images?: string[]): Promise<VerificationResult>;
    private compactSearchResults;
    /**
     * 解析验证响应
     */
    private parseVerifyResponse;
    /**
     * 标准化判决结果
     */
    private normalizeVerdict;
    /**
     * 从文本中提取判决
     */
    private extractVerdictFromText;
    /**
     * 汇总所有来源
     */
    private aggregateSources;
}
