import type { DeepSearchTask, PluginConfig } from '../types';
type Ctx = any;
export declare class DeepSearchTaskService {
    private readonly ctx;
    private readonly config;
    static readonly EXPIRED_GRACE_MS = 5000;
    private readonly logger;
    private readonly tasks;
    private queue;
    private runningCount;
    private sequence;
    private readonly cleanupTimer;
    constructor(ctx: Ctx, config: PluginConfig);
    dispose(): void;
    submit(claim: string, session?: any): DeepSearchTask;
    getStatus(taskId: string): DeepSearchTask | null;
    getResult(taskId: string): DeepSearchTask | null;
    private processQueue;
    private executeTask;
    private notifyCharacterTaskCompletion;
    private buildCharacterMessage;
    private clipText;
    private cleanupExpiredTasks;
    private generateTaskId;
    private getTaskTimeoutMs;
}
export {};
