import { randomUUID } from 'node:crypto'

import { h } from 'koishi'

import { DeepSearchController } from '../agents/deepSearchController'
import { withTimeout } from '../utils/async'
import { clipText, maybeSummarize } from '../utils/summary'
import { ChatlunaAdapter } from './chatluna'

import type { DeepSearchTask, PluginConfig } from '../types'

type Ctx = any

export class DeepSearchTaskService {
  static readonly EXPIRED_GRACE_MS = 5_000

  private readonly logger: any
  private readonly tasks = new Map<string, DeepSearchTask>()
  private queue: string[] = []
  private runningCount = 0
  private sequence = 0
  private readonly cleanupTimer: NodeJS.Timeout
  private disposed = false

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTasks(), 60_000)
  }

  dispose(): void {
    this.disposed = true
    clearInterval(this.cleanupTimer)
    this.queue = []
    this.tasks.clear()
  }

  submit(claim: string, session?: any, conversationId?: string): DeepSearchTask {
    if (this.disposed) {
      throw new Error('DeepSearchTaskService 已释放，无法提交任务')
    }

    this.cleanupExpiredTasks()

    const activeTaskCount = this.queue.length + this.runningCount
    const maxQueuedTasks = Math.max(1, this.config.search.asyncMaxQueuedTasks || 100)
    if (activeTaskCount >= maxQueuedTasks) {
      throw new Error(`异步任务队列已满（${maxQueuedTasks}）`)
    }

    const taskId = this.generateTaskId()
    const now = Date.now()

    const task: DeepSearchTask = {
      taskId,
      claim,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      ownerId: this.resolveTaskOwner(session) || undefined,
      session,
      conversationId,
    }

    this.tasks.set(taskId, task)
    this.queue.push(taskId)
    this.processQueue()
    return task
  }

  getStatus(taskId: string, session?: any): DeepSearchTask | null {
    this.cleanupExpiredTasks()
    const task = this.tasks.get(taskId)
    if (!task) {
      return null
    }

    if (!this.canAccessTask(task, session)) {
      return null
    }

    return task
  }

  getResult(taskId: string, session?: any): DeepSearchTask | null {
    this.cleanupExpiredTasks()
    const task = this.tasks.get(taskId)
    if (!task) {
      return null
    }

    if (!this.canAccessTask(task, session)) {
      return null
    }

    return task
  }

  private processQueue(): void {
    if (this.disposed) {
      return
    }

    const maxWorkers = Math.max(1, Math.min(this.config.search.asyncMaxWorkers || 2, 8))

    while (this.runningCount < maxWorkers && this.queue.length > 0) {
      const taskId = this.queue.shift()
      if (!taskId) continue

      const task = this.tasks.get(taskId)
      if (!task || task.status !== 'queued') continue

      task.status = 'running'
      task.startedAt = Date.now()
      task.updatedAt = Date.now()
      this.runningCount += 1

      this.executeTask(task)
        .catch((error: any) => {
          this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 执行异常: ${error?.message || error}`)
        })
        .finally(() => {
          this.runningCount = Math.max(0, this.runningCount - 1)
          this.processQueue()
        })
    }
  }

  private async executeTask(task: DeepSearchTask): Promise<void> {
    try {
      const controller = new DeepSearchController(this.ctx, this.config, new ChatlunaAdapter(this.ctx, this.config))
      const hardTimeoutMs = this.getTaskTimeoutMs()
      const report = await withTimeout(controller.search(task.claim), hardTimeoutMs, `DeepSearchTask(${task.taskId})`)

      task.status = 'succeeded'
      task.report = report
      task.finishedAt = Date.now()
      task.updatedAt = task.finishedAt
      await this.notifyTaskCompletion(task)
    } catch (error: any) {
      const message = error?.message || 'unknown error'
      const now = Date.now()
      task.status = 'failed'
      task.error = message
      task.finishedAt = now
      task.updatedAt = now
      await this.notifyTaskCompletion(task)
    }
  }

  private async notifyTaskCompletion(task: DeepSearchTask): Promise<void> {
    if (this.disposed) {
      return
    }

    const session = task.session

    const rawMessage = this.buildCompletionMessage(task)
    if (!rawMessage) {
      return
    }

    const message = await maybeSummarize(this.ctx, this.config, rawMessage, `DeepSearch回推(${task.taskId})`)

    try {
      const pushed = this.pushToChatlunaConversation(task, message)
      if (!pushed && session) {
        await this.notifyCharacterFallback(session, message, task)
      }
    } catch (error: any) {
      this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 回推失败: ${error?.message || error}`)
    }
  }

  private pushToChatlunaConversation(task: DeepSearchTask, message: string): boolean {
    const contextManager = this.ctx.chatluna?.contextManager
    if (!contextManager?.inject) {
      return false
    }

    const conversationId = this.resolveConversationId(task)
    if (!conversationId) {
      return false
    }

    contextManager.inject({
      conversationId,
      name: `deep_search_${task.status}`,
      value: message,
      once: true,
      stage: 'injections',
    })
    this.logger.info(`[DeepSearchTaskService] 任务 ${task.taskId} 已注入 chatluna 上下文: ${conversationId}`)
    return true
  }

  private async notifyCharacterFallback(session: any, message: string, task: DeepSearchTask): Promise<void> {
    const character = this.ctx.chatluna_character
    if (!character?.broadcastOnBot || !character?.triggerCollect) {
      return
    }

    await character.broadcastOnBot(session, [h.text(message)])
    const reason = task.status === 'succeeded' ? 'deep_search_complete' : 'deep_search_failed'
    const triggered = await character.triggerCollect(session, reason)
    if (!triggered) {
      this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 回推后未触发收集（响应锁可能占用）`)
    }
  }

  private buildCompletionMessage(task: DeepSearchTask): string {
    if (task.status === 'failed') {
      return `深度搜索任务已完成，但执行失败。\nclaim: ${clipText(task.claim, 120)}\nerror: ${task.error || 'unknown error'}`
    }

    if (task.status !== 'succeeded' || !task.report) {
      return ''
    }

    const report = task.report
    const confidence = Math.round(report.confidence * 100)
    const findings = report.keyFindings
      .slice(0, 5)
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n')

    const findingsBlock = findings.length > 0 ? `\n关键发现:\n${findings}` : ''

    return [
      '深度搜索任务已完成，请基于以下摘要自然回复用户。',
      `claim: ${clipText(task.claim, 200)}`,
      `摘要: ${report.summary}`,
      `结论: ${report.conclusion}`,
      `置信度: ${confidence}%`,
      findingsBlock,
    ]
      .filter(Boolean)
      .join('\n')
  }

  private resolveConversationId(task: DeepSearchTask): string {
    if (typeof task.conversationId === 'string' && task.conversationId) {
      return task.conversationId
    }

    const session = task.session
    const sessionConversationId = typeof session?.conversationId === 'string' ? session.conversationId : ''
    if (sessionConversationId) {
      return sessionConversationId
    }

    const guildId = typeof session?.guildId === 'string' ? session.guildId : ''
    if (guildId) {
      return guildId
    }

    const channelId = typeof session?.channelId === 'string' ? session.channelId : ''
    return channelId
  }

  private cleanupExpiredTasks(): void {
    const ttl = Math.max(60_000, (this.config.search.asyncTaskTtl || 600) * 1000)
    const now = Date.now()

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'running' || task.status === 'queued') {
        continue
      }

      const age = now - task.updatedAt
      if (age > ttl && task.status !== 'expired') {
        task.status = 'expired'
        task.updatedAt = now
        continue
      }

      if (task.status === 'expired' && age > DeepSearchTaskService.EXPIRED_GRACE_MS) {
        this.tasks.delete(taskId)
      }
    }

    if (this.queue.length > 0) {
      this.queue = this.queue.filter((taskId) => {
        const task = this.tasks.get(taskId)
        return Boolean(task && task.status === 'queued')
      })
    }
  }

  private generateTaskId(): string {
    this.sequence += 1
    return `ds_${randomUUID()}_${this.sequence.toString(36)}`
  }

  private getTaskTimeoutMs(): number {
    const iterationCount = Math.max(1, this.config.search.maxIterations || 1)
    const perIterationTimeout = Math.max(5_000, (this.config.search.perIterationTimeout || 30) * 1000)
    const computed = iterationCount * perIterationTimeout + 10_000
    const ttl = Math.max(60_000, (this.config.search.asyncTaskTtl || 600) * 1000)
    return Math.max(15_000, Math.min(computed, ttl))
  }

  private canAccessTask(task: DeepSearchTask, session?: any): boolean {
    if (!task.ownerId) {
      return true
    }

    const requester = this.resolveTaskOwner(session)
    return Boolean(requester && requester === task.ownerId)
  }

  private resolveTaskOwner(session?: any): string {
    const platform = typeof session?.platform === 'string' ? session.platform : 'unknown'
    const userId = typeof session?.userId === 'string' ? session.userId : ''
    const channelId = typeof session?.channelId === 'string' ? session.channelId : ''
    const guildId = typeof session?.guildId === 'string' ? session.guildId : ''

    if (!userId) {
      return ''
    }

    return `${platform}:${userId}:${channelId || guildId || 'dm'}`
  }
}
