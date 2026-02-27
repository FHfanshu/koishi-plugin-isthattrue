"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProxyAgent = resolveProxyAgent;
function resolveProxyAgent(tof) {
    if (tof.proxyMode === 'direct')
        return '';
    if (tof.proxyMode === 'custom') {
        const proxy = (tof.proxyAddress || '').trim();
        return proxy || undefined;
    }
    return undefined;
}
