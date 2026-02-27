"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = withTimeout;
/**
 * 带超时的 Promise 包装
 * @param promise 原始 Promise
 * @param timeoutMs 超时毫秒数
 * @param label 超时错误标签
 */
async function withTimeout(promise, timeoutMs, label) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
