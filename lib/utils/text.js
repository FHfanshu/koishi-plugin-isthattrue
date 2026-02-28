"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.truncate = truncate;
function truncate(text, maxChars, emptyFallback = '') {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    if (!normalized)
        return emptyFallback;
    return normalized.length > maxChars
        ? `${normalized.substring(0, maxChars)}...`
        : normalized;
}
