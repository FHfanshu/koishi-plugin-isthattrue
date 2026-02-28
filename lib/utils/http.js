"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProxyAgent = resolveProxyAgent;
function resolveProxyAgent(factCheck) {
    if (factCheck.proxyMode === 'direct')
        return '';
    if (factCheck.proxyMode === 'custom') {
        const proxy = (factCheck.proxyAddress || '').trim();
        return proxy || undefined;
    }
    return undefined;
}
