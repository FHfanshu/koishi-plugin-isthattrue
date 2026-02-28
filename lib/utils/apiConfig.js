"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOllamaEnabled = isOllamaEnabled;
exports.resolveOllamaApiBase = resolveOllamaApiBase;
exports.resolveOllamaApiKey = resolveOllamaApiKey;
const DEFAULT_OLLAMA_API_BASE = 'https://ollama.com/api/web_search';
function pick(...values) {
    for (const value of values) {
        const normalized = (value || '').trim();
        if (normalized)
            return normalized;
    }
    return '';
}
function isOllamaEnabled(config) {
    return config.api?.ollamaEnabled !== false;
}
function resolveOllamaApiBase(config, _scope) {
    return pick(config.api?.ollamaBaseUrl, DEFAULT_OLLAMA_API_BASE);
}
function resolveOllamaApiKey(config, _scope) {
    return pick(config.api?.ollamaApiKey, process.env.OLLAMA_API_KEY);
}
