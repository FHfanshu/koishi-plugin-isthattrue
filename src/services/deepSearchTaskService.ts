import { Context } from 'koishi'
import type { Config } from '../config'
import type { DeepSearchReport } from '../types'
import { DeepSearchController } from '../agents/deepSearchController'
import { ChatlunaAdapter } from './chatluna'
import { randomUUID } from 'node:crypto'

export type DeepSearchTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired'

export interface DeepSearchTask {
  taskId: string
  claim: string
  status: DeepSearchTaskStatus
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
  error?: string
  report?: DeepSearchReport
}

export class DeepSearchTaskService {
  private logger
  private static readonly HARD_TIMEOUT_MS = 10 * 60_000
  private tasks = new Map<string, DeepSearchTask>()
  private queue: string[] = []
  private runningCount = 0
  private sequence = 0
  private cleanupTimer: NodeJS.Timeout

  constructor(
    private ctx: Context,
    private config: Config
  ) {
    this.logger = ctx.logger('chatluna-fact-check')
    this.cleanupTimer = setInterval(() => this.cleanupExpiredTasks(), 60_000)
  }

  dispose() {
    clearInterval(this.cleanupTimer)
  }

  submit(claim: string): DeepSearchTask {
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

  private processQueue() {
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
        .catch((error) => {
          this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 执行异常: ${(error as Error).message}`)
        })
        .finally(() => {
          this.runningCount = Math.max(0, this.runningCount - 1)
          this.processQueue()
        })
    }
  }

  private async executeTask(task: DeepSearchTask) {
    try {
      const controller = new DeepSearchController(
        this.ctx,
        this.config,
        new ChatlunaAdapter(this.ctx, this.config)
      )
      const hardTimeoutMs = this.getTaskTimeoutMs()
      const report = await this.withTimeout(
        controller.search(task.claim),
        hardTimeoutMs,
        `DeepSearchTask(${task.taskId})`
      )

      task.status = 'succeeded'
      task.report = report
      task.finishedAt = Date.now()
      task.updatedAt = task.finishedAt
    } catch (error) {
      const message = (error as Error).message || 'unknown error'
      const now = Date.now()
      task.status = 'failed'
      task.error = message
      task.finishedAt = now
      task.updatedAt = now

      if (message.includes('超时')) {
        // 异步任务超时后立即销毁，避免长期堆积占用查询空间
        this.tasks.delete(task.taskId)
      }
    }
  }

  private cleanupExpiredTasks() {
    const ttl = Math.max(60_000, this.config.deepSearch.asyncTaskTtlMs || 600_000)
    const removeAfter = ttl * 2
    const now = Date.now()

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === 'running' || task.status === 'queued') {
        continue
      }

      const age = now - task.updatedAt
      if (age > ttl && task.status !== 'expired') {
        task.status = 'expired'
        task.updatedAt = now
      }

      if (age > removeAfter) {
        this.tasks.delete(taskId)
      }
    }

    if (this.queue.length > 0) {
      this.queue = this.queue.filter(taskId => {
        const task = this.tasks.get(taskId)
        return !!task && task.status === 'queued'
      })
    }
  }

  private generateTaskId(): string {
    this.sequence += 1
    return `ds_${randomUUID()}_${this.sequence.toString(36)}`
  }

  private getTaskTimeoutMs(): number {
    const iterationCount = Math.max(1, this.config.deepSearch.maxIterations || 1)
    const perIterationTimeout = Math.max(5000, this.config.deepSearch.perIterationTimeout || 30000)
    const computed = iterationCount * perIterationTimeout + 10_000
    return Math.max(15_000, Math.min(computed, DeepSearchTaskService.HARD_TIMEOUT_MS))
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | null = null
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
