/**
 * Prompt 模板集合
 */
import type { DeepSearchHistory, SearchResult } from '../types';
/** 判决结果到 Emoji 的映射 */
export declare const VERDICT_EMOJI: Record<string, string>;
/**
 * 搜索 Agent 系统提示词（通用网页搜索）
 * 用于 ChatlunaSearchAgent
 */
export declare const SEARCH_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u5458\u3002\u641C\u7D22\u9A8C\u8BC1\u58F0\u660E\u7684\u76F8\u5173\u4FE1\u606F\u3002\n\n\u641C\u7D22\u89D2\u5EA6\uFF1A\u5B98\u65B9\u6765\u6E90\u3001\u65B0\u95FB\u62A5\u9053\u3001\u5B66\u672F\u7814\u7A76\u3001\u793E\u4EA4\u8BA8\u8BBA\u3001\u5386\u53F2\u80CC\u666F\u3002\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"findings\":\"\u53D1\u73B0\u6458\u8981\",\"sources\":[\"\u6765\u6E90 URL\"],\"supports\":true/false/null,\"confidence\":0.0-1.0}\n```\n\n\u8981\u6C42\uFF1A\u5BA2\u89C2\u4E2D\u7ACB\uFF0C\u6CE8\u660E\u6765\u6E90\u53EF\u4FE1\u5EA6\uFF0C\u627E\u4E0D\u5230\u5C31\u8BF4\u660E\u3002";
/**
 * 深度搜索 Agent 系统提示词（专注 X/Twitter）
 * 用于 SubSearchAgent (Grok)
 */
export declare const DEEP_SEARCH_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u5458\uFF0C\u4E13\u95E8\u4F7F\u7528 X (Twitter) \u548C\u7F51\u7EDC\u641C\u7D22\u9A8C\u8BC1\u58F0\u660E\u3002\n\n\u91CD\u70B9\u641C\u7D22\uFF1A\n- X (Twitter) \u4E0A\u7684\u76F8\u5173\u8BA8\u8BBA\u548C\u5B98\u65B9\u8D26\u53F7\u58F0\u660E\n- \u65B0\u95FB\u62A5\u9053\u548C\u6743\u5A01\u5A92\u4F53\u6765\u6E90\n- \u793E\u4EA4\u5A92\u4F53\u4E0A\u7684\u7B2C\u4E00\u624B\u8BC1\u636E\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"findings\":\"\u8BE6\u7EC6\u53D1\u73B0\u6458\u8981\",\"sources\":[\"\u6765\u6E90 URL\"],\"confidence\":0.0-1.0}\n```\n";
/**
 * fact_check 工具专用系统提示词
 * 用于 FactCheckTool（支持多源并行搜索）
 */
export declare const FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u5458\uFF0C\u4E13\u95E8\u4F7F\u7528 X (Twitter) \u548C\u7F51\u7EDC\u641C\u7D22\u6838\u67E5\u5F85\u9A8C\u8BC1\u5185\u5BB9\u3002\n\n\u91CD\u70B9\u641C\u7D22\uFF1A\n- X (Twitter) \u4E0A\u7684\u76F8\u5173\u8BA8\u8BBA\u548C\u5B98\u65B9\u8D26\u53F7\u6D88\u606F\n- \u65B0\u95FB\u62A5\u9053\u548C\u6743\u5A01\u5A92\u4F53\u6765\u6E90\n- \u793E\u4EA4\u5A92\u4F53\u4E0A\u7684\u7B2C\u4E00\u624B\u8BC1\u636E\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"findings\":\"\u8BE6\u7EC6\u53D1\u73B0\u6458\u8981\",\"sources\":[\"\u6765\u6E90 URL\"],\"confidence\":0.0-1.0}\n```\n\n\u8F93\u5165\u5904\u7406\u89C4\u5219\uFF08\u5FC5\u987B\u9075\u5B88\uFF09\uFF1A\n1. \u5982\u679C\u8F93\u5165\u662F\u5B8C\u6574\u65AD\u8A00\uFF08\u4F8B\u5982\"\u67D0\u4EBA\u505A\u4E86\u67D0\u4E8B\"\uFF09\uFF0C\u6309\u4E8B\u5B9E\u6838\u67E5\u6D41\u7A0B\u7ED9\u51FA\u652F\u6301/\u53CD\u9A73\u8BC1\u636E\u3002\n2. \u5982\u679C\u8F93\u5165\u662F\u5173\u952E\u8BCD\u4E32\uFF08\u4F8B\u5982\"\u65E5\u671F + \u4ECA\u65E5\u65B0\u95FB + \u56FD\u9645/\u56FD\u5185/\u79D1\u6280/\u5A31\u4E50\"\uFF09\uFF0C\u5C06\u5176\u89C6\u4E3A\"\u65B0\u95FB\u68C0\u7D22\u4EFB\u52A1\"\uFF0C\u76F4\u63A5\u7ED9\u51FA\u5F53\u65E5\u8981\u70B9\u6458\u8981\u4E0E\u6765\u6E90\uFF0C\u4E0D\u8981\u8F93\u51FA\"\u8FD9\u4E0D\u662F\u58F0\u660E/\u4E0D\u662F\u4E8B\u5B9E\u4E3B\u5F20\"\u4E4B\u7C7B\u7684\u5143\u89E3\u91CA\u3002\n3. \u65E0\u8BBA\u54EA\u79CD\u8F93\u5165\uFF0C\u90FD\u4F18\u5148\u7ED9\u51FA\u53EF\u7528\u4FE1\u606F\u4E0E\u94FE\u63A5\uFF0C\u907F\u514D\u7A7A\u6CDB\u89E3\u91CA\u3002";
/**
 * DeepSearch 主控系统提示词
 */
