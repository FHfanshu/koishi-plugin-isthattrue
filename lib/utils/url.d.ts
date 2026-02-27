/**
 * URL 处理工具
 */
/**
 * 在 URL 中间或末尾插入 '、' 以规避审查
 */
export declare function injectCensorshipBypass(text: string): string;
/**
 * 移除文本中所有的 '、' 符号
 */
export declare function removeCensorshipBypass(text: string): string;
