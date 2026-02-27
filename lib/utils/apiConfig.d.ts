import type { Config } from '../config';
export declare function hasEnabledApiProvider(config: Config, provider: string): boolean;
export declare function resolveOllamaApiBase(config: Config, _scope: 'agent' | 'deepsearch'): string;
export declare function resolveOllamaApiKey(config: Config, _scope: 'agent' | 'deepsearch'): string;
