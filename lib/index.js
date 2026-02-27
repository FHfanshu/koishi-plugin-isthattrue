"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.usage = exports.inject2 = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const node_path_1 = __importDefault(require("node:path"));
const agents_1 = require("./agents");
const messageParser_1 = require("./services/messageParser");
const chatluna_1 = require("./services/chatluna");
const factCheckTool_1 = require("./services/factCheckTool");
const deepSearchTool_1 = require("./services/deepSearchTool");
const prompts_1 = require("./utils/prompts");
const url_1 = require("./utils/url");
const types_1 = require("./types");
exports.name = 'chatluna-fact-check';
exports.inject = {
    required: ['chatluna'],
    optional: ['console'],
};
exports.inject2 = {
    chatluna: {
        required: true,
    },
    console: {
        required: false,
    },
};
exports.usage = `
## Chatluna Fact Check

用于消息事实核查与 Agent 搜索工具扩展，核心工具：
- \`fact_check\`：默认快速核查
- \`deep_search\`：迭代式深搜（可选）
  - 同名异步模式（默认开启）：传入 JSON
    - \`{"action":"submit","claim":"..."}\`
    - \`{"action":"status","taskId":"..."}\`
    - \`{"action":"result","taskId":"..."}\`

### 快速上手

1. 在控制台打开本插件配置页，先进入 **API Key / Base URL 对照表**。  
2. 在 \`api.apiKeys\` 表格中添加来源（如 Ollama），填写对应 key 和地址，并启用。  
3. 在 **FactCheck 基础** 中确认 \`agent.enable=true\`、\`agent.enableQuickTool=true\`，工具名保持 \`fact_check\`。  
4. 首次使用建议先关闭 \`deepSearch.enable\`，先验证 \`fact_check\` 能稳定返回结果。  
5. 需要迭代深搜时再开启 \`deepSearch.enable\`。  

### 关键配置

- \`api.apiKeys\`：统一管理 API Key / Base URL
- \`agent.appendChatlunaSearchContext\` / \`agent.appendOllamaSearchContext\`：给 \`fact_check\` 追加上下文（仅补充，不改判定）
- \`deepSearch.enable\`：启用 \`deep_search\`
- \`tof\` 为可选命令入口（\`tof\` / \`tof.quick\`）

### 排障提示

- Docker 场景下，Base URL 必须是 **Koishi 容器可达地址**
- \`fact_check_deep\` 为 legacy 工具，默认关闭
`;
var config_1 = require("./config");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_1.Config; } });
const import_meta = {};
function apply(ctx, config) {
    const logger = ctx.logger('chatluna-fact-check');
    const messageParser = new messageParser_1.MessageParser(ctx, {
        imageTimeoutMs: Math.min(config.tof.timeout, 30000),
        maxImageBytes: 8 * 1024 * 1024,
        tofConfig: config.tof,
    });
    // 注册 Chatluna 工具
    (0, factCheckTool_1.registerFactCheckTool)(ctx, config);
    (0, deepSearchTool_1.registerDeepSearchTool)(ctx, config);
    // 注入控制台前端入口（与 affinity 同款注入方式）
    ctx.inject(['console'], (innerCtx) => {
        const consoleService = innerCtx.console;
        const packageBase = node_path_1.default.resolve(ctx.baseDir, 'node_modules/koishi-plugin-chatluna-fact-check');
        const browserEntry = import_meta.url
            ? import_meta.url.replace(/\/src\/[^/]+$/, '/client/index.ts')
            : node_path_1.default.resolve(__dirname, '../client/index.ts');
        const entry = process.env.KOISHI_BASE
            ? [process.env.KOISHI_BASE + '/dist/index.js']
            : process.env.KOISHI_ENV === 'browser'
                ? [browserEntry]
                : {
                    dev: node_path_1.default.resolve(packageBase, 'client/index.ts'),
                    prod: node_path_1.default.resolve(packageBase, 'dist'),
                };
        consoleService?.addEntry?.(entry);
    });
    // 注册 tof 指令
    ctx.command('tof', '验证消息的真实性')
        .alias('真假')
        .alias('事实核查')
        .alias('factcheck')
        .option('verbose', '-v 显示详细过程')
        .action(async ({ session, options }) => {
        logger.info('tof 命令被触发');
        if (!session) {
            logger.warn('session 为空');
            return '无法获取会话信息';
        }
        logger.info(`用户 ${session.userId} 在 ${session.channelId} 触发 tof 命令`);
        logger.debug('Session elements:', JSON.stringify(session.elements));
        const verbose = options?.verbose ?? config.tof.verbose;
        const format = config.tof.outputFormat === 'auto'
            ? (session.platform === 'qq' ? 'plain' : 'markdown')
            : config.tof.outputFormat;
        // 1. 检查 Chatluna 服务
        const chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        if (!chatluna.isAvailable()) {
            return '❌ Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna';
        }
        // 2. 解析消息内容 (优先引用，其次是当前消息)
        const content = await messageParser.parseSession(session);
        if (!content || (!content.text && content.images.length === 0)) {
            return '❌ 请提供需要验证的内容\n\n使用方法:\n1. 引用一条消息后发送 tof\n2. 直接发送 tof [文本或图片]';
        }
        // 3. 发送处理中提示
        if (verbose) {
            await session.send('🔍 正在验证消息真实性，请稍候...');
        }
        try {
            // 4. 发送图片处理提示
            if (content.images.length > 0 && verbose) {
                await session.send('📷 正在处理图片内容...');
            }
            // 5. 执行验证 (使用主控 Agent，内部处理图片)
            const mainAgent = new agents_1.MainAgent(ctx, config);
            const result = await mainAgent.verify(content);
            // 用于输出的文本（优先使用原始文本，纯图片时显示"图片内容"）
            const textToDisplay = content.text.trim() || '[图片内容]';
            // 6. 格式化并发送输出
            const searchResultsForOutput = result.searchResults.map(r => ({
                agentId: r.agentId,
                perspective: r.perspective,
                findings: (0, url_1.injectCensorshipBypass)(r.findings),
            }));
            // 检查是否使用合并转发（仅支持 OneBot 协议）
            const useForward = config.tof.useForwardMessage && session.platform === 'onebot';
            if (useForward) {
                // 使用合并转发消息
                const { summary, details } = (0, prompts_1.formatForwardMessages)(textToDisplay, searchResultsForOutput, result.verdict, result.reasoning, result.sources, result.confidence, result.processingTime, config.tof.forwardMaxSegmentChars);
                const maxNodes = config.tof.forwardMaxNodes ?? 8;
                const maxTotalChars = config.tof.forwardMaxTotalChars ?? 3000;
                const totalChars = details.reduce((sum, detail) => sum + detail.length, 0);
                if (maxNodes <= 0 || maxTotalChars <= 0 || details.length > maxNodes || totalChars > maxTotalChars) {
                    logger.warn(`合并转发内容过长，回退普通消息: nodes=${details.length}/${maxNodes}, chars=${totalChars}/${maxTotalChars}`);
                    const output = (0, prompts_1.formatVerificationOutput)(textToDisplay, searchResultsForOutput, result.verdict, result.reasoning, result.sources, result.confidence, result.processingTime, format);
                    return output;
                }
                // 构建转发消息节点
                const forwardNodes = details.map(detail => (0, koishi_1.h)('message', { nickname: '事实核查', userId: session.selfId }, detail));
                // 发送主消息
                let summarySent = false;
                try {
                    await session.send(summary);
                    summarySent = true;
                }
                catch (sendSummaryError) {
                    logger.warn('发送摘要失败，将尝试回退由 Koishi 发送:', sendSummaryError);
                }
                // 尝试发送合并转发，失败则回退到普通消息
                try {
                    await session.send((0, koishi_1.h)('message', { forward: true }, forwardNodes));
                }
                catch (forwardError) {
                    logger.warn('合并转发发送失败，回退到普通消息:', forwardError);
                    // 回退：逐条发送详情
                    for (const detail of details) {
                        try {
                            await session.send(detail);
                        }
                        catch (detailError) {
                            logger.warn('回退详情发送失败，已忽略:', detailError);
                        }
                    }
                    if (!summarySent) {
                        return summary;
                    }
                }
                return;
            }
            // 普通输出
            const output = (0, prompts_1.formatVerificationOutput)(textToDisplay, searchResultsForOutput, result.verdict, result.reasoning, result.sources, result.confidence, result.processingTime, format);
            return output;
        }
        catch (error) {
            logger.error('验证过程出错:', error);
            return `❌ 验证过程发生错误: ${error.message}`;
        }
    });
    // 注册快速验证指令（简化输出）
    ctx.command('tof.quick <text:text>', '快速验证文本真实性')
        .action(async ({ session }, text) => {
        if (!session)
            return '无法获取会话信息';
        if (!text?.trim())
            return '请提供需要验证的文本';
        const format = config.tof.outputFormat === 'auto'
            ? (session.platform === 'qq' ? 'plain' : 'markdown')
            : config.tof.outputFormat;
        const chatluna = new chatluna_1.ChatlunaAdapter(ctx, config);
        if (!chatluna.isAvailable()) {
            return '❌ Chatluna 服务不可用';
        }
        await session.send('🔍 快速验证中...');
        try {
            const mainAgent = new agents_1.MainAgent(ctx, config);
            const result = await mainAgent.verify({ text, images: [], hasQuote: false });
            const verdictEmoji = {
                [types_1.Verdict.TRUE]: '✅ 真实',
                [types_1.Verdict.FALSE]: '❌ 虚假',
                [types_1.Verdict.PARTIALLY_TRUE]: '⚠️ 部分真实',
                [types_1.Verdict.UNCERTAIN]: '❓ 无法确定',
            };
            const confidenceValue = Math.round(result.confidence * 100);
            const reasoning = result.reasoning.substring(0, 200);
            if (format === 'plain') {
                return `${verdictEmoji[result.verdict]} (${confidenceValue}%)\n${reasoning}`;
            }
            return `**${verdictEmoji[result.verdict]}** (${confidenceValue}%)\n\n${reasoning}`;
        }
        catch (error) {
            return `❌ 验证失败: ${error.message}`;
        }
    });
    logger.info('chatluna-fact-check 插件已加载');
}
