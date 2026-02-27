/**
 * URL 处理工具
 */
/**
 * 规范化 URL：移除 hash、尾部斜杠
 */
export declare function normalizeUrl(url: string): string;
/**
 * 从文本中提取所有 URL（去重并规范化）
 */
export declare function extractUrls(text: string): string[];
/**
 * 移除文本中 URL 内可能被注入的审查规避字符（中文顿号 '、'）
 * 仅对 URL 部分生效，不影响正文中正常使用的顿号
 */
export declare function removeCensorshipBypass(text: string): string;