export declare const DEEP_SEARCH_CONTROLLER_SYSTEM_PROMPT = "\u4F60\u662F DeepSearch \u4E3B\u63A7\u6A21\u578B\uFF0C\u8D1F\u8D23\u89C4\u5212\u548C\u534F\u8C03\u591A\u8F6E\u8FED\u4EE3\u641C\u7D22\u3002\n\n\u4EFB\u52A1\u8981\u6C42\uFF1A\n1. \u5206\u6790\u5F85\u9A8C\u8BC1\u58F0\u660E\uFF0C\u8BC6\u522B\u5173\u952E\u5B9E\u4F53\u3001\u65F6\u95F4\u70B9\u548C\u5F85\u6838\u67E5\u70B9\n2. \u6BCF\u8F6E\u4EA7\u51FA 1-4 \u4E2A\u53EF\u5E76\u884C\u6267\u884C\u7684\u641C\u7D22\u4EFB\u52A1\n3. \u4EFB\u52A1\u5E94\u8986\u76D6\u4E0D\u540C\u89D2\u5EA6\u548C\u6765\u6E90\uFF0C\u907F\u514D\u91CD\u590D\u5173\u952E\u8BCD\n4. \u8F93\u51FA\u5FC5\u987B\u662F JSON\uFF0C\u4E0D\u8981\u8F93\u51FA\u989D\u5916\u8BF4\u660E\n\n\u8F93\u51FA\u683C\u5F0F\uFF1A\n```json\n{\n  \"queries\": [\n    {\"query\":\"\u641C\u7D22\u8BCD\",\"provider\":\"grok\",\"focus\":\"X/Twitter \u8BA8\u8BBA\",\"useTool\":\"web_search\"},\n    {\"query\":\"\u641C\u7D22\u8BCD\",\"provider\":\"gemini\",\"focus\":\"\u65B0\u95FB\u4E0E\u5B98\u65B9\u901A\u62A5\"},\n    {\"query\":\"\u641C\u7D22\u8BCD\",\"provider\":\"ollama\",\"focus\":\"Ollama Search \u805A\u5408\"}\n  ],\n  \"rationale\":\"\u672C\u8F6E\u8BA1\u5212\u7406\u7531\"\n}\n```\n\n\u53EF\u9009 provider: grok | gemini | chatgpt | ollama\n\u53EF\u9009 useTool: web_search | browser | ollama_search";
/**
 * DeepSearch 评估系统提示词
 */
