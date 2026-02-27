/**
 * 带超时的 Promise 包装
 * @param promise 原始 Promise
 * @param timeoutMs 超时毫秒数
 * @param label 超时错误标签
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T>;
