export declare enum Verdict {
    TRUE = "true",
    FALSE = "false",
    UNCERTAIN = "uncertain",
    PARTIALLY_TRUE = "partially_true"
}
export type ProviderKey = 'grok' | 'gemini' | 'chatgpt' | 'ollama';
export type SearchScope = 'agent' | 'deepsearch';
export interface ApiConfig {
    ollamaApiKey: string;
    ollamaBaseUrl: string;
    ollamaEnabled: boolean;
}
export interface AgentConfig {
    enable: boolean;
    enableQuickTool: boolean;
    quickToolName: string;
    quickToolDescription: string;
    maxInputChars: number;
    maxSources: number;
    appendChatlunaSearchContext: boolean;
    appendOllamaSearchContext: boolean;
    searchContextTimeout: number;
    searchContextMaxChars: number;
    searchContextMaxSources: number;
    enableMultiSourceSearch: boolean;
    grokModel: string;
    geminiModel: string;
    chatgptModel: string;
    ollamaSearchMaxResults: number;
    ollamaSearchTimeout: number;
    perSourceTimeout: number;
    fastReturnMinSuccess: number;
    fastReturnMaxWaitMs: number;
    maxFindingsChars: number;
}
export interface DeepSearchConfig {
    enable: boolean;
    asyncEnable: boolean;
    asyncMaxWorkers: number;
    asyncTaskTtlMs: number;
    asyncMaxQueuedTasks: number;
    controllerModel: string;
    maxIterations: number;
    perIterationTimeout: number;
    minConfidenceThreshold: number | null;
    minSourcesThreshold: number | null;
    useChatlunaSearchTool: boolean;
    usePuppeteerBrowser: boolean;
}
export type ProxyMode = 'follow-global' | 'direct' | 'custom';
export interface FactCheckConfig {
    maxRetries: number;
    proxyMode: ProxyMode;
    proxyAddress: string;
    logLLMDetails: boolean;
}
export interface PluginConfig {
    api: ApiConfig;
    factCheck: AgentConfig;
    deepSearch: DeepSearchConfig;
    debug: FactCheckConfig;
}
export interface SearchResultItem {
    title?: string;
    name?: string;
    description?: string;
    content?: string;
    snippet?: string;
    url?: string;
    link?: string;
    [key: string]: unknown;
}
export interface AgentSearchResult {
    agentId: string;
    perspective: string;
    findings: string;
    sources: string[];
    confidence: number;
    failed?: boolean;
    error?: string;
}
export interface DeepSearchQuery {
    query: string;
    focus: string;
    provider?: ProviderKey;
    useTool?: 'web_search' | 'browser' | 'ollama_search';
    toolArgs?: {
        url?: string;
        action?: string;
        params?: string;
    };
}
export interface DeepSearchPlan {
    queries: DeepSearchQuery[];
    rationale: string;
}
export interface DeepSearchEvaluation {
    shouldStop: boolean;
    reason: string;
    confidence: number;
    gaps?: string[];
}
export interface DeepSearchRound {
    round: number;
    plan: DeepSearchPlan;
    results: AgentSearchResult[];
    evaluation: DeepSearchEvaluation;
    elapsedMs: number;
}
export interface DeepSearchHistory {
    rounds: DeepSearchRound[];
}
export interface DeepSearchReport {
    summary: string;
    keyFindings: string[];
    sources: string[];
    confidence: number;
    conclusion: string;
    rounds: number;
}
export type DeepSearchTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'expired';
export interface DeepSearchTask {
    taskId: string;
    claim: string;
    status: DeepSearchTaskStatus;
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    finishedAt?: number;
    report?: DeepSearchReport;
    error?: string;
    session?: any;
}
export interface ChatRequest {
    model: string;
    message: string;
    systemPrompt?: string;
    images?: string[];
    enableSearch?: boolean;
}
export interface ChatResponse {
    content: string;
    model: string;
    sources: string[];
}
export type DeepSearchActionInput = {
    action: 'submit';
    claim?: string;
    taskId?: string;
} | {
    action: 'status';
    claim?: string;
    taskId?: string;
} | {
    action: 'result';
    claim?: string;
    taskId?: string;
};
