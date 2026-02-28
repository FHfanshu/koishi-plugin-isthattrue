"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatlunaAdapter = void 0;
const messages_1 = require("@langchain/core/messages");
class ChatlunaAdapter {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
    }
    isAvailable() {
        return Boolean(this.ctx.chatluna);
    }
    async chat(request) {
        if (!this.isAvailable()) {
            throw new Error('Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna');
        }
        const startTime = Date.now();
        const modelRef = await this.ctx.chatluna.createChatModel(request.model);
        const model = modelRef.value;
        if (!model) {
            throw new Error(`无法创建模型：${request.model}，请确保模型已正确配置`);
        }
        const messages = [];
        if (request.systemPrompt) {
            messages.push(new messages_1.SystemMessage(request.systemPrompt));
        }
        const messageContent = request.message;
        if (request.images && request.images.length > 0) {
            const multimodalContent = [{ type: 'text', text: request.message }];
            for (const base64Image of request.images) {
                multimodalContent.push({
                    type: 'image_url',
                    image_url: `data:image/jpeg;base64,${base64Image}`,
                });
            }
            messages.push(new messages_1.HumanMessage({ content: multimodalContent }));
            this.logger.debug(`构建多模态消息，包含 ${request.images.length} 张图片`);
        }
        else {
            messages.push(new messages_1.HumanMessage(messageContent));
        }
        if (this.config.debug.logLLMDetails) {
            this.logger.info(`[LLM Request] Model: ${request.model}\nSystem: ${request.systemPrompt || 'None'}\nMessage: ${typeof messageContent === 'string' ? messageContent.substring(0, 500) : 'Complex content'}`);
        }
        const invokeOptions = request.enableSearch
            ? { configurable: { enableSearch: true } }
            : undefined;
        const response = await model.invoke(messages, invokeOptions);
        const processingTime = Date.now() - startTime;
        this.logger.debug(`Chatluna 请求完成，耗时 ${processingTime}ms`);
        const content = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        if (this.config.debug.logLLMDetails) {
            this.logger.info(`[LLM Response] Model: ${request.model}\nContent: ${content}`);
        }
        return {
            content,
            model: request.model,
            sources: this.extractSources(content),
        };
    }
    async chatWithRetry(request, maxRetries = 2, fallbackModel) {
        let lastError = null;
        let currentModel = request.model;
        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
                return await this.chat({ ...request, model: currentModel });
            }
            catch (error) {
                lastError = error;
                this.logger.warn(`请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error);
                if (attempt === maxRetries - 1 && fallbackModel && fallbackModel !== currentModel) {
                    this.logger.info(`切换到备用模型：${fallbackModel}`);
                    currentModel = fallbackModel;
                }
                if (attempt < maxRetries) {
                    await this.sleep(1000 * (attempt + 1));
                }
            }
        }
        throw lastError || new Error('请求失败，已达最大重试次数');
    }
    extractSources(content) {
        const sources = [];
        const urlRegex = /https?:\/\/[^\s\])"']+/g;
        const matches = content.match(urlRegex);
        if (matches)
            sources.push(...matches);
        const sourceRegex = /\[来源 [：:]\s*([^\]]+)\]/g;
        let match;
        while ((match = sourceRegex.exec(content)) !== null) {
            sources.push(match[1]);
        }
        return [...new Set(sources)];
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
exports.ChatlunaAdapter = ChatlunaAdapter;
