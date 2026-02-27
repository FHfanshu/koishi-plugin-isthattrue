"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDeepSearchTool = registerDeepSearchTool;
const tools_1 = require("@langchain/core/tools");
const deepSearchController_1 = require("../agents/deepSearchController");
const chatluna_1 = require("./chatluna");
const DEEP_SEARCH_TOOL_NAME = 'deep_search';
const DEEP_SEARCH_TOOL_DESCRIPTION = '深度搜索验证：输入待核查文本，执行多轮迭代搜索，返回综合发现与来源。';
class DeepSearchTool extends tools_1.Tool {
    ctx;
    config;
    name = DEEP_SEARCH_TOOL_NAME;
    description = DEEP_SEARCH_TOOL_DESCRIPTION;
    logger;
    constructor(ctx, config) {
        super();
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
    }
    async _call(input) {
        const rawClaim = (input || '').trim();
        if (!rawClaim) {
            return '[DeepSearch]\n输入为空，请提供需要核查的文本。';
        }
        const maxInputChars = this.config.agent.maxInputChars || 1200;
        const claim = rawClaim.substring(0, maxInputChars);
        if (rawClaim.length > maxInputChars) {
            this.logger.warn(`[DeepSearchTool] 输入过长，已截断到 ${maxInputChars} 字符`);
        }
        try {
            const controller = new deepSearchController_1.DeepSearchController(this.ctx, this.config, new chatluna_1.ChatlunaAdapter(this.ctx, this.config));
            const report = await controller.search(claim);
            return this.formatReport(report);
        }
        catch (error) {
            this.logger.error('[DeepSearchTool] 执行失败:', error);
            return `[DeepSearch]\n执行失败: ${error.message}`;
        }
    }
    formatReport(report) {
        const sourceLimit = this.config.agent.maxSources || 5;
        const findingLines = report.keyFindings.length > 0
            ? report.keyFindings.slice(0, 6).map(item => `- ${item}`).join('\n')
            : '- 无关键发现';
        const sourceLines = report.sources.length > 0
            ? report.sources.slice(0, sourceLimit).map(item => `- ${item}`).join('\n')
            : '- 无';
        const confidence = Math.round(report.confidence * 100);
        return `[DeepSearch]
摘要: ${report.summary}
轮次: ${report.rounds}
置信度: ${confidence}%

[KeyFindings]
${findingLines}

[Sources]
${sourceLines}

[Conclusion]
${report.conclusion}`;
    }
}
function registerDeepSearchTool(ctx, config) {
    const logger = ctx.logger('chatluna-fact-check');
    if (!config.deepSearch.enable) {
        logger.info('[DeepSearchTool] DeepSearch 未启用，跳过工具注册');
        return;
    }
    const chatluna = ctx.chatluna;
    if (!chatluna?.platform?.registerTool) {
        logger.warn('[DeepSearchTool] chatluna.platform.registerTool 不可用，跳过注册');
        return;
    }
    ctx.effect(() => {
        logger.info(`[DeepSearchTool] 注册工具: ${DEEP_SEARCH_TOOL_NAME}`);
        const dispose = chatluna.platform.registerTool(DEEP_SEARCH_TOOL_NAME, {
            createTool() {
                return new DeepSearchTool(ctx, config);
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
