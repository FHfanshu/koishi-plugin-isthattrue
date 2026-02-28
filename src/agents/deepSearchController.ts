import { ChatlunaAdapter } from '../services/chatluna'
import { IterativeSearchAgent } from '../services/iterativeSearchAgent'
import {
  buildDeepSearchEvaluatePrompt,
  buildDeepSearchPlanPrompt,
  buildDeepSearchSynthesizePrompt,
  DEEP_SEARCH_CONTROLLER_SYSTEM_PROMPT,
  DEEP_SEARCH_EVALUATE_SYSTEM_PROMPT,
  DEEP_SEARCH_SYNTHESIZE_SYSTEM_PROMPT,
} from '../utils/prompts'
import { withTimeout } from '../utils/async'

import type {
  AgentSearchResult,
  DeepSearchEvaluation,
  DeepSearchHistory,
  DeepSearchPlan,
  DeepSearchQuery,
  DeepSearchReport,
  PluginConfig,
  ProviderKey,
} from '../types'

type Ctx = any

const MAX_PLAN_QUERIES = 4

export class DeepSearchController {
  private readonly logger: any
  private readonly searchAgent: IterativeSearchAgent
  private readonly chatlunaAdapter: ChatlunaAdapter

  constructor(
    private readonly ctx: Ctx,
    private readonly config: PluginConfig,
    chatlunaAdapter?: ChatlunaAdapter
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.searchAgent = new IterativeSearchAgent(ctx, config)
    this.chatlunaAdapter = chatlunaAdapter || new ChatlunaAdapter(ctx, config)
  }