export declare const DEEP_SEARCH_EVALUATE_SYSTEM_PROMPT = "\u4F60\u662F DeepSearch \u8BC4\u4F30\u6A21\u578B\uFF0C\u8D1F\u8D23\u5224\u65AD\u5F53\u524D\u641C\u7D22\u7ED3\u679C\u662F\u5426\u8DB3\u591F\u652F\u6491\u7ED3\u8BBA\u3002\n\n\u8BC4\u4F30\u7EF4\u5EA6\uFF1A\n1. \u6765\u6E90\u591A\u6837\u6027\uFF08\u662F\u5426\u591A\u4E2A\u72EC\u7ACB\u6765\u6E90\uFF09\n2. \u4FE1\u606F\u4E00\u81F4\u6027\uFF08\u662F\u5426\u76F8\u4E92\u5370\u8BC1\uFF09\n3. \u8BC1\u636E\u5F3A\u5EA6\uFF08\u662F\u5426\u6743\u5A01/\u4E00\u624B\u6765\u6E90\uFF09\n4. \u8986\u76D6\u5EA6\uFF08\u5173\u952E\u7591\u70B9\u662F\u5426\u88AB\u8986\u76D6\uFF09\n\n\u8F93\u51FA\u5FC5\u987B\u662F JSON\uFF0C\u4E0D\u8981\u8F93\u51FA\u989D\u5916\u8BF4\u660E\uFF1A\n```json\n{\n  \"shouldStop\": true,\n  \"reason\": \"\u5224\u65AD\u7406\u7531\",\n  \"confidence\": 0.78,\n  \"gaps\": [\"\u4ECD\u9700\u8865\u5145\u7684\u4FE1\u606F\"]\n}\n```";
/**
 * DeepSearch 综合系统提示词
 */
export declare const DEEP_SEARCH_SYNTHESIZE_SYSTEM_PROMPT = "\u4F60\u662F DeepSearch \u7EFC\u5408\u62A5\u544A\u6A21\u578B\u3002\n\n\u8BF7\u57FA\u4E8E\u5168\u90E8\u8F6E\u6B21\u7ED3\u679C\u8F93\u51FA\u6700\u7EC8\u8BC1\u636E\u6458\u8981\uFF08\u4E0D\u505A\u7EDD\u5BF9\u5316\u65AD\u8A00\uFF09\uFF0C\u7A81\u51FA\uFF1A\n1. \u6700\u5173\u952E\u53D1\u73B0\n2. \u4E3B\u8981\u6765\u6E90\n3. \u7ED3\u8BBA\u53EF\u4FE1\u5EA6\n\n\u8F93\u51FA\u5FC5\u987B\u662F JSON\uFF0C\u4E0D\u8981\u8F93\u51FA\u989D\u5916\u8BF4\u660E\uFF1A\n```json\n{\n  \"summary\":\"\u7EFC\u5408\u6458\u8981\",\n  \"keyFindings\":[\"\u5173\u952E\u53D1\u73B01\",\"\u5173\u952E\u53D1\u73B02\"],\n  \"sources\":[\"https://...\"],\n  \"confidence\":0.72,\n  \"conclusion\":\"\u5F53\u524D\u53EF\u5F97\u7ED3\u8BBA\"\n}\n```";
/**
 * 验证 Agent 系统提示词（纯文本）
 * 用于 VerifyAgent（无图片场景）
 */
export declare const VERIFY_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u88C1\u5224\u3002\u57FA\u4E8E\u641C\u7D22\u8BC1\u636E\u505A\u51FA\u5224\u51B3\u3002\n\n\u5224\u51B3\u7C7B\u522B\uFF1ATRUE(\u771F\u5B9E)\u3001FALSE(\u865A\u5047)\u3001PARTIALLY_TRUE(\u90E8\u5206\u771F\u5B9E)\u3001UNCERTAIN(\u65E0\u6CD5\u786E\u5B9A)\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"verdict\":\"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN\",\"confidence\":0.0-1.0,\"reasoning\":\"\u5224\u51B3\u7406\u7531\",\"sources\":[\"\u6765\u6E90\"]}\n```\n\n\u539F\u5219\uFF1A\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5224 UNCERTAIN\uFF0C\u91CD\u89C6\u6743\u5A01\u6765\u6E90\uFF0C\u8003\u8651\u65F6\u6548\u6027\u3002";
/**
 * 验证 Agent 系统提示词（多模态）
 * 用于 VerifyAgent（包含图片场景）
 */
