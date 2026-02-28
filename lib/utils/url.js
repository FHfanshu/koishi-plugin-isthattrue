"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeUrl = normalizeUrl;
exports.extractUrls = extractUrls;
exports.removeCensorshipBypass = removeCensorshipBypass;
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
function extractUrls(text) {
    const matches = (text || '').match(/https?:\/\/[^\s\])"']+/g) || [];
    return [...new Set(matches.map((url) => normalizeUrl(url)).filter(Boolean))];
}
function removeCensorshipBypass(text) {
    if (/^https?:\/\//.test(text.trim())) {
        return text.replace(/、/g, '');
    }
    return text.replace(/(https?:\/\/[^\s]+)/g, (url) => url.replace(/、/g, ''));
}
