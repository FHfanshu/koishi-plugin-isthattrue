"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GrokWebSearchService = void 0;
const chatluna_1 = require("./chatluna");
const model_1 = require("../utils/model");
class GrokWebSearchService {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
        this.chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
    }
    async search(query, maxResults = 5) {
        const trimmedQuery = (query || '').trim();
        if (!trimmedQuery) {
            this.logger.warn('GrokWebSearch: empty query, returning empty results');
            return [];
        }
        const model = (0, model_1.normalizeModelName)(this.config.models.grokModel);
        if (!model) {
            this.logger.warn('GrokWebSearch: models.grokModel 未配置，跳过 Grok 搜索');
            return [];
        }
        const systemPrompt = 'You are a web search assistant. Search the web for the given query and return results as a pure JSON array with no markdown formatting. Each result must have exactly these fields: title (string), url (string), description (string, 20-50 words). Return ONLY the JSON array, no other text.';
        const userMessage = `Search the web for: ${trimmedQuery}\nReturn top ${maxResults} results as JSON array [{title, url, description}]`;
        try {
            const response = await this.chatluna.chatWithRetry({
                model,
                message: userMessage,
                systemPrompt,
                enableSearch: true,
            }, this.config.debug.maxRetries);
            const results = this.parseJson(response.content);
            return results.slice(0, maxResults);
        }
        catch (error) {
            this.logger.warn(`GrokWebSearch: Chatluna 搜索失败: ${error?.message || error}`);
            return [];
        }
    }
    parseJson(content) {
        try {
            const parsed = JSON.parse(content.trim());
            if (Array.isArray(parsed))
                return this.validateResults(parsed);
        }
        catch (error) {
            this.logger.debug(`GrokWebSearch: json parse stage1 failed: ${error?.message || error}`);
        }
        try {
            const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (markdownMatch) {
                const parsed = JSON.parse(markdownMatch[1].trim());
                if (Array.isArray(parsed))
                    return this.validateResults(parsed);
            }
        }
        catch (error) {
            this.logger.debug(`GrokWebSearch: json parse stage2 failed: ${error?.message || error}`);
        }
        try {
            const firstBracket = content.indexOf('[');
            const lastBracket = content.lastIndexOf(']');
            if (firstBracket >= 0 && lastBracket > firstBracket) {
                const parsed = JSON.parse(content.slice(firstBracket, lastBracket + 1));
                if (Array.isArray(parsed))
                    return this.validateResults(parsed);
            }
        }
        catch (error) {
            this.logger.debug(`GrokWebSearch: json parse stage3 failed: ${error?.message || error}`);
        }
        return [];
    }
    validateResults(parsed) {
        const results = [];
        for (const item of parsed) {
            if (item
                && typeof item === 'object'
                && typeof item.title === 'string'
                && typeof item.url === 'string'
                && typeof item.description === 'string') {
                results.push({
                    title: item.title,
                    url: item.url,
                    description: item.description,
                });
            }
        }
        return results;
    }
}
exports.GrokWebSearchService = GrokWebSearchService;
