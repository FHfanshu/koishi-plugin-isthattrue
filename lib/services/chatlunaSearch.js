"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatlunaSearchAgent = void 0;
const async_1 = require("../utils/async");
const search_1 = require("../utils/search");
const text_1 = require("../utils/text");
const url_1 = require("../utils/url");
const MAX_RESULTS_PER_QUERY = 8;
const MAX_TOTAL_RESULTS = 24;
const MAX_DESC_LENGTH = 320;
class ChatlunaSearchAgent {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.toolInfo = null;
        this.toolReady = false;
        this.toolInitPromise = null;
        this.emptyEmbeddings = null;
        this.logger = ctx.logger('chatluna-fact-check');
        this.toolInitPromise = this.initTool();
    }
    async refreshToolInfo() {
        const chatluna = this.ctx.chatluna;
        if (!chatluna?.platform) {
            return false;
        }
        const tools = chatluna.platform.getTools();
        this.logger.debug(`[ChatlunaSearch] 可用工具列表: ${JSON.stringify(tools.value)}`);
        if (!tools.value || !tools.value.includes('web_search')) {
            return false;
        }
        const nextToolInfo = chatluna.platform.getTool('web_search');
        this.logger.debug(`[ChatlunaSearch] toolInfo: ${JSON.stringify(nextToolInfo ? Object.keys(nextToolInfo) : null)}`);
        if (!nextToolInfo || typeof nextToolInfo.createTool !== 'function') {
            return false;
        }
        if (this.toolInfo !== nextToolInfo) {
            this.logger.debug('[ChatlunaSearch] 检测到 web_search toolInfo 变更');
        }
        this.toolInfo = nextToolInfo;
        this.toolReady = true;
        return true;
    }
    async initTool() {
        try {
            try {
                const inMemory = require('koishi-plugin-chatluna/llm-core/model/in_memory');
                this.emptyEmbeddings = inMemory.emptyEmbeddings;
                this.logger.debug('[ChatlunaSearch] emptyEmbeddings 已导入');
            }
            catch {
                this.logger.debug('[ChatlunaSearch] 无法导入 emptyEmbeddings，将使用 null');
            }
            const maxWaitMs = 10000;
            const intervalMs = 200;
            const start = Date.now();
            while (Date.now() - start < maxWaitMs) {
                if (await this.refreshToolInfo()) {
                    this.logger.info('[ChatlunaSearch] web_search 工具注册信息已获取');
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, intervalMs));
            }
            this.logger.warn('[ChatlunaSearch] web_search 工具未在 10 秒内就绪，请确保已启用 chatluna-search-service');
        }
        catch (error) {
            this.logger.warn('[ChatlunaSearch] 初始化工具失败:', error);
        }
    }
    createSearchTool() {
        if (!this.toolInfo) {
            return null;
        }
        try {
            const tool = this.toolInfo.createTool({
                embeddings: this.emptyEmbeddings,
                summaryType: 'performance',
            });
            if (tool && tool.summaryType === 'balanced') {
                this.logger.info('[ChatlunaSearch] 强制覆盖 summaryType: balanced → speed');
                tool.summaryType = 'speed';
            }
            this.logger.debug(`[ChatlunaSearch] 创建的 tool: name=${tool?.name}, type=${typeof tool}, summaryType=${tool?.summaryType}`);
            this.logger.debug(`[ChatlunaSearch] tool.invoke: ${typeof tool?.invoke}`);
            this.logger.debug(`[ChatlunaSearch] tool._call: ${typeof tool?._call}`);
            return tool;
        }
        catch (error) {
            this.logger.error('[ChatlunaSearch] createTool 失败:', error);
            return null;
        }
    }
    isAvailable() {
        return Boolean(this.ctx.chatluna?.platform);
    }
    async search(query) {
        const startTime = Date.now();
        const modelName = this.config.deepSearch.controllerModel?.trim()
            || this.config.factCheck.geminiModel?.trim()
            || this.config.factCheck.grokModel?.trim()
            || 'unknown';
        const shortModelName = modelName.includes('/') ? modelName.split('/').pop() : modelName;
        const perQueryTimeout = Math.max(3000, Math.min(this.config.debug.timeout || 60000, 120000));
        this.logger.info(`[ChatlunaSearch] 开始搜索，模型: ${modelName}`);
        try {
            const chatluna = this.ctx.chatluna;
            if (this.toolInitPromise) {
                await this.toolInitPromise;
            }
            if (!this.toolReady || !this.toolInfo) {
                this.logger.info('[ChatlunaSearch] 工具未就绪，尝试重新获取...');
                if (chatluna?.platform && await this.refreshToolInfo()) {
                    this.logger.info('[ChatlunaSearch] 工具重新获取成功');
                }
            }
            if (!this.toolReady || !this.toolInfo) {
                throw new Error('web_search 工具未就绪，请确保已启用 chatluna-search-service 并配置了搜索引擎');
            }
            this.logger.info('[ChatlunaSearch] 执行单关键词搜索');
            const allSearchData = await (0, async_1.withTimeout)(this.executeQuery(query), perQueryTimeout, `ChatlunaSearch(${query})`).catch((err) => {
                this.logger.warn(`[ChatlunaSearch] 关键词 "${query}" 超时/失败: ${err?.message || err}`);
                return [];
            });
            const dedupedSearchData = [];
            const seenKeys = new Set();
            for (const item of allSearchData) {
                const url = (0, url_1.normalizeUrl)(item?.url || '');
                const key = url || `${item?.title || ''}|${item?.description || item?.content || ''}`;
                if (!key || seenKeys.has(key))
                    continue;
                seenKeys.add(key);
                dedupedSearchData.push(item);
            }
            const finalSearchData = dedupedSearchData.slice(0, MAX_TOTAL_RESULTS);
            const allSources = [...new Set(finalSearchData
                    .map((item) => (0, url_1.normalizeUrl)(item?.url || ''))
                    .filter(Boolean))];
            const totalResults = finalSearchData.length;
            this.logger.info(`[ChatlunaSearch] 原始 ${allSearchData.length} 条，去重后 ${dedupedSearchData.length} 条，最终保留 ${totalResults} 条`);
            const formattedResults = finalSearchData.length > 0
                ? finalSearchData.map((item, i) => {
                    return `[${i + 1}] ${(0, text_1.truncate)(item.title || '未知标题', 120)}\n来源: ${item.url || '未知'}\n${(0, text_1.truncate)(item.description || item.content || '', MAX_DESC_LENGTH)}`;
                }).join('\n\n---\n\n')
                : '未找到搜索结果';
            const summary = `=== Chatluna Search 统计 ===\n搜索关键词: ${query}\n原始结果数: ${allSearchData.length}\n去重后结果数: ${dedupedSearchData.length}\n返回结果数: ${totalResults}\n来源数: ${allSources.length}\n================================\n\n`;
            const elapsed = Date.now() - startTime;
            this.logger.info(`[ChatlunaSearch] 搜索完成，耗时 ${elapsed}ms，共 ${totalResults} 条结果`);
            return {
                agentId: 'chatluna-search',
                perspective: `Chatluna Search (${shortModelName})`,
                findings: summary + formattedResults,
                sources: allSources,
                confidence: totalResults > 0 ? Math.min(0.45 + allSources.length * 0.06, 0.85) : 0,
            };
        }
        catch (error) {
            this.logger.error('[ChatlunaSearch] 搜索失败:', error);
            return {
                agentId: 'chatluna-search',
                perspective: `Chatluna Search (${shortModelName})`,
                findings: `搜索失败: ${error?.message || error}`,
                sources: [],
                confidence: 0,
                failed: true,
                error: error?.message || String(error),
            };
        }
    }
    async executeQuery(query) {
        const searchTool = this.createSearchTool();
        if (!searchTool) {
            this.logger.warn('[ChatlunaSearch] 创建搜索工具失败');
            return [];
        }
        try {
            const searchResult = await this.invokeTool(searchTool, query);
            const searchData = (0, search_1.normalizeResultItems)(searchResult).slice(0, MAX_RESULTS_PER_QUERY);
            return searchData.map((item) => ({ ...item, searchQuery: query }));
        }
        catch (err) {
            this.logger.warn('[ChatlunaSearch] 搜索失败，将尝试重建工具:', err);
            const recreatedTool = this.createSearchTool();
            if (!recreatedTool)
                return [];
            const retryResult = await this.invokeTool(recreatedTool, query);
            const retryData = (0, search_1.normalizeResultItems)(retryResult).slice(0, MAX_RESULTS_PER_QUERY);
            return retryData.map((item) => ({ ...item, searchQuery: query }));
        }
    }
    async invokeTool(tool, query) {
        if (typeof tool.invoke === 'function') {
            return tool.invoke(query);
        }
        if (typeof tool._call === 'function') {
            return tool._call(query, undefined, {});
        }
        throw new Error('搜索工具没有可用的调用方法');
    }
}
exports.ChatlunaSearchAgent = ChatlunaSearchAgent;