  async search(claim: string): Promise<DeepSearchReport> {
    const normalizedClaim = (claim || '').trim()
    if (!normalizedClaim) {
      return {
        summary: '输入为空，未执行 DeepSearch',
        keyFindings: [],
        sources: [],
        confidence: 0,
        conclusion: '请提供需要核查的文本',
        rounds: 0,
      }
    }

    const history: DeepSearchHistory = { rounds: [] }
    const maxIterations = Math.max(1, this.config.deepSearch.maxIterations || 1)

    for (let i = 0; i < maxIterations; i += 1) {
      const roundNumber = i + 1
      const roundStart = Date.now()

      try {
        const roundData = await withTimeout(
          this.runRound(normalizedClaim, history, roundNumber),
          this.config.deepSearch.perIterationTimeout,
          `DeepSearch 第 ${roundNumber} 轮`
        )

        history.rounds.push({
          round: roundNumber,
          plan: roundData.plan,
          results: roundData.results,
          evaluation: roundData.evaluation,
          elapsedMs: Date.now() - roundStart,
        })

        if (this.shouldStop(roundData.evaluation, history)) {
          this.logger.info(`[DeepSearch] 在第 ${roundNumber} 轮停止迭代`)
          break
        }
      } catch (error: any) {
        this.logger.warn(`[DeepSearch] 第 ${roundNumber} 轮失败: ${error?.message || error}`)

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
        })

        break
      }
    }

    try {
      return await this.synthesize(normalizedClaim, history)
    } catch (error: any) {
      this.logger.warn(`[DeepSearch] 综合报告生成失败，回退本地汇总: ${error?.message || error}`)
      return this.buildFallbackReport(history)
    }
  }

  private async plan(claim: string, history?: DeepSearchHistory): Promise<DeepSearchPlan> {
    const response = await this.chatlunaAdapter.chatWithRetry(
      {
        model: this.config.deepSearch.controllerModel,
        message: buildDeepSearchPlanPrompt(claim, history),
        systemPrompt: DEEP_SEARCH_CONTROLLER_SYSTEM_PROMPT,
      },
      this.config.debug.maxRetries
    )

    return this.parseSearchPlan(response.content, claim)
  }

  private async evaluate(results: AgentSearchResult[], claim: string, history: DeepSearchHistory): Promise<DeepSearchEvaluation> {
    const response = await this.chatlunaAdapter.chatWithRetry(
      {
        model: this.config.deepSearch.controllerModel,
        message: buildDeepSearchEvaluatePrompt(claim, results, history),
        systemPrompt: DEEP_SEARCH_EVALUATE_SYSTEM_PROMPT,
      },
      this.config.debug.maxRetries
    )

    return this.parseEvaluation(response.content, results)
  }

  private async synthesize(claim: string, history: DeepSearchHistory): Promise<DeepSearchReport> {
    const response = await this.chatlunaAdapter.chatWithRetry(
      {
        model: this.config.deepSearch.controllerModel,
        message: buildDeepSearchSynthesizePrompt(claim, history),
        systemPrompt: DEEP_SEARCH_SYNTHESIZE_SYSTEM_PROMPT,
      },
      this.config.debug.maxRetries
    )

    return this.parseFinalReport(response.content, history)
  }

  private async runRound(claim: string, history: DeepSearchHistory, round: number): Promise<{
    plan: DeepSearchPlan
    results: AgentSearchResult[]
    evaluation: DeepSearchEvaluation
  }> {
    const plan = await this.plan(claim, history.rounds.length > 0 ? history : undefined)
    const results = await this.executePlan(plan)

    const previewHistory: DeepSearchHistory = {
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
    }

    const evaluation = await this.evaluate(results, claim, previewHistory)
    return { plan, results, evaluation }
  }

  private async executePlan(plan: DeepSearchPlan): Promise<AgentSearchResult[]> {
    const queries = plan.queries.length > 0
      ? plan.queries
      : [{ query: plan.rationale || '综合核查', focus: '回退默认查询' }]

    const tasks = queries.map((query) => this.searchAgent.search(query))
    const settled = await Promise.allSettled(tasks)

    return settled.map((item, index) => {
      if (item.status === 'fulfilled') {
        return item.value
      }

      const fallbackQuery = queries[index]
      const message = (item.reason as any)?.message || String(item.reason)
      return {
        agentId: 'deepsearch-execute',
        perspective: `DeepSearch 执行失败: ${fallbackQuery?.focus || 'unknown'}`,
        findings: `任务失败: ${message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: message,
      }
    })
  }

  private shouldStop(evaluation: DeepSearchEvaluation, history: DeepSearchHistory): boolean {
    if (!evaluation.shouldStop) {
      return false
    }

    const minConfidence = this.config.deepSearch.minConfidenceThreshold
    if (typeof minConfidence === 'number' && evaluation.confidence < minConfidence) {
      return false
    }

    const minSources = this.config.deepSearch.minSourcesThreshold
    if (typeof minSources === 'number') {
      const sourceCount = this.collectAllSources(history).length
      if (sourceCount < minSources) {
        return false
      }
    }

    return true
  }

  private parseSearchPlan(content: string, claim: string): DeepSearchPlan {
    const parsed = this.parseJson(content)
    const rawQueries = Array.isArray(parsed?.queries) ? parsed.queries : []
    const queries: DeepSearchQuery[] = []

    for (const raw of rawQueries) {
      const query = (raw?.query || '').trim()
      if (!query) continue

      const focus = (raw?.focus || '综合核查').trim()
      const provider = this.parseProvider(raw?.provider)
      const useTool = this.parseUseTool(raw?.useTool)
      const toolArgs = typeof raw?.toolArgs === 'object' && raw.toolArgs
        ? {
            url: typeof raw.toolArgs.url === 'string' ? raw.toolArgs.url.trim() : undefined,
            action: typeof raw.toolArgs.action === 'string' ? raw.toolArgs.action.trim() : undefined,
            params: typeof raw.toolArgs.params === 'string' ? raw.toolArgs.params.trim() : undefined,
          }
        : undefined

      queries.push({ query, focus, provider, useTool, toolArgs })
      if (queries.length >= MAX_PLAN_QUERIES) break
    }

    if (queries.length === 0) {
      queries.push({
        query: claim,
        focus: '综合核查',
        provider: undefined,
      })
    }

    return {
      queries,
      rationale: (parsed?.rationale || '默认回退计划').toString(),
    }
  }

  private parseEvaluation(content: string, results: AgentSearchResult[]): DeepSearchEvaluation {
    const parsed = this.parseJson(content)
    if (!parsed) {
      return this.buildFallbackEvaluation(results)
    }

    return {
      shouldStop: Boolean(parsed.shouldStop),
      reason: (parsed.reason || '无评估理由').toString(),
      confidence: this.clampConfidence(parsed.confidence, this.estimateConfidence(results)),
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps.map((item: unknown) => String(item).trim()).filter(Boolean)
        : undefined,
    }
  }

  private parseFinalReport(content: string, history: DeepSearchHistory): DeepSearchReport {
    const parsed = this.parseJson(content)
    if (!parsed) {
      return this.buildFallbackReport(history)
    }

    const sources = Array.isArray(parsed.sources)
      ? parsed.sources.map((item: unknown) => String(item).trim()).filter(Boolean)
      : this.collectAllSources(history)

    const keyFindings = Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.map((item: unknown) => String(item).trim()).filter(Boolean)
      : this.collectTopFindings(history)

    return {
      summary: (parsed.summary || '已完成 DeepSearch 综合').toString(),
      keyFindings,
      sources,
      confidence: this.clampConfidence(parsed.confidence, this.estimateConfidence(history.rounds.flatMap((r) => r.results))),
      conclusion: (parsed.conclusion || '请结合来源进一步人工复核').toString(),
      rounds: history.rounds.length,
    }
  }

  private buildFallbackEvaluation(results: AgentSearchResult[]): DeepSearchEvaluation {
    const confidence = this.estimateConfidence(results)
    const sourceCount = [...new Set(results.flatMap((item) => item.sources))].length

    return {
      shouldStop: sourceCount >= 2 && confidence >= 0.55,
      reason: '评估解析失败，按来源数量和平均置信度回退',
      confidence,
    }
  }

  private buildFallbackReport(history: DeepSearchHistory): DeepSearchReport {
    const allResults = history.rounds.flatMap((round) => round.results)

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
    }
  }

  private collectTopFindings(history: DeepSearchHistory): string[] {
    return history.rounds
      .flatMap((round) => round.results)
      .map((result) => result.findings?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((text) => (text.length > 220 ? `${text.substring(0, 220)}...` : text))
  }

  private collectAllSources(history: DeepSearchHistory): string[] {
    return [...new Set(
      history.rounds
        .flatMap((round) => round.results)
        .flatMap((result) => result.sources || [])
        .map((source) => source.trim())
        .filter(Boolean)
    )]
  }

  private estimateConfidence(results: AgentSearchResult[]): number {
    if (!results.length) return 0

    const valid = results.filter((item) => !item.failed)
    if (!valid.length) return 0

    const avg = valid.reduce((sum, item) => sum + this.clampConfidence(item.confidence, 0), 0) / valid.length
    return this.clampConfidence(avg, 0.5)
  }

  private clampConfidence(value: unknown, fallback = 0.5): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return fallback
    if (numeric < 0) return 0
    if (numeric > 1) return 1
    return numeric
  }

  private parseJson(content: string): any {
    if (!content) return null

    const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const candidate = markdownMatch ? markdownMatch[1] : content

    try {
      return JSON.parse(candidate)
    } catch {
      // fallback to object extraction
    }

    const objectMatch = content.match(/\{[\s\S]*\}/)
    if (!objectMatch) return null

    try {
      return JSON.parse(objectMatch[0])
    } catch {
      return null
    }
  }

  private parseProvider(value: unknown): ProviderKey | undefined {
    if (value === 'grok' || value === 'gemini' || value === 'chatgpt' || value === 'ollama') {
      return value
    }
    return undefined
  }

  private parseUseTool(value: unknown): DeepSearchQuery['useTool'] {
    if (value === 'web_search' || value === 'browser' || value === 'ollama_search') {
      return value
    }
    return undefined
  }
}
