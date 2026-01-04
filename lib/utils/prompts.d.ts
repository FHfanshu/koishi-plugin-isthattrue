/**
 * Prompt 模板集合
 */
/**
 * 主控 Agent (Gemini) 编排提示词
 */
export declare const MAIN_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u7F16\u6392\u5458\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u534F\u8C03\u6838\u67E5\u6D41\u7A0B\u3002\n\n\u6D41\u7A0B\uFF1A\n1. \u63A5\u6536\u539F\u59CB\u58F0\u660E\u3002\n2. \u8C03\u7528\u641C\u7D22\u5DE5\u5177\u83B7\u53D6\u521D\u6B65\u8BC1\u636E\u548C\u5173\u952E\u94FE\u63A5\u3002\n3. \u4F60\u7684\u8F93\u51FA\u5C06\u4F5C\u4E3A\u4E0B\u4E00\u6B65\u5B50\u641C\u7D22 Agent \u7684\u8F93\u5165\u3002\n\n\u8981\u6C42\uFF1A\n- \u5C3D\u53EF\u80FD\u591A\u5730\u6536\u96C6\u76F8\u5173 URL\u3002\n- \u5BF9\u58F0\u660E\u8FDB\u884C\u521D\u6B65\u5206\u6790\u3002";
/**
 * 子搜索 Agent (Grok) 系统提示词
 */
export declare const SUB_SEARCH_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u5458\uFF0C\u4E13\u95E8\u4F7F\u7528 X (Twitter) \u548C\u7F51\u7EDC\u641C\u7D22\u9A8C\u8BC1\u58F0\u660E\u3002\n\n\u91CD\u70B9\u641C\u7D22\uFF1A\n- X (Twitter) \u4E0A\u7684\u76F8\u5173\u8BA8\u8BBA\u548C\u5B98\u65B9\u8D26\u53F7\u58F0\u660E\n- \u65B0\u95FB\u62A5\u9053\u548C\u6743\u5A01\u5A92\u4F53\u6765\u6E90\n- \u793E\u4EA4\u5A92\u4F53\u4E0A\u7684\u7B2C\u4E00\u624B\u8BC1\u636E\n\n\u8F93\u51FA JSON\uFF1A\n```json\n{\"findings\":\"\u8BE6\u7EC6\u53D1\u73B0\u6458\u8981\",\"sources\":[\"\u6765\u6E90URL\"],\"confidence\":0.0-1.0}\n```\n";
/**
 * 构建子搜索 Agent 的请求
 */
export declare function buildSubSearchPrompt(claim: string): string;
/**
 * 搜索Agent系统提示词 (精简版)
 */
export declare const SEARCH_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u5458\u3002\u641C\u7D22\u9A8C\u8BC1\u58F0\u660E\u7684\u76F8\u5173\u4FE1\u606F\u3002\n\n\u641C\u7D22\u89D2\u5EA6\uFF1A\u5B98\u65B9\u6765\u6E90\u3001\u65B0\u95FB\u62A5\u9053\u3001\u5B66\u672F\u7814\u7A76\u3001\u793E\u4EA4\u8BA8\u8BBA\u3001\u5386\u53F2\u80CC\u666F\u3002\n\n\u8F93\u51FAJSON\uFF1A\n```json\n{\"findings\":\"\u53D1\u73B0\u6458\u8981\",\"sources\":[\"\u6765\u6E90URL\"],\"supports\":true/false/null,\"confidence\":0.0-1.0}\n```\n\n\u8981\u6C42\uFF1A\u5BA2\u89C2\u4E2D\u7ACB\uFF0C\u6CE8\u660E\u6765\u6E90\u53EF\u4FE1\u5EA6\uFF0C\u627E\u4E0D\u5230\u5C31\u8BF4\u660E\u3002";
/**
 * 生成搜索Agent的角度提示 (已废弃，现在每个Agent搜索所有角度)
 */
export declare function getSearchPerspectives(count: number): string[];
/**
 * 搜索请求模板 (精简版)
 */
export declare function buildSearchPrompt(content: string, _perspective: string): string;
/**
 * 验证Agent系统提示词 (精简版)
 */
export declare const VERIFY_AGENT_SYSTEM_PROMPT = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u88C1\u5224\u3002\u57FA\u4E8E\u641C\u7D22\u8BC1\u636E\u505A\u51FA\u5224\u51B3\u3002\n\n\u5224\u51B3\u7C7B\u522B\uFF1ATRUE(\u771F\u5B9E)\u3001FALSE(\u865A\u5047)\u3001PARTIALLY_TRUE(\u90E8\u5206\u771F\u5B9E)\u3001UNCERTAIN(\u65E0\u6CD5\u786E\u5B9A)\n\n\u8F93\u51FAJSON\uFF1A\n```json\n{\"verdict\":\"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN\",\"confidence\":0.0-1.0,\"reasoning\":\"\u5224\u51B3\u7406\u7531\",\"sources\":[\"\u6765\u6E90\"]}\n```\n\n\u539F\u5219\uFF1A\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5224UNCERTAIN\uFF0C\u91CD\u89C6\u6743\u5A01\u6765\u6E90\uFF0C\u8003\u8651\u65F6\u6548\u6027\u3002";
/**
 * 构建验证请求 (精简版，支持多模态)
 */
