"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaSearchService = void 0;
const http_1 = require("../utils/http");
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
        const proxyAgent = (0, http_1.resolveProxyAgent)(this.config.tof);
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
            const title = this.truncate(item.title || '未知标题', 120);
            const content = this.truncate(item.content || item.snippet || '', 240);
            const url = this.normalizeUrl(item.url || '');
            return `[${index + 1}] ${title}\n来源: ${url || '未知'}\n摘要: ${content || '无'}`;
        });
        const sources = [...new Set(items.map(item => this.normalizeUrl(item.url || '')).filter(Boolean))];
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
                apiBase: (this.config.deepSearch.ollamaSearchApiBase || '').trim() || 'https://ollama.com/api/web_search',
                apiKey: (this.config.deepSearch.ollamaSearchApiKey || '').trim() || (process.env.OLLAMA_API_KEY || '').trim(),
                maxResults: Math.max(1, Math.min(this.config.deepSearch.ollamaSearchMaxResults || 5, 10)),
                timeout: Math.max(3000, Math.min(this.config.deepSearch.ollamaSearchTimeout || 15000, 120000)),
            };
        }
        return {
            apiBase: (this.config.agent.ollamaSearchApiBase || '').trim() || 'https://ollama.com/api/web_search',
            apiKey: (this.config.agent.ollamaSearchApiKey || '').trim() || (process.env.OLLAMA_API_KEY || '').trim(),
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
    normalizeUrl(url) {
        const trimmed = (url || '').trim();
        if (!trimmed)
            return '';
        try {
            const parsed = new URL(trimmed);
            parsed.hash = '';
            const normalized = parsed.toString();
            return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
        }
        catch {
            return trimmed;
        }
    }
    truncate(text, maxChars) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (!normalized)
            return '';
        return normalized.length > maxChars ? `${normalized.substring(0, maxChars)}...` : normalized;
    }
}
exports.OllamaSearchService = OllamaSearchService;
