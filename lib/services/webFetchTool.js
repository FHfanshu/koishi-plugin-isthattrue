"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWebFetchTool = registerWebFetchTool;
const tools_1 = require("@langchain/core/tools");
const chatluna_1 = require("./chatluna");
const jinaReader_1 = require("./jinaReader");
const text_1 = require("../utils/text");
const url_1 = require("../utils/url");
class WebFetchTool extends tools_1.Tool {
    constructor(ctx, config, toolName, toolDescription) {
        super();
        this.ctx = ctx;
        this.config = config;
        this.name = sanitizeToolName(toolName, 'web_fetch');
        this.description = sanitizeToolDescription(toolDescription, '用于获取指定 URL 的网页内容。输入 URL，返回提取后的正文文本。');
        this.logger = ctx.logger('chatluna-fact-check');
        this.chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        this.jinaReader = new jinaReader_1.JinaReaderService(ctx, config);
    }
    async _call(input) {
        const rawUrl = (input || '').trim();
        if (!rawUrl) {
            return '[web_fetch]\n输入为空，请提供 URL。';
        }
        const targetUrl = (0, url_1.normalizeUrl)(rawUrl);
        if (!(0, url_1.isSafePublicHttpUrl)(targetUrl)) {
            return `[web_fetch]\nURL 非法或不安全: ${rawUrl}`;
        }
        const providerOrder = this.config.tools.webFetchProviderOrder || 'grok-first';
        const tryGrokFirst = providerOrder !== 'jina-first';
        if (tryGrokFirst) {
            const grokContent = await this.fetchWithGrok(targetUrl);
            if (grokContent) {
                return `[web_fetch:grok]\n${this.truncateOutput(grokContent)}`;
            }
            const jinaContent = await this.fetchWithJina(targetUrl);
            if (jinaContent) {
                return `[web_fetch:jina]\n${this.truncateOutput(jinaContent)}`;
            }
        }
        else {
            const jinaContent = await this.fetchWithJina(targetUrl);
            if (jinaContent) {
                return `[web_fetch:jina]\n${this.truncateOutput(jinaContent)}`;
            }
            const grokContent = await this.fetchWithGrok(targetUrl);
            if (grokContent) {
                return `[web_fetch:grok]\n${this.truncateOutput(grokContent)}`;
            }
        }
        return `[web_fetch]\n抓取失败: Grok 与 Jina Reader 都未返回有效内容。URL=${targetUrl}`;
    }
    truncateOutput(content) {
        return (0, text_1.truncate)(content, this.config.tools.webFetchMaxContentChars || 8000, '无有效内容');
    }
    async fetchWithGrok(url) {
        const model = this.config.models.grokModel?.trim();
        if (!model) {
            return null;
        }
        try {
            const response = await this.chatluna.chatWithRetry({
                model,
                message: `Read the following URL and extract its full text content. Return ONLY the extracted text, no commentary or formatting. URL: ${url}`,
                enableSearch: true,
            }, this.config.debug.maxRetries);
            const content = (response.content || '').trim();
            return content || null;
        }
        catch (error) {
            this.logger.warn(`[web_fetch] Grok(Chatluna) 失败: ${error?.message || error}`);
            return null;
        }
    }
    async fetchWithJina(url) {
        const result = await this.jinaReader.fetch(url);
        if (!result?.content) {
            return null;
        }
        return result.content;
    }
}
function registerWebFetchTool(ctx, config) {
    const logger = ctx.logger('chatluna-fact-check');
    if (!config.tools.webFetchEnable) {
        logger.info('[WebFetchTool] 已禁用工具注册');
        return;
    }
    const chatluna = ctx.chatluna;
    if (!chatluna?.platform?.registerTool) {
        logger.warn('[WebFetchTool] chatluna.platform.registerTool 不可用，跳过注册');
        return;
    }
    const toolName = sanitizeToolName(config.tools.webFetchToolName, 'web_fetch');
    const toolDescription = sanitizeToolDescription(config.tools.webFetchToolDescription, '用于获取指定 URL 的网页内容。输入 URL，返回提取后的正文文本。');
    ctx.effect(() => {
        logger.info(`[WebFetchTool] 注册工具: ${toolName}`);
        const dispose = chatluna.platform.registerTool(toolName, {
            createTool() {
                const tool = new WebFetchTool(ctx, config, toolName, toolDescription);
                const resolvedName = sanitizeToolName(tool.name, '');
                if (!resolvedName) {
                    tool.name = 'web_fetch';
                    logger.warn('[WebFetchTool] 检测到空工具名，已回退为 web_fetch');
                }
                return tool;
            },
            selector() {
                return true;
            },
        });
        return () => {
            if (typeof dispose === 'function') {
                dispose();
            }
        };
    });
}
function sanitizeToolName(value, fallback) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
        return fallback;
    }
    const normalized = text
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
    return normalized || fallback;
}
function sanitizeToolDescription(value, fallback) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
}
