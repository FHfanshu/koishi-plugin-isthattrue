import { Context } from 'koishi';
import type { Config } from '../config';
import type { DeepSearchReport } from '../types';
export type DeepSearchTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';
export interface DeepSearchTask {
    taskId: string;
    claim: string;
    status: DeepSearchTaskStatus;
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    finishedAt?: number;
    error?: string;
    report?: DeepSearchReport;
}
export declare class DeepSearchTaskService {
    private ctx;
    private config;
    private logger;
    private tasks;
    private queue;
    private runningCount;
    private sequence;
    private cleanupTimer;
    constructor(ctx: Context, config: Config);
    dispose(): void;
    submit(claim: string): DeepSearchTask;
    getStatus(taskId: string): DeepSearchTask | null;
    getResult(taskId: string): DeepSearchTask | null;
    private processQueue;
    private executeTask;
    private cleanupExpiredTasks;
    private generateTaskId;
    private getTaskTimeoutMs;
    private withTimeout;
}
