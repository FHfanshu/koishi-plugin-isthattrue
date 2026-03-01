"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSearchController = void 0;
const chatluna_1 = require("../services/chatluna");
const iterativeSearchAgent_1 = require("../services/iterativeSearchAgent");
const prompts_1 = require("../utils/prompts");
const apiConfig_1 = require("../utils/apiConfig");
const async_1 = require("../utils/async");
const MAX_PLAN_QUERIES = 4;
const GROK_SUPPLEMENTAL_TIMEOUT_CAP_MS = 18000;
class DeepSearchController {
    constructor(ctx, config, chatlunaAdapter) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
        this.searchAgent = new iterativeSearchAgent_1.IterativeSearchAgent(ctx, config);
        this.chatlunaAdapter = chatlunaAdapter || new chatluna_1.ChatlunaAdapter(ctx, config);
    }
    async search(claim) {
        const normalizedClaim = (claim || '').trim();
        if (!normalizedClaim) {
            return {
                summary: '输入为空，未执行 DeepSearch',
                keyFindings: [],
                sources: [],
                confidence: 0,
                conclusion: '请提供需要核查的文本',
                rounds: 0,
            };
        }
        const history = { rounds: [] };
        const maxIterations = Math.max(1, this.config.deepSearch.maxIterations || 1);
        for (let i = 0; i < maxIterations; i += 1) {
            const roundNumber = i + 1;
            const roundStart = Date.now();
            try {
                const roundData = await (0, async_1.withTimeout)(this.runRound(normalizedClaim, history, roundNumber), this.config.deepSearch.perIterationTimeout, `DeepSearch 第 ${roundNumber} 轮`);
                history.rounds.push({
                    round: roundNumber,
                    plan: roundData.plan,
                    results: roundData.results,
                    evaluation: roundData.evaluation,
                    elapsedMs: Date.now() - roundStart,
                });
                if (this.shouldStop(roundData.evaluation, history)) {
                    this.logger.info(`[DeepSearch] 在第 ${roundNumber} 轮停止迭代`);
                    break;
                }
            }
            catch (error) {
                this.logger.warn(`[DeepSearch] 第 ${roundNumber} 轮失败: ${error?.message || error}`);
                history.rounds.push({
                    round: roundNumber,
                    plan: {
                        rationale: '轮次执行失败，使用默认收敛策略',
                        queries: [{ query: normalizedClaim, focus: '回退综合核查' }],
                    },
                    results: [{
                            agentId: 'deepsearch-controller',
                            perspective: 'DeepSearch 轮次失败',
                            findings: `执行失败: ${error?.message || error}`,
                            sources: [],
                            confidence: 0,
                            failed: true,
                            error: error?.message || String(error),
                        }],
                    evaluation: {
                        shouldStop: true,
                        reason: `轮次异常终止: ${error?.message || error}`,
                        confidence: 0,
                    },
                    elapsedMs: Date.now() - roundStart,
                });
                break;
            }
        }
        try {
            return await this.synthesize(normalizedClaim, history);
        }
        catch (error) {
            this.logger.warn(`[DeepSearch] 综合报告生成失败，回退本地汇总: ${error?.message || error}`);
            return this.buildFallbackReport(history);
        }
    }
    async plan(claim, history) {
        const response = await this.chatlunaAdapter.chatWithRetry({
            model: this.config.deepSearch.controllerModel,
            message: (0, prompts_1.buildDeepSearchPlanPrompt)(claim, history),
            systemPrompt: prompts_1.DEEP_SEARCH_CONTROLLER_SYSTEM_PROMPT,
        }, this.config.debug.maxRetries);
        return this.parseSearchPlan(response.content, claim);
    }
    async evaluate(results, claim, history) {
        const response = await this.chatlunaAdapter.chatWithRetry({
            model: this.config.deepSearch.controllerModel,
            message: (0, prompts_1.buildDeepSearchEvaluatePrompt)(claim, results, history),
            systemPrompt: prompts_1.DEEP_SEARCH_EVALUATE_SYSTEM_PROMPT,
        }, this.config.debug.maxRetries);
        return this.parseEvaluation(response.content, results);
    }
    async synthesize(claim, history) {
        const response = await this.chatlunaAdapter.chatWithRetry({
            model: this.config.deepSearch.controllerModel,
            message: (0, prompts_1.buildDeepSearchSynthesizePrompt)(claim, history),
            systemPrompt: prompts_1.DEEP_SEARCH_SYNTHESIZE_SYSTEM_PROMPT,
        }, this.config.debug.maxRetries);
        return this.parseFinalReport(response.content, history);
    }
    async runRound(claim, history, round) {
        const plan = await this.plan(claim, history.rounds.length > 0 ? history : undefined);
        const results = await this.executePlan(plan);
        const previewHistory = {
            rounds: [
                ...history.rounds,
                {
                    round,
                    plan,
                    results,
                    evaluation: { shouldStop: false, reason: '待评估', confidence: 0 },
                    elapsedMs: 0,
                },
            ],
        };
        const evaluation = await this.evaluate(results, claim, previewHistory);
        return { plan, results, evaluation };
    }
    async executePlan(plan) {
        const queries = plan.queries.length > 0
            ? plan.queries
            : [{ query: plan.rationale || '综合核查', focus: '回退默认查询' }];
        const primaryQueries = queries.map((query) => this.normalizePrimaryQuery(query));
        const grokSupplementals = primaryQueries
            .map((query) => this.launchGrokSupplementalQuery(query))
            .filter((item) => Boolean(item));
        const tasks = primaryQueries.map((query) => this.searchAgent.search(query));
        const settled = await Promise.allSettled(tasks);
        const results = settled.map((item, index) => {
            if (item.status === 'fulfilled') {
                return item.value;
            }
            const fallbackQuery = primaryQueries[index];
            const message = item.reason?.message || String(item.reason);
            return this.buildExecutionFailureResult(fallbackQuery, message);
        });
        for (const supplemental of grokSupplementals) {
            const outcome = supplemental.capture();
            if (!outcome) {
                this.logger.debug(`[DeepSearch] Grok 补充未在窗口内完成，已跳过: ${supplemental.focus}`);
                continue;
            }
            if (outcome.status === 'fulfilled') {
                if (!outcome.value.failed) {
                    results.push({
                        ...outcome.value,
                        agentId: `${outcome.value.agentId}-grok-supplement`,
                        perspective: `${outcome.value.perspective} (Grok补充)`,
                    });
                }
                else {
                    this.logger.debug(`[DeepSearch] Grok 补充失败(${supplemental.focus}): ${outcome.value.error || outcome.value.findings}`);
                }
                continue;
            }
            const message = outcome.reason?.message || String(outcome.reason);
            this.logger.debug(`[DeepSearch] Grok 补充超时/失败(${supplemental.focus}): ${message}`);
        }
        return results;
    }
    buildExecutionFailureResult(query, message) {
        return {
            agentId: 'deepsearch-execute',
            perspective: `DeepSearch 执行失败: ${query?.focus || 'unknown'}`,
            findings: `任务失败: ${message}`,
            sources: [],
            confidence: 0,
            failed: true,
            error: message,
        };
    }
    normalizePrimaryQuery(query) {
        const providers = this.getProviderPriorityOrder();
        if (providers.length === 0) {
            return query;
        }
        if (query.provider && query.provider !== 'grok') {
            return query;
        }
        const preferredProvider = providers[0];
        if (query.provider === preferredProvider) {
            return query;
        }
        if (query.provider === 'grok') {
            this.logger.debug(`[DeepSearch] provider=grok 已降级为快速优先 ${preferredProvider}`);
        }
        return {
            ...query,
            provider: preferredProvider,
        };
    }
    getProviderPriorityOrder() {
        const providers = [];
        if (this.config.factCheck.geminiModel?.trim())
            providers.push('gemini');
        if ((0, apiConfig_1.isOllamaEnabled)(this.config))
            providers.push('ollama');
        if (this.config.factCheck.chatgptModel?.trim())
            providers.push('chatgpt');
        if (this.config.factCheck.grokModel?.trim())
            providers.push('grok');
        return providers;
    }
    launchGrokSupplementalQuery(query) {
        const grokModel = this.config.factCheck.grokModel?.trim();
        if (!grokModel || query.provider === 'grok') {
            return null;
        }
        const focus = query.focus || query.query || 'unknown';
        const timeoutMs = this.getGrokSupplementalTimeoutMs();
        const task = (0, async_1.withTimeout)(this.searchAgent.search({
            query: query.query,
            focus,
            provider: 'grok',
        }), timeoutMs, `DeepSearch Grok补充: ${focus}`);
        return {
            focus,
            capture: this.observePromise(task),
        };
    }
    getGrokSupplementalTimeoutMs() {
        const perIterationTimeout = this.config.deepSearch.perIterationTimeout || 30000;
        const calculated = Math.floor(perIterationTimeout * 0.4);
        return Math.max(5000, Math.min(GROK_SUPPLEMENTAL_TIMEOUT_CAP_MS, calculated));
    }
    observePromise(promise) {
        let settled = null;
        void promise.then((value) => {
            settled = { status: 'fulfilled', value };
        }, (reason) => {
            settled = { status: 'rejected', reason };
        });
        return () => settled;
    }
    shouldStop(evaluation, history) {
        if (!evaluation.shouldStop) {
            return false;
        }
        const minConfidence = this.config.deepSearch.minConfidenceThreshold;
        if (typeof minConfidence === 'number' && evaluation.confidence < minConfidence) {
            return false;
        }
        const minSources = this.config.deepSearch.minSourcesThreshold;
        if (typeof minSources === 'number') {
            const sourceCount = this.collectAllSources(history).length;
            if (sourceCount < minSources) {
                return false;
            }
        }
        return true;
    }
    parseSearchPlan(content, claim) {
        const parsed = this.parseJson(content);
        const rawQueries = Array.isArray(parsed?.queries) ? parsed.queries : [];
        const queries = [];
        for (const raw of rawQueries) {
            const query = (raw?.query || '').trim();
            if (!query)
                continue;
            const focus = (raw?.focus || '综合核查').trim();
            const provider = this.parseProvider(raw?.provider);
            const useTool = this.parseUseTool(raw?.useTool);
            const toolArgs = typeof raw?.toolArgs === 'object' && raw.toolArgs
                ? {
                    url: typeof raw.toolArgs.url === 'string' ? raw.toolArgs.url.trim() : undefined,
                    action: typeof raw.toolArgs.action === 'string' ? raw.toolArgs.action.trim() : undefined,
                    params: typeof raw.toolArgs.params === 'string' ? raw.toolArgs.params.trim() : undefined,
                }
                : undefined;
            queries.push({ query, focus, provider, useTool, toolArgs });
            if (queries.length >= MAX_PLAN_QUERIES)
                break;
        }
        if (queries.length === 0) {
            queries.push({
                query: claim,
                focus: '综合核查',
                provider: undefined,
            });
        }
        return {
            queries,
            rationale: (parsed?.rationale || '默认回退计划').toString(),
        };
    }
    parseEvaluation(content, results) {
        const parsed = this.parseJson(content);
        if (!parsed) {
            return this.buildFallbackEvaluation(results);
        }
        return {
            shouldStop: Boolean(parsed.shouldStop),
            reason: (parsed.reason || '无评估理由').toString(),
            confidence: this.clampConfidence(parsed.confidence, this.estimateConfidence(results)),
            gaps: Array.isArray(parsed.gaps)
                ? parsed.gaps.map((item) => String(item).trim()).filter(Boolean)
                : undefined,
        };
    }
    parseFinalReport(content, history) {
        const parsed = this.parseJson(content);
        if (!parsed) {
            return this.buildFallbackReport(history);
        }
        const sources = Array.isArray(parsed.sources)
            ? parsed.sources.map((item) => String(item).trim()).filter(Boolean)
            : this.collectAllSources(history);
        const keyFindings = Array.isArray(parsed.keyFindings)
            ? parsed.keyFindings.map((item) => String(item).trim()).filter(Boolean)
            : this.collectTopFindings(history);
        return {
            summary: (parsed.summary || '已完成 DeepSearch 综合').toString(),
            keyFindings,
            sources,
            confidence: this.clampConfidence(parsed.confidence, this.estimateConfidence(history.rounds.flatMap((r) => r.results))),
            conclusion: (parsed.conclusion || '请结合来源进一步人工复核').toString(),
            rounds: history.rounds.length,
        };
    }
    buildFallbackEvaluation(results) {
        const confidence = this.estimateConfidence(results);
        const sourceCount = [...new Set(results.flatMap((item) => item.sources))].length;
        return {
            shouldStop: sourceCount >= 2 && confidence >= 0.55,
            reason: '评估解析失败，按来源数量和平均置信度回退',
            confidence,
        };
    }
    buildFallbackReport(history) {
        const allResults = history.rounds.flatMap((round) => round.results);
        return {
            summary: history.rounds.length > 0
                ? `DeepSearch 共执行 ${history.rounds.length} 轮，已汇总可用证据。`
                : 'DeepSearch 未获得有效结果。',
            keyFindings: this.collectTopFindings(history),
            sources: this.collectAllSources(history),
            confidence: this.estimateConfidence(allResults),
            conclusion: allResults.length > 0
                ? '已形成初步证据结论，建议结合原始上下文判断。'
                : '证据不足，建议更换关键词继续检索。',
            rounds: history.rounds.length,
        };
    }
    collectTopFindings(history) {
        return history.rounds
            .flatMap((round) => round.results)
            .map((result) => result.findings?.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .slice(0, 5)
            .map((text) => (text.length > 220 ? `${text.substring(0, 220)}...` : text));
    }
    collectAllSources(history) {
        return [...new Set(history.rounds
                .flatMap((round) => round.results)
                .flatMap((result) => result.sources || [])
                .map((source) => source.trim())
                .filter(Boolean))];
    }
    estimateConfidence(results) {
        if (!results.length)
            return 0;
        const valid = results.filter((item) => !item.failed);
        if (!valid.length)
            return 0;
        const avg = valid.reduce((sum, item) => sum + this.clampConfidence(item.confidence, 0), 0) / valid.length;
        return this.clampConfidence(avg, 0.5);
    }
    clampConfidence(value, fallback = 0.5) {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric))
            return fallback;
        if (numeric < 0)
            return 0;
        if (numeric > 1)
            return 1;
        return numeric;
    }
    parseJson(content) {
        if (!content)
            return null;
        const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const candidate = markdownMatch ? markdownMatch[1] : content;
        try {
            return JSON.parse(candidate);
        }
        catch {
            // fallback to object extraction
        }
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (!objectMatch)
            return null;
        try {
            return JSON.parse(objectMatch[0]);
        }
        catch {
            return null;
        }
    }
    parseProvider(value) {
        if (value === 'grok' || value === 'gemini' || value === 'chatgpt' || value === 'ollama') {
            return value;
        }
        return undefined;
    }
    parseUseTool(value) {
        if (value === 'web_search' || value === 'browser' || value === 'ollama_search') {
            return value;
        }
        return undefined;
    }
}
exports.DeepSearchController = DeepSearchController;
