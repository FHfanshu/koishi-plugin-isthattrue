"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JinaReaderService = void 0;
const url_1 = require("../utils/url");
const http_1 = require("../utils/http");
class JinaReaderService {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
    }
    async fetch(targetUrl) {
        // SSRF protection - must check before making any HTTP request
        if (!(0, url_1.isSafePublicHttpUrl)(targetUrl)) {
            this.logger.warn(`jina reader: url blocked by safety policy: ${targetUrl}`);
            return null;
        }
        const timeout = (this.config.services.jinaTimeout || 30) * 1000;
        const proxyAgent = (0, http_1.resolveProxyAgent)(this.config.debug);
        // First attempt with API key (if configured)
        const apiKey = this.config.services.jinaApiKey?.trim();
        const headers = {
            'Accept': 'application/json',
            'X-Timeout': '25', // seconds, slightly less than our own timeout
        };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
        try {
            const result = await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent);
            return result;
        }
        catch (error) {
            const statusCode = error?.response?.status;
            // 401/402: API key invalid or quota exceeded, retry without key
            if ((statusCode === 401 || statusCode === 402) && apiKey) {
                this.logger.warn(`Jina API key invalid or quota exceeded (${statusCode}), retrying without key`);
                delete headers['Authorization'];
                try {
                    return await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent);
                }
                catch (retryError) {
                    this.logger.warn(`jina reader: failed without key: ${String(retryError)}`);
                    return null;
                }
            }
            // 429: rate limit, retry with backoff
            if (statusCode === 429) {
                this.logger.warn('jina reader: rate limited (429), retrying after 2s');
                await this._sleep(2000);
                try {
                    return await this._fetchWithRetry(targetUrl, timeout, headers, proxyAgent);
                }
                catch (retryError) {
                    this.logger.warn(`jina reader: failed after 429 retry: ${String(retryError)}`);
                    return null;
                }
            }
            // Other errors
            this.logger.warn(`jina reader: failed to fetch ${targetUrl}: ${String(error)}`);
            return null;
        }
    }
    async _fetchWithRetry(targetUrl, timeout, headers, proxyAgent) {
        const apiUrl = `https://r.jina.ai/${encodeURIComponent(targetUrl)}`;
        const response = await this.ctx.http.get(apiUrl, {
            timeout,
            headers,
            ...(proxyAgent !== undefined ? { proxyAgent } : {}),
        });
        // Parse Jina response: {"code": 200, "status": 20000, "data": {"url": "...", "title": "...", "content": "..."}}
        const url = response.data?.url;
        const title = response.data?.title;
        const content = response.data?.content;
        if (!content || content.trim() === '') {
            this.logger.warn(`jina reader: empty content from ${targetUrl}`);
            return null;
        }
        return {
            url: url || targetUrl,
            title: title || '',
            content,
        };
    }
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.JinaReaderService = JinaReaderService;
