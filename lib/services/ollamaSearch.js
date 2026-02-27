"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaSearchService = void 0;
const http_1 = require("../utils/http");
const apiConfig_1 = require("../utils/apiConfig");
const text_1 = require("../utils/text");
const url_1 = require("../utils/url");
/**
 * Ollama Search API 封装
 */
class OllamaSearchService {
    ctx;
    config;
    logger;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
    }
    async search(query, perspective = 'Ollama Search', scope = 'agent') {
        const keyword = (query || '').trim();
        if (!keyword) {
            return {
                agentId: 'ollama-search',
                perspective,
                findings: '输入为空，未执行 Ollama Search',
                sources: [],
                confidence: 0,
            };
        }
        const settings = this.getSettings(scope);
        const proxyAgent = (0, http_1.resolveProxyAgent)(this.config.factCheck);
        const headers = {
            'Content-Type': 'application/json',
        };
        if (settings.apiKey) {
            headers.Authorization = `Bearer ${settings.apiKey}`;
        }
        const response = await this.ctx.http.post(settings.apiBase, {
            query: keyword,
            max_results: settings.maxResults,
        }, {
            timeout: settings.timeout,
            headers,
            ...(proxyAgent !== undefined ? { proxyAgent } : {}),
        });
        const items = this.normalizeItems(response).slice(0, settings.maxResults);
        if (!items.length) {
            return {
                agentId: 'ollama-search',
                perspective,
                findings: `Ollama Search 未找到相关结果：${keyword}`,
                sources: [],
                confidence: 0,
            };
        }
        const lines = items.map((item, index) => {
            const title = (0, text_1.truncate)(item.title || '未知标题', 120);
            const content = (0, text_1.truncate)(item.content || item.snippet || '', 240);
            const url = (0, url_1.normalizeUrl)(item.url || '');
            return `[${index + 1}] ${title}\n来源: ${url || '未知'}\n摘要: ${content || '无'}`;
        });
        const sources = [...new Set(items.map(item => (0, url_1.normalizeUrl)(item.url || '')).filter(Boolean))];
        return {
            agentId: 'ollama-search',
            perspective,
            findings: lines.join('\n\n'),
            sources,
            confidence: Math.min(0.35 + sources.length * 0.08, 0.75),
        };
    }
    getSettings(scope) {
        if (scope === 'deepsearch') {
            return {
                apiBase: (0, apiConfig_1.resolveOllamaApiBase)(this.config, 'deepsearch'),
                apiKey: (0, apiConfig_1.resolveOllamaApiKey)(this.config, 'deepsearch'),
                maxResults: Math.max(1, Math.min(this.config.deepSearch.ollamaSearchMaxResults || 5, 10)),
                timeout: Math.max(3000, Math.min(this.config.deepSearch.ollamaSearchTimeout || 15000, 120000)),
            };
        }
        return {
            apiBase: (0, apiConfig_1.resolveOllamaApiBase)(this.config, 'agent'),
            apiKey: (0, apiConfig_1.resolveOllamaApiKey)(this.config, 'agent'),
            maxResults: Math.max(1, Math.min(this.config.agent.ollamaSearchMaxResults || 5, 10)),
            timeout: Math.max(3000, Math.min(this.config.agent.ollamaSearchTimeout || 15000, 120000)),
        };
    }
    normalizeItems(response) {
        if (!response)
            return [];
        if (Array.isArray(response))
            return response;
        if (Array.isArray(response.results))
            return response.results;
        if (Array.isArray(response.data))
            return response.data;
        if (Array.isArray(response.items))
            return response.items;
        return [];
    }
}
exports.OllamaSearchService = OllamaSearchService;
