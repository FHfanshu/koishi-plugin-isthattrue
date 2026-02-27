"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSearchTaskService = void 0;
const deepSearchController_1 = require("../agents/deepSearchController");
const chatluna_1 = require("./chatluna");
const node_crypto_1 = require("node:crypto");
const async_1 = require("../utils/async");
class DeepSearchTaskService {
    ctx;
    config;
    logger;
    static HARD_TIMEOUT_MS = 10 * 60_000;
    tasks = new Map();
    queue = [];
    runningCount = 0;
    sequence = 0;
    cleanupTimer;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.logger = ctx.logger('chatluna-fact-check');
        this.cleanupTimer = setInterval(() => this.cleanupExpiredTasks(), 60_000);
    }
    dispose() {
        clearInterval(this.cleanupTimer);
    }
    submit(claim) {
        this.cleanupExpiredTasks();
        const activeTaskCount = this.queue.length + this.runningCount;
        const maxQueuedTasks = Math.max(1, this.config.deepSearch.asyncMaxQueuedTasks || 100);
        if (activeTaskCount >= maxQueuedTasks) {
            throw new Error(`异步任务队列已满（${maxQueuedTasks}）`);
        }
        const taskId = this.generateTaskId();
        const now = Date.now();
        const task = {
            taskId,
            claim,
            status: 'queued',
            createdAt: now,
            updatedAt: now,
        };
        this.tasks.set(taskId, task);
        this.queue.push(taskId);
        this.processQueue();
        return task;
    }
    getStatus(taskId) {
        this.cleanupExpiredTasks();
        return this.tasks.get(taskId) || null;
    }
    getResult(taskId) {
        this.cleanupExpiredTasks();
        return this.tasks.get(taskId) || null;
    }
    processQueue() {
        const maxWorkers = Math.max(1, Math.min(this.config.deepSearch.asyncMaxWorkers || 2, 8));
        while (this.runningCount < maxWorkers && this.queue.length > 0) {
            const taskId = this.queue.shift();
            if (!taskId)
                continue;
            const task = this.tasks.get(taskId);
            if (!task || task.status !== 'queued')
                continue;
            task.status = 'running';
            task.startedAt = Date.now();
            task.updatedAt = Date.now();
            this.runningCount += 1;
            this.executeTask(task)
                .catch((error) => {
                this.logger.warn(`[DeepSearchTaskService] 任务 ${task.taskId} 执行异常: ${error.message}`);
            })
                .finally(() => {
                this.runningCount = Math.max(0, this.runningCount - 1);
                this.processQueue();
            });
        }
    }
    async executeTask(task) {
        try {
            const controller = new deepSearchController_1.DeepSearchController(this.ctx, this.config, new chatluna_1.ChatlunaAdapter(this.ctx, this.config));
            const hardTimeoutMs = this.getTaskTimeoutMs();
            const report = await (0, async_1.withTimeout)(controller.search(task.claim), hardTimeoutMs, `DeepSearchTask(${task.taskId})`);
            task.status = 'succeeded';
            task.report = report;
            task.finishedAt = Date.now();
            task.updatedAt = task.finishedAt;
        }
        catch (error) {
            const message = error.message || 'unknown error';
            const now = Date.now();
            task.status = 'failed';
            task.error = message;
            task.finishedAt = now;
            task.updatedAt = now;
            if (message.includes('超时')) {
                // 异步任务超时后立即销毁，避免长期堆积占用查询空间
                this.tasks.delete(task.taskId);
            }
        }
    }
    cleanupExpiredTasks() {
        const ttl = Math.max(60_000, this.config.deepSearch.asyncTaskTtlMs || 600_000);
        const removeAfter = ttl * 2;
        const now = Date.now();
        for (const [taskId, task] of this.tasks.entries()) {
            if (task.status === 'running' || task.status === 'queued') {
                continue;
            }
            const age = now - task.updatedAt;
            if (age > ttl && task.status !== 'expired') {
                task.status = 'expired';
                task.updatedAt = now;
            }
            if (age > removeAfter) {
                this.tasks.delete(taskId);
            }
        }
        if (this.queue.length > 0) {
            this.queue = this.queue.filter(taskId => {
                const task = this.tasks.get(taskId);
                return !!task && task.status === 'queued';
            });
        }
    }
    generateTaskId() {
        this.sequence += 1;
        return `ds_${(0, node_crypto_1.randomUUID)()}_${this.sequence.toString(36)}`;
    }
    getTaskTimeoutMs() {
        const iterationCount = Math.max(1, this.config.deepSearch.maxIterations || 1);
        const perIterationTimeout = Math.max(5000, this.config.deepSearch.perIterationTimeout || 30000);
        const computed = iterationCount * perIterationTimeout + 10_000;
        return Math.max(15_000, Math.min(computed, DeepSearchTaskService.HARD_TIMEOUT_MS));
    }
}
exports.DeepSearchTaskService = DeepSearchTaskService;
