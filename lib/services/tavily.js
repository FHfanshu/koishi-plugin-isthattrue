"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TavilySearchAgent = void 0;
const http_1 = require("../utils/http");
/**
 * Tavily 搜索服务
 * https://tavily.com/
 */
class TavilySearchAgent {
    ctx;
    config;
    apiKey;
    logger;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.apiKey = config.tof.tavilyApiKey;
        this.logger = ctx.logger('chatluna-fact-check');
    }
    /**
     * 检查服务是否可用
     */
    isAvailable() {
        return !!this.apiKey;
    }
    /**
     * 执行搜索
     */
    async search(query) {
        const startTime = Date.now();
        this.logger.info('[Tavily] 开始搜索:', query.substring(0, 50));
        try {
            const proxyAgent = (0, http_1.resolveProxyAgent)(this.config.tof);
            const response = await this.ctx.http.post('https://api.tavily.com/search', {
                api_key: this.apiKey,
                query,
                search_depth: 'advanced',
                include_answer: true,
                max_results: 5,
            }, {
                timeout: this.config.tof.timeout,
                ...(proxyAgent !== undefined ? { proxyAgent } : {}),
            });
            const findings = this.formatFindings(response);
            const sources = response.results.map(r => r.url);
            const elapsed = Date.now() - startTime;
            this.logger.info(`[Tavily] 搜索完成，耗时 ${elapsed}ms，找到 ${response.results.length} 条结果`);
            return {
                agentId: 'tavily',
                perspective: 'Tavily 网络搜索',
                findings,
                sources,
                confidence: this.calculateConfidence(response),
            };
        }
        catch (error) {
            this.logger.error('[Tavily] 搜索失败:', error);
            return {
                agentId: 'tavily',
                perspective: 'Tavily 网络搜索',
                findings: `搜索失败: ${error.message}`,
                sources: [],
                confidence: 0,
                failed: true,
                error: error.message,
            };
        }
    }
    /**
     * 格式化搜索结果
     */
    formatFindings(response) {
        const parts = [];
        if (response.answer) {
            parts.push(`摘要: ${response.answer}`);
        }
        if (response.results.length > 0) {
            parts.push('\n相关结果:');
            for (const result of response.results.slice(0, 3)) {
                parts.push(`- ${result.title}: ${result.content.substring(0, 150)}...`);
            }
        }
        return parts.join('\n') || '未找到相关信息';
    }
    /**
     * 计算置信度
     */
    calculateConfidence(response) {
        if (response.results.length === 0)
            return 0.1;
        // 基于结果数量和平均相关性评分
        const avgScore = response.results.reduce((sum, r) => sum + r.score, 0) / response.results.length;
        return Math.min(avgScore, 0.9);
    }
}
exports.TavilySearchAgent = TavilySearchAgent;
