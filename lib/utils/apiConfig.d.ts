import type { PluginConfig, SearchScope } from '../types';
export declare function isOllamaEnabled(config: PluginConfig): boolean;
export declare function resolveOllamaApiBase(config: PluginConfig, _scope: SearchScope): string;
export declare function resolveOllamaApiKey(config: PluginConfig, _scope: SearchScope): string;
