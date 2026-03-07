"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeModelName = normalizeModelName;
function normalizeModelName(model) {
    const value = (model || '').trim();
    if (!value)
        return '';
    const lower = value.toLowerCase();
    if (value === '无'
        || lower === 'none'
        || lower === 'null'
        || lower === 'nil'
        || lower === 'n/a'
        || lower === 'na'
        || lower === 'undefined'
        || lower === '-') {
        return '';
    }
    return value;
}
