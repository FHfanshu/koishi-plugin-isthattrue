"use strict";
/**
 * URL 处理工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
exports.extractUrls = extractUrls;
exports.removeCensorshipBypass = removeCensorshipBypass;
/**
 * 规范化 URL：移除 hash、尾部斜杠
 */
function normalizeUrl(url) {
    const trimmed = (url || '').trim();
    if (!trimmed)
        return '';
    try {
        const parsed = new URL(trimmed);
        parsed.hash = '';
        const normalized = parsed.toString();
        return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
    }
    catch {
        return trimmed;
    }
}
/**
 * 从文本中提取所有 URL（去重并规范化）
 */
function extractUrls(text) {
    const matches = (text || '').match(/https?:\/\/[^\s\])"']+/g) || [];
    return [...new Set(matches.map(url => normalizeUrl(url)).filter(Boolean))];
}
/**
 * 移除文本中 URL 内可能被注入的审查规避字符（中文顿号 '、'）
 * 仅对 URL 部分生效，不影响正文中正常使用的顿号
 */
function removeCensorshipBypass(text) {
    if (/^https?:\/\//.test(text.trim())) {
        return text.replace(/、/g, '');
    }
    return text.replace(/(https?:\/\/[^\s]+)/g, (url) => url.replace(/、/g, ''));
}
