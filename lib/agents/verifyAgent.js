"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyAgent = void 0;
const types_1 = require("../types");
const chatluna_1 = require("../services/chatluna");
const prompts_1 = require("../utils/prompts");
/**
 * 验证Agent
 * 负责综合搜索结果并做出最终判决
 */
class VerifyAgent {
    ctx;
    config;
    chatluna;
    logger;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        this.logger = ctx.logger('chatluna-fact-check');
    }
    clampConfidence(value, fallback = 0.5) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric))
            return fallback;
        if (numeric < 0)
            return 0;
        if (numeric > 1)
            return 1;
        return numeric;
    }
    /**
     * 执行验证判决
     * @param originalContent 原始消息内容
     * @param searchResults 搜索结果
     * @param images 可选的图片 base64 列表（多模态验证）
     */
    async verify(originalContent, searchResults, images) {
        const startTime = Date.now();
        const hasImages = images && images.length > 0;
        this.logger.info(`开始综合验证...${hasImages ? ' (包含图片)' : ''}`);
        try {
            let finalSearchResults = this.compactSearchResults(searchResults);
            // 构建验证请求（默认使用压缩后的搜索结果，避免超长上下文）
            let prompt = (0, prompts_1.buildVerifyPrompt)(originalContent.text, finalSearchResults.map(r => ({
                perspective: r.perspective,
                findings: r.findings,
                sources: r.sources,
            })), hasImages // 传递是否有图片
            );
            // 选择系统提示词（多模态或普通）
            const systemPrompt = hasImages
                ? prompts_1.VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL
                : prompts_1.VERIFY_AGENT_SYSTEM_PROMPT;
            // 调用低幻觉率模型进行验证
            let response;
            let usedSearchResults = finalSearchResults;
            try {
                response = await this.chatluna.chatWithRetry({
                    model: this.config.tof.model,
                    message: prompt,
                    systemPrompt: systemPrompt,
                    images: images, // 传递图片
                }, this.config.tof.maxRetries);
            }
            catch (error) {
                // 如果首次验证失败，进一步缩短搜索结果再重试一次
                this.logger.warn('验证请求失败，尝试使用更短的搜索结果重试...');
                const compactedResults = this.compactSearchResults(searchResults, true);
                prompt = (0, prompts_1.buildVerifyPrompt)(originalContent.text, compactedResults.map(r => ({
                    perspective: r.perspective,
                    findings: r.findings,
                    sources: r.sources,
                })), hasImages);
                response = await this.chatluna.chatWithRetry({
                    model: this.config.tof.model,
                    message: prompt,
                    systemPrompt: systemPrompt,
                    images: images,
                }, 0 // 不再重试
                );
                // 使用压缩后的结果
                usedSearchResults = compactedResults;
            }
            // 解析验证结果
            const parsed = this.parseVerifyResponse(response.content);
            const processingTime = Date.now() - startTime;
            const result = {
                originalContent,
                searchResults: usedSearchResults,
                verdict: parsed.verdict,
                reasoning: parsed.reasoning,
                sources: this.aggregateSources(usedSearchResults, parsed.sources),
                confidence: parsed.confidence,
                processingTime,
            };
            this.logger.info(`验证完成，判决: ${result.verdict}，可信度: ${result.confidence}`);
            return result;
        }
        catch (error) {
            this.logger.error('验证失败:', error);
            return {
                originalContent,
                searchResults,
                verdict: types_1.Verdict.UNCERTAIN,
                reasoning: `验证过程发生错误: ${error.message}`,
                sources: this.aggregateSources(searchResults, []),
                confidence: 0,
                processingTime: Date.now() - startTime,
            };
        }
    }
    compactSearchResults(searchResults, aggressive = false) {
        const maxFindingsChars = aggressive ? 400 : 800;
        return searchResults.map(result => {
            let findings = result.findings || '';
            if (result.agentId === 'chatluna-search') {
                const summaryEndIndex = findings.indexOf('==============================');
                if (summaryEndIndex !== -1) {
                    findings = findings.substring(0, summaryEndIndex + 32) + '\n\n(搜索详情已省略)';
                }
            }
            if (findings.length > maxFindingsChars) {
                findings = findings.substring(0, maxFindingsChars) + '...';
            }
            return { ...result, findings };
        });
    }
    /**
     * 解析验证响应
     */
    parseVerifyResponse(content) {
        try {
            // 提取JSON块
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            let parsed;
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
            }
            else {
                // 尝试直接解析
                parsed = JSON.parse(content);
            }
            return {
                verdict: this.normalizeVerdict(parsed.verdict),
                reasoning: parsed.reasoning || parsed.key_evidence || '无详细说明',
                sources: parsed.sources || [],
                confidence: this.clampConfidence(parsed.confidence, 0.5),
            };
        }
        catch {
            // 解析失败，尝试从文本中提取判决
            return {
                verdict: this.extractVerdictFromText(content),
                reasoning: content,
                sources: [],
                confidence: this.clampConfidence(0.3, 0.3),
            };
        }
    }
    /**
     * 标准化判决结果
     */
    normalizeVerdict(verdict) {
        const normalized = verdict?.toLowerCase()?.trim();
        const mapping = {
            'true': types_1.Verdict.TRUE,
            '真实': types_1.Verdict.TRUE,
            '正确': types_1.Verdict.TRUE,
            'false': types_1.Verdict.FALSE,
            '虚假': types_1.Verdict.FALSE,
            '错误': types_1.Verdict.FALSE,
            'partially_true': types_1.Verdict.PARTIALLY_TRUE,
            'partial': types_1.Verdict.PARTIALLY_TRUE,
            '部分真实': types_1.Verdict.PARTIALLY_TRUE,
            'uncertain': types_1.Verdict.UNCERTAIN,
            '不确定': types_1.Verdict.UNCERTAIN,
            '无法确定': types_1.Verdict.UNCERTAIN,
        };
        return mapping[normalized] || types_1.Verdict.UNCERTAIN;
    }
    /**
     * 从文本中提取判决
     */
    extractVerdictFromText(text) {
        const lower = text.toLowerCase();
        if (lower.includes('虚假') || lower.includes('false') || lower.includes('错误')) {
            return types_1.Verdict.FALSE;
        }
        if (lower.includes('部分真实') || lower.includes('partially')) {
            return types_1.Verdict.PARTIALLY_TRUE;
        }
        if (lower.includes('真实') || lower.includes('true') || lower.includes('正确')) {
            return types_1.Verdict.TRUE;
        }
        return types_1.Verdict.UNCERTAIN;
    }
    /**
     * 汇总所有来源
     */
    aggregateSources(searchResults, verifySources) {
        const allSources = new Set();
        for (const result of searchResults) {
            for (const source of result.sources) {
                allSources.add(source);
            }
        }
        for (const source of verifySources) {
            allSources.add(source);
        }
        return [...allSources];
    }
}
exports.VerifyAgent = VerifyAgent;
