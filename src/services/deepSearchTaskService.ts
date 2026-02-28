import { randomUUID } from 'node:crypto'

import { h } from 'koishi'

import { DeepSearchController } from '../agents/deepSearchController'
import { withTimeout } from '../utils/async'
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

  constructor(private readonly ctx: Ctx, private readonly config: PluginConfig) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTasks(), 60_000)
  }

  dispose(): void {
    clearInterval(this.cleanupTimer)
  }

  submit(claim: string, session?: any): DeepSearchTask {
    this.cleanupExpiredTasks()

    const activeTaskCount = this.queue.length + this.runningCount
    const maxQueuedTasks = Math.max(1, this.config.deepSearch.asyncMaxQueuedTasks || 100)
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
      session,
    }

    this.tasks.set(taskId, task)
    this.queue.push(taskId)
    this.processQueue()
    return task
  }

  getStatus(taskId: string): DeepSearchTask | null {
    this.cleanupExpiredTasks()
    return this.tasks.get(taskId) || null
  }

  getResult(taskId: string): DeepSearchTask | null {
    this.cleanupExpiredTasks()
    return this.tasks.get(taskId) || null
  }

  private processQueue(): void {
    const maxWorkers = Math.max(1, Math.min(this.config.deepSearch.asyncMaxWorkers || 2, 8))

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
      await this.notifyCharacterTaskCompletion(task)
    } catch (error: any) {
      const message = error?.message || 'unknown error'
      const now = Date.now()
      task.status = 'failed'
      task.error = message
      task.finishedAt = now
      task.updatedAt = now
      await this.notifyCharacterTaskCompletion(task)
    }
  }

  private async notifyCharacterTaskCompletion(task: DeepSearchTask): Promise<void> {
    const session = task.session
    if (!session) {
      return
    }

    const character = this.ctx.chatluna_character
    if (!character?.broadcastOnBot || !character?.triggerCollect) {
      return
    }

    const message = this.buildCharacterMessage(task)
    if (!message) {
      return
    }

    try {
      await character.broadcastOnBot(session, [h.text(message)])
      const reason = task.status === 'succeeded' ? 'deep_search_complete' : 'deep_search_failed'
      const triggered = await character.triggerCollect(session, reason)
      if (!triggered) {
        this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 回推后未触发收集（响应锁可能占用）`)
      }
    } catch (error: any) {
      this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 回推失败: ${error?.message || error}`)
    }
  }

  private buildCharacterMessage(task: DeepSearchTask): string {
    if (task.status === 'failed') {
      return `深度搜索任务已完成，但执行失败。\nclaim: ${this.clipText(task.claim, 120)}\nerror: ${task.error || 'unknown error'}`
    }

    if (task.status !== 'succeeded' || !task.report) {
      return ''
    }

    const report = task.report
    const confidence = Math.round(report.confidence * 100)
    const findings = report.keyFindings
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${this.clipText(item, 180)}`)
      .join('\n')

    const findingsBlock = findings.length > 0 ? `\n关键发现:\n${findings}` : ''

    return [
      '深度搜索任务已完成，请基于以下摘要自然回复用户。',
      `claim: ${this.clipText(task.claim, 120)}`,
      `摘要: ${this.clipText(report.summary, 240)}`,
      `结论: ${this.clipText(report.conclusion, 240)}`,
      `置信度: ${confidence}%`,
      findingsBlock,
    ]
      .filter(Boolean)
      .join('\n')
  }

  private clipText(input: string, maxLength: number): string {
    const text = (input || '').trim()
    if (text.length <= maxLength) {
      return text
    }
    return `${text.slice(0, maxLength)}...`
  }

  private cleanupExpiredTasks(): void {
    const ttl = Math.max(60_000, this.config.deepSearch.asyncTaskTtlMs || 600_000)
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
    const iterationCount = Math.max(1, this.config.deepSearch.maxIterations || 1)
    const perIterationTimeout = Math.max(5_000, this.config.deepSearch.perIterationTimeout || 30_000)
    const computed = iterationCount * perIterationTimeout + 10_000
    const ttl = Math.max(60_000, this.config.deepSearch.asyncTaskTtlMs || 600_000)
    return Math.max(15_000, Math.min(computed, ttl))
  }
}
