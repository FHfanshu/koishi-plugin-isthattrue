import { Tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import type { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager'
import { Context } from 'koishi'
import type { DeepSearchReport } from '../types'
import { Config } from '../config'
import { DeepSearchController } from '../agents/deepSearchController'
import { ChatlunaAdapter } from './chatluna'
import { DeepSearchTaskService } from './deepSearchTaskService'
import { withTimeout } from '../utils/async'

const DEEP_SEARCH_TOOL_NAME = 'deep_search'
const DEEP_SEARCH_TOOL_DESCRIPTION = '深度搜索验证：输入待核查文本，执行多轮迭代搜索，返回综合发现与来源。'
type DeepSearchAction = 'submit' | 'status' | 'result'

interface DeepSearchActionInput {
  action: DeepSearchAction
  claim?: string
  taskId?: string
}

type ActionParseResult =
  | { type: 'none' }
  | { type: 'invalid'; message: string }
  | { type: 'valid'; value: DeepSearchActionInput }

class DeepSearchTool extends Tool {
  name = DEEP_SEARCH_TOOL_NAME
  description = DEEP_SEARCH_TOOL_DESCRIPTION
  private logger
  private controller: DeepSearchController

  constructor(
    private ctx: Context,
    private config: Config,
    private taskService: DeepSearchTaskService
  ) {
    super()
    this.logger = ctx.logger('chatluna-fact-check')
    this.controller = new DeepSearchController(ctx, config, new ChatlunaAdapter(ctx, config))
  }

  /** 工具整体硬超时（毫秒），必须低于 chatluna-character 的 lock timeout (180s) */
  private static readonly HARD_TIMEOUT_MS = 120_000

  /** 异步模式下后台任务的宽松超时（毫秒） */
  private static readonly ASYNC_TIMEOUT_MS = 10 * 60_000

  async _call(
    input: string,
    _runManager?: CallbackManagerForToolRun,
    config?: RunnableConfig
  ): Promise<string> {
    const rawInput = (input || '').trim()
    if (!rawInput) {
      return '[DeepSearch]\n输入为空，请提供需要核查的文本。'
    }

    // JSON action 输入（submit/status/result）走原有异步任务模式
    const parsedAction = this.parseActionInput(rawInput)
    if (parsedAction.type === 'invalid') {
      return `[DeepSearch]\n${parsedAction.message}`
    }
    if (parsedAction.type === 'valid') {
      return this.handleActionInput(parsedAction.value)
    }

    const maxInputChars = this.config.agent.maxInputChars || 1200
    const claim = rawInput.substring(0, maxInputChars)
    if (rawInput.length > maxInputChars) {
      this.logger.warn(`[DeepSearchTool] 输入过长，已截断到 ${maxInputChars} 字符`)
    }

    // 透明异步模式：秒返 + 后台执行 + session.send() 推送结果
    const session = (config as any)?.configurable?.session
    if (this.config.agent.asyncMode && session) {
      this.logger.info('[DeepSearchTool] 透明异步模式启动')
      this.executeAsync(claim, session)
      return '[DeepSearch]\n深度搜索任务已在后台启动，结果将稍后自动发送到本会话。请基于当前已有信息回答用户，不要猜测搜索结果。'
    }

    // 同步模式：硬超时兜底
    try {
      const report = await withTimeout(
        this.controller.search(claim),
        DeepSearchTool.HARD_TIMEOUT_MS,
        'DeepSearch 整体'
      )
      return this.formatReport(report)
    } catch (error) {
      this.logger.error('[DeepSearchTool] 执行失败（可能超时）:', error)
      return `[DeepSearch]\n执行失败: ${(error as Error).message}`
    }
  }

  /**
   * 透明异步后台执行：不阻塞工具返回，完成后通过 session.send() 推送结果。
   */
  private executeAsync(claim: string, session: any): void {
    withTimeout(
      this.controller.search(claim),
      DeepSearchTool.ASYNC_TIMEOUT_MS,
      'DeepSearch 异步'
    )
      .then((report) => {
        return session.send(`[DeepSearch 异步结果]\n${this.formatReport(report)}`)
      })
      .catch((error: Error) => {
        this.logger.error('[DeepSearchTool] 异步执行失败:', error)
        return session.send(`[DeepSearch 异步结果]\n执行失败: ${error.message}`).catch(() => {})
      })
      .catch(() => {
        // session.send 失败，静默忽略
      })
  }

  private parseActionInput(rawInput: string): ActionParseResult {
    if (!(rawInput.startsWith('{') && rawInput.endsWith('}'))) {
      return { type: 'none' }
    }

    let parsed: any
    try {
      parsed = JSON.parse(rawInput)
    } catch {
      return {
        type: 'invalid',
        message: 'JSON 输入解析失败。异步模式请使用 {"action":"submit|status|result", ...}。'
      }
    }

    const action = (parsed?.action || '').toString().trim().toLowerCase()
    if (!['submit', 'status', 'result'].includes(action)) {
      return {
        type: 'invalid',
        message: 'JSON 输入缺少有效 action。支持: submit | status | result。'
      }
    }

    return {
      type: 'valid',
      value: {
        action: action as DeepSearchAction,
        claim: typeof parsed?.claim === 'string' ? parsed.claim : undefined,
        taskId: typeof parsed?.taskId === 'string' ? parsed.taskId : undefined,
      },
    }
  }

  private async handleActionInput(actionInput: DeepSearchActionInput): Promise<string> {
    if (!this.config.deepSearch.asyncEnable) {
      return '[DeepSearch]\n异步模式未启用，请在配置中开启 deepSearch.asyncEnable=true'
    }

    if (actionInput.action === 'submit') {
      const rawClaim = (actionInput.claim || '').trim()
      if (!rawClaim) {
        return '[DeepSearch]\nsubmit 模式缺少 claim 字段'
      }

      const maxInputChars = this.config.agent.maxInputChars || 1200
      const claim = rawClaim.substring(0, maxInputChars)
      if (rawClaim.length > maxInputChars) {
        this.logger.warn(`[DeepSearchTool] submit 输入过长，已截断到 ${maxInputChars} 字符`)
      }

      try {
        const task = this.taskService.submit(claim)
        return `[DeepSearch]
任务已提交
taskId: ${task.taskId}
状态: ${task.status}`
      } catch (error) {
        return `[DeepSearch]\n任务提交失败: ${(error as Error).message}`
      }
    }

    if (actionInput.action === 'status') {
      const taskId = (actionInput.taskId || '').trim()
      if (!taskId) {
        return '[DeepSearch]\nstatus 模式缺少 taskId 字段'
      }

      const task = this.taskService.getStatus(taskId)
      if (!task) {
        return `[DeepSearch]\n任务不存在: ${taskId}`
      }

      const elapsed = this.formatElapsed(task.startedAt || task.createdAt)
      return `[DeepSearch]
taskId: ${task.taskId}
状态: ${task.status}
耗时: ${elapsed}`
    }

    const taskId = (actionInput.taskId || '').trim()
    if (!taskId) {
      return '[DeepSearch]\nresult 模式缺少 taskId 字段'
    }

    const task = this.taskService.getResult(taskId)
    if (!task) {
      return `[DeepSearch]\n任务不存在: ${taskId}`
    }

    if (task.status === 'succeeded' && task.report) {
      return this.formatReport(task.report)
    }

    if (task.status === 'failed') {
      return `[DeepSearch]\n任务执行失败: ${task.error || 'unknown error'}`
    }

    if (task.status === 'expired') {
      return `[DeepSearch]\n任务已过期: ${taskId}`
    }

    return `[DeepSearch]\n任务尚未完成，当前状态: ${task.status}`
  }

  private formatElapsed(startTime: number): string {
    const elapsedMs = Math.max(0, Date.now() - startTime)
    if (elapsedMs < 1000) return `${elapsedMs}ms`
    if (elapsedMs < 60000) return `${Math.round(elapsedMs / 1000)}s`
    return `${Math.round(elapsedMs / 60000)}min`
  }

  private formatReport(report: DeepSearchReport): string {
    const sourceLimit = this.config.agent.maxSources || 5
    const findingLines = report.keyFindings.length > 0
      ? report.keyFindings.slice(0, 6).map(item => `- ${item}`).join('\n')
      : '- 无关键发现'
    const sourceLines = report.sources.length > 0
      ? report.sources.slice(0, sourceLimit).map(item => `- ${item}`).join('\n')
      : '- 无'
    const confidence = Math.round(report.confidence * 100)

    return `[DeepSearch]
摘要: ${report.summary}
轮次: ${report.rounds}
置信度: ${confidence}%

[KeyFindings]
${findingLines}

[Sources]
${sourceLines}

[Conclusion]
${report.conclusion}`
  }
}

export function registerDeepSearchTool(ctx: Context, config: Config) {
  const logger = ctx.logger('chatluna-fact-check')
  if (!config.deepSearch.enable) {
    logger.info('[DeepSearchTool] DeepSearch 未启用，跳过工具注册')
    return
  }

  const chatluna = (ctx as any).chatluna
  if (!chatluna?.platform?.registerTool) {
    logger.warn('[DeepSearchTool] chatluna.platform.registerTool 不可用，跳过注册')
    return
  }

  const taskService = new DeepSearchTaskService(ctx, config)

  ctx.effect(() => {
    logger.info(`[DeepSearchTool] 注册工具: ${DEEP_SEARCH_TOOL_NAME}`)
    const dispose = chatluna.platform.registerTool(DEEP_SEARCH_TOOL_NAME, {
      createTool() {
        return new DeepSearchTool(ctx, config, taskService)
      },
      selector() {
        return true
      },
    })

    return () => {
      taskService.dispose()
      if (typeof dispose === 'function') {
        dispose()
      }
    }
  })
}
