"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IterativeSearchAgent = void 0;
const subSearchAgent_1 = require("../agents/subSearchAgent");
const grokWebSearch_1 = require("./grokWebSearch");
const jinaReader_1 = require("./jinaReader");
const prompts_1 = require("../utils/prompts");
const model_1 = require("../utils/model");
const text_1 = require("../utils/text");
const url_1 = require("../utils/url");
class IterativeSearchAgent {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
        this.subSearchAgent = new subSearchAgent_1.SubSearchAgent(ctx, config);
        this.grokWebSearchService = new grokWebSearch_1.GrokWebSearchService(ctx, config);
        this.jinaReaderService = new jinaReader_1.JinaReaderService(ctx, config);
    }
    async search(query) {
        if (query.useTool === 'grok_web_search') {
            try {
                return await this.searchWithGrokWebSearch(query);
            }
            catch (error) {
                this.logger.warn(`[IterativeSearch] grok_web_search 调用失败，回退模型搜索: ${error?.message || error}`);
            }
        }
        if (query.useTool === 'jina_reader') {
            try {
                return await this.searchWithJinaReader(query);
            }
            catch (error) {
                this.logger.warn(`[IterativeSearch] jina_reader 调用失败，回退模型搜索: ${error?.message || error}`);
            }
        }
        return this.searchWithModel(query);
    }
    buildModelPrompt(query) {
        const focus = query.focus || '综合核查';
        return `请围绕以下重点执行事实核查检索，并返回结构化 findings + sources + confidence：

待核查内容：
"${query.query}"

本轮重点：
${focus}

要求：
1. 优先权威来源与一手证据
2. 给出可核查的来源链接
3. 结果简明，不要输出与任务无关说明`;
    }
    getEnabledProviders() {
        const providers = [];
        if ((0, model_1.normalizeModelName)(this.config.models.geminiModel))
            providers.push('gemini');
        if ((0, model_1.normalizeModelName)(this.config.models.deepSearchGrokModel) || (0, model_1.normalizeModelName)(this.config.models.grokModel))
            providers.push('grok');
        return providers;
    }
    resolveProvider(provider) {
        const enabled = this.getEnabledProviders();
        if (enabled.length === 0) {
            return null;
        }
        if (provider && enabled.includes(provider)) {
            return provider;
        }
        if (provider && !enabled.includes(provider)) {
            this.logger.debug(`[IterativeSearch] provider=${provider} 已禁用，回退到 ${enabled[0]}`);
        }
        return enabled[0];
    }
    getModelName(provider) {
        switch (provider) {
            case 'grok':
                return (0, model_1.normalizeModelName)(this.config.models.deepSearchGrokModel) || (0, model_1.normalizeModelName)(this.config.models.grokModel);
            case 'gemini':
                return (0, model_1.normalizeModelName)(this.config.models.geminiModel);
            default:
                return '';
        }
    }
    parseGrokSearchResult(results, query) {
        if (results.length === 0) {
            return {
                agentId: 'deepsearch-grok-web-search',
                perspective: `DeepSearch grok_web_search: ${query.focus}`,
                findings: '无搜索结果',
                sources: [],
                confidence: 0.3,
            };
        }
        const lines = results.slice(0, 8).map((item, index) => {
            const title = (0, text_1.truncate)(item.title, 120, '无');
            const desc = (0, text_1.truncate)(item.description, 240, '无');
            return `[${index + 1}] ${title}\n来源: ${item.url}\n摘要: ${desc}`;
        });
        const sources = [...new Set(results
                .map((item) => (0, url_1.normalizeUrl)(item.url))
                .filter(Boolean))];
        return {
            agentId: 'deepsearch-grok-web-search',
            perspective: `DeepSearch grok_web_search: ${query.focus}`,
            findings: lines.join('\n\n'),
            sources,
            confidence: Math.min(0.5 + sources.length * 0.06, 0.88),
        };
    }
    parseJinaReaderResult(result, query, url) {
        if (!result) {
            return {
                agentId: 'deepsearch-jina-reader',
                perspective: `DeepSearch jina_reader: ${query.focus}`,
                findings: '无法获取内容',
                sources: [],
                confidence: 0.3,
            };
        }
        const sources = [(0, url_1.normalizeUrl)(result.url || url)].filter(Boolean);
        return {
            agentId: 'deepsearch-jina-reader',
            perspective: `DeepSearch jina_reader: ${query.focus}`,
            findings: (0, text_1.truncate)(result.content, 1800, '无'),
            sources,
            confidence: sources.length > 0 ? 0.7 : 0.55,
        };
    }
    async searchWithGrokWebSearch(query) {
        const results = await this.grokWebSearchService.search(query.query, 5);
        return this.parseGrokSearchResult(results, query);
    }
    async searchWithJinaReader(query) {
        const targetUrl = query.toolArgs?.url?.trim();
        if (!targetUrl) {
            return {
                agentId: 'deepsearch-jina-reader',
                perspective: `DeepSearch jina_reader: ${query.focus}`,
                findings: 'jina_reader 工具缺少 url 参数',
                sources: [],
                confidence: 0,
                failed: true,
                error: 'missing url parameter',
            };
        }
        const normalizedUrl = (0, url_1.normalizeUrl)(targetUrl);
        if (!(0, url_1.isSafePublicHttpUrl)(normalizedUrl)) {
            return {
                agentId: 'deepsearch-jina-reader',
                perspective: `DeepSearch jina_reader: ${query.focus}`,
                findings: `jina_reader 工具 URL 非法或不安全: ${targetUrl}`,
                sources: [],
                confidence: 0,
                failed: true,
                error: 'unsafe url',
            };
        }
        const result = await this.jinaReaderService.fetch(normalizedUrl);
        return this.parseJinaReaderResult(result, query, normalizedUrl);
    }
    async searchWithModel(query) {
        const resolvedProvider = this.resolveProvider(query.provider);
        if (!resolvedProvider) {
            return {
                agentId: 'deepsearch-model',
                perspective: `DeepSearch 模型搜索: ${query.focus}`,
                findings: 'DeepSearch 未配置可用搜索来源。请配置 models.grokModel / models.geminiModel。',
                sources: [],
                confidence: 0,
                failed: true,
                error: 'no deepsearch providers configured',
            };
        }
        const modelName = this.getModelName(resolvedProvider);
        return this.subSearchAgent.deepSearchWithModel(query.query, modelName, `deepsearch-${resolvedProvider}`, `DeepSearch ${resolvedProvider}: ${query.focus}`, this.buildModelPrompt(query), prompts_1.DEEP_SEARCH_AGENT_SYSTEM_PROMPT);
    }
}
exports.IterativeSearchAgent = IterativeSearchAgent;
