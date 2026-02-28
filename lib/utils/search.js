"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeResultItems = normalizeResultItems;
function normalizeResultItems(searchResult) {
    if (!searchResult)
        return [];
    if (Array.isArray(searchResult)) {
        return searchResult;
    }
    if (typeof searchResult === 'string') {
        try {
            const parsed = JSON.parse(searchResult);
            return normalizeResultItems(parsed);
        }
        catch {
            return [{ description: searchResult }];
        }
    }
    if (typeof searchResult === 'object' && searchResult) {
        const record = searchResult;
        if (Array.isArray(record.results))
            return record.results;
        if (Array.isArray(record.items))
            return record.items;
        if (Array.isArray(record.data))
            return record.data;
        if (record.url || record.title || record.description || record.content) {
            return [record];
        }
    }
    return [];
}
