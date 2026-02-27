"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
function getEnabledApiEntry(config) {
    const table = Array.isArray(config.api?.apiKeys) ? config.api.apiKeys : [];
    for (const row of table) {
        if (!Array.isArray(row) || row.length < 4)
            continue;
        const [rowProvider, rowKey, rowBase, rowEnabled] = row;
        if (rowProvider !== 'ollama')
            continue;
        if (!rowEnabled)
            continue;
        return {
            apiKey: pick(rowKey),
            baseUrl: pick(rowBase),
        };
    }
    return null;
}
function resolveOllamaApiBase(config, scope) {
    const entry = getEnabledApiEntry(config);
    if (scope === 'deepsearch') {
        return pick(config.deepSearch.ollamaSearchApiBase, entry?.baseUrl, config.api.ollamaSearchApiBase, DEFAULT_OLLAMA_API_BASE);
    }
    return pick(config.agent.ollamaSearchApiBase, entry?.baseUrl, config.api.ollamaSearchApiBase, DEFAULT_OLLAMA_API_BASE);
}
function resolveOllamaApiKey(config, scope) {
    const entry = getEnabledApiEntry(config);
    if (scope === 'deepsearch') {
        return pick(config.deepSearch.ollamaSearchApiKey, entry?.apiKey, config.api.ollamaSearchApiKey, process.env.OLLAMA_API_KEY);
    }
    return pick(config.agent.ollamaSearchApiKey, entry?.apiKey, config.api.ollamaSearchApiKey, process.env.OLLAMA_API_KEY);
}
