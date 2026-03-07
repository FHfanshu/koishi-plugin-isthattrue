"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubSearchAgent = void 0;
const chatluna_1 = require("../services/chatluna");
const prompts_1 = require("../utils/prompts");
const model_1 = require("../utils/model");
class SubSearchAgent {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        this.logger = ctx.logger('chatluna-fact-check');
    }
    async deepSearch(claim) {
        const deepSearchGrokModel = (0, model_1.normalizeModelName)(this.config.models.deepSearchGrokModel);
        const grokFallbackModel = (0, model_1.normalizeModelName)(this.config.models.grokModel);
        return this.deepSearchWithModel(claim, this.normalizeDeepSearchGrokModel(deepSearchGrokModel, grokFallbackModel), 'grok-deep-search', 'Grok 深度搜索 (X/Twitter)');
    }
    async deepSearchWithModel(claim, modelName, agentId = 'multi-search', perspective = '多源深度搜索', promptOverride, systemPromptOverride) {
        this.logger.info(`[SubSearchAgent] 开始深度搜索，模型: ${modelName}`);
        try {
            const response = await this.chatluna.chatWithRetry({
                model: modelName,
                message: promptOverride || (0, prompts_1.buildSubSearchPrompt)(claim),
                systemPrompt: systemPromptOverride || prompts_1.DEEP_SEARCH_AGENT_SYSTEM_PROMPT,
                enableSearch: true,
            }, this.config.debug.maxRetries);
            const parsed = this.parseResponse(response.content);
            const confidence = typeof parsed.confidence === 'number'
                ? Math.max(0, Math.min(parsed.confidence, 1))
                : 0.3;
            return {
                agentId,
                perspective,
                findings: parsed.findings || response.content,
                sources: parsed.sources || response.sources || [],
                confidence,
            };
        }
        catch (error) {
            const fallbackModel = (0, model_1.normalizeModelName)(this.config.models.grokModel);
            if (fallbackModel
                && fallbackModel !== modelName
                && this.shouldFallbackToFastModel(error)) {
                this.logger.warn(`[SubSearchAgent] 深搜模型 ${modelName} 返回流式解析异常，回退到 ${fallbackModel}`);
                return this.deepSearchWithModel(claim, fallbackModel, agentId, `${perspective} (fallback fast)`, promptOverride, systemPromptOverride);
            }
            const geminiFallback = (0, model_1.normalizeModelName)(this.config.models.geminiModel);
            if (geminiFallback
                && geminiFallback !== modelName
                && this.shouldFallbackToFastModel(error)) {
                this.logger.warn(`[SubSearchAgent] 模型 ${modelName} 返回流式解析异常，回退到 Gemini: ${geminiFallback}`);
                return this.deepSearchWithModel(claim, geminiFallback, agentId, `${perspective} (fallback gemini)`, promptOverride, systemPromptOverride);
            }
            this.logger.error('[SubSearchAgent] 搜索失败:', error);
            return {
                agentId,
                perspective,
                findings: `深度搜索失败: ${error?.message || error}`,
                sources: [],
                confidence: 0,
                failed: true,
                error: error?.message || String(error),
            };
        }
    }
    shouldFallbackToFastModel(error) {
        const message = String(error?.message || error || '').toLowerCase();
        return message.includes("unexpected token 'd'")
            || message.includes('"data: {"')
            || message.includes('is not valid json')
            || message.includes('chat.completion.chunk');
    }
    normalizeDeepSearchGrokModel(preferredModel, fallbackModel) {
        const preferred = (preferredModel || '').trim();
        if (!preferred) {
            return fallbackModel || 'x-ai/grok-4-1';
        }
        if (/beta/i.test(preferred)) {
            this.logger.warn(`[SubSearchAgent] deepSearchGrokModel=${preferred} 包含 beta，已回退到 grokModel`);
            return fallbackModel || 'x-ai/grok-4-1';
        }
        return preferred;
    }
    parseResponse(content) {
        try {
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(content);
            return {
                findings: parsed.findings,
                sources: parsed.sources,
                confidence: parsed.confidence,
            };
        }
        catch {
            return {};
        }
    }
}
exports.SubSearchAgent = SubSearchAgent;