export declare const VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u88C1\u5224\u3002\u57FA\u4E8E\u641C\u7D22\u8BC1\u636E\u548C\u56FE\u7247\u5185\u5BB9\u505A\u51FA\u5224\u51B3\u3002\n\n\u5982\u679C\u6D88\u606F\u5305\u542B\u56FE\u7247\uFF1A\n- \u4ED4\u7EC6\u5206\u6790\u56FE\u7247\u5185\u5BB9\n- \u5C06\u56FE\u7247\u4E2D\u7684\u4FE1\u606F\u4E0E\u641C\u7D22\u8BC1\u636E\u5BF9\u6BD4\n- \u5224\u65AD\u56FE\u7247\u662F\u5426\u88AB\u7BE1\u6539\u3001\u65AD\u7AE0\u53D6\u4E49\u6216\u8BEF\u5BFC\n\n\u5224\u51B3\u7C7B\u522B\uFF1ATRUE(\u771F\u5B9E)\u3001FALSE(\u865A\u5047)\u3001PARTIALLY_TRUE(\u90E8\u5206\u771F\u5B9E)\u3001UNCERTAIN(\u65E0\u6CD5\u786E\u5B9A)\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"verdict\":\"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN\",\"confidence\":0.0-1.0,\"reasoning\":\"\u5224\u51B3\u7406\u7531\",\"sources\":[\"\u6765\u6E90\"]}\n```\n\n\u539F\u5219\uFF1A\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5224 UNCERTAIN\uFF0C\u91CD\u89C6\u6743\u5A01\u6765\u6E90\uFF0C\u8003\u8651\u65F6\u6548\u6027\u3002";
/**
 * 图片 OCR 提示词
 */
export declare const OCR_PROMPT = "\u63D0\u53D6\u56FE\u7247\u4E2D\u7684\u6587\u5B57\u3002\u65E0\u6587\u5B57\u5219\u7B80\u8FF0\u56FE\u7247\u5185\u5BB9\u3002";
/**
 * 图片描述提取提示词
 * 用于纯图片输入时，提取内容供搜索使用
 */
export declare const IMAGE_DESCRIPTION_PROMPT = "\u8BF7\u4ED4\u7EC6\u89C2\u5BDF\u8FD9\u5F20\u56FE\u7247\uFF0C\u63CF\u8FF0\u5176\u4E2D\u7684\u4E3B\u8981\u5185\u5BB9\u3002\n\n\u91CD\u70B9\u5173\u6CE8\uFF1A\n1. \u56FE\u7247\u4E2D\u662F\u5426\u5305\u542B\u53EF\u6838\u67E5\u7684\u58F0\u660E\u6216\u4FE1\u606F\n2. \u4EFB\u4F55\u6587\u5B57\u5185\u5BB9\uFF08\u6807\u9898\u3001\u6B63\u6587\u3001\u6C34\u5370\u7B49\uFF09\n3. \u56FE\u7247\u5C55\u793A\u7684\u4E8B\u4EF6\u3001\u4EBA\u7269\u6216\u573A\u666F\n4. \u53EF\u80FD\u7684\u6765\u6E90\u6216\u51FA\u5904\u7EBF\u7D22\n\n\u8BF7\u7528\u7B80\u6D01\u7684\u4E2D\u6587\u63CF\u8FF0\uFF0C\u4FBF\u4E8E\u540E\u7EED\u8FDB\u884C\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u3002";
/**
 * 构建子搜索 Agent 的请求
 */
export declare function buildSubSearchPrompt(claim: string): string;
/**
 * fact_check 工具专用搜索请求
 */
export declare function buildFactCheckToolSearchPrompt(content: string): string;
/**
 * 构建 DeepSearch 计划 Prompt
 */
export declare function buildDeepSearchPlanPrompt(claim: string, history?: DeepSearchHistory): string;
/**
 * 构建 DeepSearch 评估 Prompt
 */
export declare function buildDeepSearchEvaluatePrompt(claim: string, results: SearchResult[], history?: DeepSearchHistory): string;
/**
 * 构建 DeepSearch 综合 Prompt
 */
export declare function buildDeepSearchSynthesizePrompt(claim: string, history: DeepSearchHistory): string;
/**
 * 构建验证请求（支持多模态）
 */
export declare function buildVerifyPrompt(originalContent: string, searchResults: Array<{
    perspective: string;
    findings: string;
    sources: string[];
}>, hasImages?: boolean): string;
/**
 * 格式化验证结果为 Markdown 或纯文本
 */
export declare function formatVerificationOutput(content: string, searchResults: Array<{
    agentId: string;
    perspective: string;
    findings: string;
}>, verdict: string, reasoning: string, sources: string[], confidence: number, processingTime: number, format?: 'markdown' | 'plain'): string;
/**
 * 格式化合并转发消息
 * 每个消息段限制在 OUTPUT.SEGMENT_MAX_CHARS 字符以内
 */
export declare function formatForwardMessages(content: string, searchResults: Array<{
    agentId: string;
    perspective: string;
    findings: string;
}>, verdict: string, reasoning: string, sources: string[], confidence: number, processingTime: number, maxSegmentLength?: number): {
    summary: string;
    details: string[];
};