export declare function buildVerifyPrompt(originalContent: string, searchResults: Array<{
    perspective: string;
    findings: string;
    sources: string[];
}>, hasImages?: boolean): string;
/**
 * 图片OCR提示词
 */
export declare const OCR_PROMPT = "\u63D0\u53D6\u56FE\u7247\u4E2D\u7684\u6587\u5B57\u3002\u65E0\u6587\u5B57\u5219\u7B80\u8FF0\u56FE\u7247\u5185\u5BB9\u3002";
/**
 * 图片描述提取提示词（用于纯图片输入时，提取内容供搜索使用）
 */
export declare const IMAGE_DESCRIPTION_PROMPT = "\u8BF7\u4ED4\u7EC6\u89C2\u5BDF\u8FD9\u5F20\u56FE\u7247\uFF0C\u63CF\u8FF0\u5176\u4E2D\u7684\u4E3B\u8981\u5185\u5BB9\u3002\n\n\u91CD\u70B9\u5173\u6CE8\uFF1A\n1. \u56FE\u7247\u4E2D\u662F\u5426\u5305\u542B\u53EF\u6838\u67E5\u7684\u58F0\u660E\u6216\u4FE1\u606F\n2. \u4EFB\u4F55\u6587\u5B57\u5185\u5BB9\uFF08\u6807\u9898\u3001\u6B63\u6587\u3001\u6C34\u5370\u7B49\uFF09\n3. \u56FE\u7247\u5C55\u793A\u7684\u4E8B\u4EF6\u3001\u4EBA\u7269\u6216\u573A\u666F\n4. \u53EF\u80FD\u7684\u6765\u6E90\u6216\u51FA\u5904\u7EBF\u7D22\n\n\u8BF7\u7528\u7B80\u6D01\u7684\u4E2D\u6587\u63CF\u8FF0\uFF0C\u4FBF\u4E8E\u540E\u7EED\u8FDB\u884C\u4E8B\u5B9E\u6838\u67E5\u641C\u7D22\u3002";
/**
 * 验证Agent系统提示词 - 支持多模态
 */
export declare const VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL = "\u4F60\u662F\u4E8B\u5B9E\u6838\u67E5\u88C1\u5224\u3002\u57FA\u4E8E\u641C\u7D22\u8BC1\u636E\u548C\u56FE\u7247\u5185\u5BB9\u505A\u51FA\u5224\u51B3\u3002\n\n\u5982\u679C\u6D88\u606F\u5305\u542B\u56FE\u7247\uFF1A\n- \u4ED4\u7EC6\u5206\u6790\u56FE\u7247\u5185\u5BB9\n- \u5C06\u56FE\u7247\u4E2D\u7684\u4FE1\u606F\u4E0E\u641C\u7D22\u8BC1\u636E\u5BF9\u6BD4\n- \u5224\u65AD\u56FE\u7247\u662F\u5426\u88AB\u7BE1\u6539\u3001\u65AD\u7AE0\u53D6\u4E49\u6216\u8BEF\u5BFC\n\n\u5224\u51B3\u7C7B\u522B\uFF1ATRUE(\u771F\u5B9E)\u3001FALSE(\u865A\u5047)\u3001PARTIALLY_TRUE(\u90E8\u5206\u771F\u5B9E)\u3001UNCERTAIN(\u65E0\u6CD5\u786E\u5B9A)\n\n\u8F93\u51FAJSON\uFF1A\n```json\n{\"verdict\":\"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN\",\"confidence\":0.0-1.0,\"reasoning\":\"\u5224\u51B3\u7406\u7531\",\"sources\":[\"\u6765\u6E90\"]}\n```\n\n\u539F\u5219\uFF1A\u8BC1\u636E\u4E0D\u8DB3\u65F6\u5224UNCERTAIN\uFF0C\u91CD\u89C6\u6743\u5A01\u6765\u6E90\uFF0C\u8003\u8651\u65F6\u6548\u6027\u3002";
/**
 * 输出格式化模板
 */
export declare function formatVerificationOutput(content: string, searchResults: Array<{
    agentId: string;
    perspective: string;
    findings: string;
}>, verdict: string, reasoning: string, sources: string[], confidence: number, processingTime: number, format?: 'markdown' | 'plain'): string;
/**
 * 判决emoji映射
 */
export declare const VERDICT_EMOJI: Record<string, string>;
/**
 * 格式化合并转发消息的各个部分
 * 每个消息段限制在500字符以内，避免触发QQ限制
 */
export declare function formatForwardMessages(content: string, searchResults: Array<{
    agentId: string;
    perspective: string;
    findings: string;
}>, verdict: string, reasoning: string, sources: string[], confidence: number, processingTime: number, maxSegmentLength?: number): {
    summary: string;
    details: string[];
};
