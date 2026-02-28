"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubSearchAgent = void 0;
const chatluna_1 = require("../services/chatluna");
const prompts_1 = require("../utils/prompts");
class SubSearchAgent {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        this.logger = ctx.logger('chatluna-fact-check');
    }
    async deepSearch(claim) {
        return this.deepSearchWithModel(claim, this.config.factCheck.grokModel || 'x-ai/grok-4-1', 'grok-deep-search', 'Grok 深度搜索 (X/Twitter)');
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
