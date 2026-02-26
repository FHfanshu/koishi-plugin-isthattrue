var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(src_exports);
var import_koishi3 = require("koishi");
var import_node_path = __toESM(require("node:path"));

// src/services/chatluna.ts
var import_messages = require("@langchain/core/messages");
var PROXY_VARS = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"];
var ChatlunaAdapter = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "ChatlunaAdapter");
  }
  logger;
  bypassProxyWarned = false;
  /**
   * 检查 Chatluna 服务是否可用
   */
  isAvailable() {
    return !!this.ctx.chatluna;
  }
  /**
   * 发送聊天请求
   */
  async chat(request) {
    if (!this.isAvailable()) {
      throw new Error("Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna");
    }
    const startTime = Date.now();
    const activeProxies = PROXY_VARS.filter((v) => process.env[v]).map((v) => `${v}=${process.env[v]}`);
    if (this.config?.bypassProxy) {
      if (!this.bypassProxyWarned) {
        this.logger.warn("bypassProxy 已启用，但为避免并发污染不会修改全局代理环境变量；请在 chatluna/系统层配置无代理模型端点。");
        this.bypassProxyWarned = true;
      }
    } else if (activeProxies.length > 0) {
      this.logger.debug(`当前环境代理：${activeProxies.join(", ")}`);
    } else {
      this.logger.debug("当前环境未检测到系统代理环境变量");
    }
    const modelRef = await this.ctx.chatluna.createChatModel(request.model);
    const model = modelRef.value;
    if (!model) {
      throw new Error(`无法创建模型：${request.model}，请确保模型已正确配置`);
    }
    const messages = [];
    if (request.systemPrompt) {
      messages.push(new import_messages.SystemMessage(request.systemPrompt));
    }
    const messageContent = request.message;
    if (request.images && request.images.length > 0) {
      const multimodalContent = [
        { type: "text", text: request.message }
      ];
      for (const base64Image of request.images) {
        multimodalContent.push({
          type: "image_url",
          image_url: `data:image/jpeg;base64,${base64Image}`
        });
      }
      messages.push(new import_messages.HumanMessage({ content: multimodalContent }));
      this.logger.debug(`构建多模态消息，包含 ${request.images.length} 张图片`);
    } else {
      messages.push(new import_messages.HumanMessage(messageContent));
    }
    if (this.config?.logLLMDetails) {
      this.logger.info(`[LLM Request] Model: ${request.model}
System: ${request.systemPrompt || "None"}
Message: ${typeof messageContent === "string" ? messageContent.substring(0, 500) : "Complex content"}`);
    }
    const invokeOptions = {
      temperature: 0.3
      // 低温度以减少幻觉
    };
    if (request.enableSearch) {
      invokeOptions.enableSearch = true;
    }
    const response = await model.invoke(messages, invokeOptions);
    const processingTime = Date.now() - startTime;
    this.logger.debug(`Chatluna 请求完成，耗时 ${processingTime}ms`);
    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    if (this.config?.logLLMDetails) {
      this.logger.info(`[LLM Response] Model: ${request.model}
Content: ${content}`);
    }
    return {
      content,
      model: request.model,
      sources: this.extractSources(content)
    };
  }
  /**
   * 带重试的聊天请求
   */
  async chatWithRetry(request, maxRetries = 2, fallbackModel) {
    let lastError = null;
    let currentModel = request.model;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.chat({
          ...request,
          model: currentModel
        });
      } catch (error) {
        lastError = error;
        this.logger.warn(`请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error);
        if (attempt === maxRetries - 1 && fallbackModel && fallbackModel !== currentModel) {
          this.logger.info(`切换到备用模型：${fallbackModel}`);
          currentModel = fallbackModel;
        }
        if (attempt < maxRetries) {
          await this.sleep(1e3 * (attempt + 1));
        }
      }
    }
    throw lastError || new Error("请求失败，已达最大重试次数");
  }
  /**
   * 从响应中提取来源链接
   */
  extractSources(content) {
    const sources = [];
    const urlRegex = /https?:\/\/[^\s\])"']+/g;
    const matches = content.match(urlRegex);
    if (matches) {
      sources.push(...matches);
    }
    const sourceRegex = /\[来源 [：:]\s*([^\]]+)\]/g;
    let match;
    while ((match = sourceRegex.exec(content)) !== null) {
      sources.push(match[1]);
    }
    return [...new Set(sources)];
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/utils/url.ts
function injectCensorshipBypass(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    if (url.length > 20) {
      const mid = Math.floor(url.length / 2);
      return url.slice(0, mid) + "、" + url.slice(mid);
    }
    return url + "、";
  });
}
__name(injectCensorshipBypass, "injectCensorshipBypass");
function removeCensorshipBypass(text) {
  return text.replace(/、/g, "");
}
__name(removeCensorshipBypass, "removeCensorshipBypass");

// src/utils/prompts.ts
var SUB_SEARCH_AGENT_SYSTEM_PROMPT = `你是事实核查搜索员，专门使用 X (Twitter) 和网络搜索验证声明。

重点搜索：
- X (Twitter) 上的相关讨论和官方账号声明
- 新闻报道和权威媒体来源
- 社交媒体上的第一手证据

输出 JSON：
\`\`\`json
{"findings":"详细发现摘要","sources":["来源URL"],"confidence":0.0-1.0}
\`\`\`
`;
var FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT = `你是事实核查搜索员，专门使用 X (Twitter) 和网络搜索核查待验证内容。

重点搜索：
- X (Twitter) 上的相关讨论和官方账号消息
- 新闻报道和权威媒体来源
- 社交媒体上的第一手证据

输出 JSON：
\`\`\`json
{"findings":"详细发现摘要","sources":["来源URL"],"confidence":0.0-1.0}
\`\`\`
`;
function buildSubSearchPrompt(claim) {
  return `请验证以下声明的真实性，重点搜索 X (Twitter) 和社交媒体上的相关讨论和证据：

"${claim}"

搜索要点：
1. 在 X/Twitter 上搜索相关话题和讨论
2. 查找官方账号的声明或澄清
3. 搜索相关新闻报道
4. 注意时间线和来源可信度`;
}
__name(buildSubSearchPrompt, "buildSubSearchPrompt");
function buildFactCheckToolSearchPrompt(content) {
  return `请核查以下内容的真实性，重点搜索 X (Twitter) 和社交媒体上的相关讨论和证据：

"${content}"

搜索要点：
1. 在 X/Twitter 上搜索相关话题和讨论
2. 查找官方账号消息或澄清
3. 搜索相关新闻报道
4. 注意时间线和来源可信度`;
}
__name(buildFactCheckToolSearchPrompt, "buildFactCheckToolSearchPrompt");
var VERIFY_AGENT_SYSTEM_PROMPT = `你是事实核查裁判。基于搜索证据做出判决。

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判UNCERTAIN，重视权威来源，考虑时效性。`;
function buildVerifyPrompt(originalContent, searchResults, hasImages) {
  const resultsText = searchResults.map((r, i) => `[${i + 1}] ${r.findings}
来源: ${r.sources.slice(0, 3).join(", ") || "无"}`).join("\n\n");
  let prompt = `声明："${originalContent}"

搜索结果：
${resultsText}

`;
  if (hasImages) {
    prompt += `请结合图片内容和搜索结果进行判决。注意核实图片中的信息是否与搜索结果一致。

`;
  }
  prompt += `请判决。`;
  return prompt;
}
__name(buildVerifyPrompt, "buildVerifyPrompt");
var IMAGE_DESCRIPTION_PROMPT = `请仔细观察这张图片，描述其中的主要内容。

重点关注：
1. 图片中是否包含可核查的声明或信息
2. 任何文字内容（标题、正文、水印等）
3. 图片展示的事件、人物或场景
4. 可能的来源或出处线索

请用简洁的中文描述，便于后续进行事实核查搜索。`;
var VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL = `你是事实核查裁判。基于搜索证据和图片内容做出判决。

如果消息包含图片：
- 仔细分析图片内容
- 将图片中的信息与搜索证据对比
- 判断图片是否被篡改、断章取义或误导

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判UNCERTAIN，重视权威来源，考虑时效性。`;
function formatVerificationOutput(content, searchResults, verdict, reasoning, sources, confidence, processingTime, format = "markdown") {
  const verdictEmoji = {
    true: "✅ 真实",
    false: "❌ 虚假",
    partially_true: "⚠️ 部分真实",
    uncertain: "❓ 无法确定"
  };
  const confidenceValue = Math.round(confidence * 100);
  const confidenceBar = "█".repeat(Math.round(confidence * 10)) + "░".repeat(10 - Math.round(confidence * 10));
  if (format === "plain") {
    let output2 = `🔍 事实核查结果

`;
    output2 += `📋 待验证内容:
${content.substring(0, 200)}${content.length > 200 ? "..." : ""}

`;
    output2 += `🤖 搜索发现:
`;
    output2 += searchResults.map((r) => `• ${r.perspective}: ${r.findings.substring(0, 100)}...`).join("\n");
    output2 += `

⚖️ 最终判决: ${verdictEmoji[verdict] || verdict}
`;
    output2 += `📊 可信度: ${confidenceValue}%

`;
    output2 += `📝 判决依据:
${reasoning}
`;
    if (sources.length > 0) {
      output2 += `
源：
`;
      output2 += sources.map((s) => `• ${removeCensorshipBypass(s)}`).join("\n");
      output2 += `
`;
    }
    output2 += `
⏱️ 处理耗时: ${(processingTime / 1e3).toFixed(1)}秒`;
    return output2;
  }
  let output = `🔍 **事实核查结果**

📋 **待验证内容:**
> ${content.substring(0, 200)}${content.length > 200 ? "..." : ""}

---

🤖 **搜索Agent结果:**
${searchResults.map((r) => `• **${r.perspective}**: ${r.findings.substring(0, 100)}...`).join("\n")}

---

⚖️ **最终判决: ${verdictEmoji[verdict] || verdict}**

📊 **可信度:** ${confidenceBar} ${confidenceValue}%

📝 **判决依据:**
${reasoning}
`;
  if (sources.length > 0) {
    output += `
🔗 **参考来源:**
${sources.map((s) => `• ${removeCensorshipBypass(s)}`).join("\n")}
`;
  }
  output += `
⏱️ *处理耗时: ${(processingTime / 1e3).toFixed(1)}秒*`;
  return output;
}
__name(formatVerificationOutput, "formatVerificationOutput");
var VERDICT_EMOJI = {
  true: "✅ 真实",
  false: "❌ 虚假",
  partially_true: "⚠️ 部分真实",
  uncertain: "❓ 无法确定"
};
function formatForwardMessages(content, searchResults, verdict, reasoning, sources, confidence, processingTime, maxSegmentLength = 500) {
  const MAX_SOURCES = 5;
  const confidenceValue = Math.round(confidence * 100);
  const summary = `${VERDICT_EMOJI[verdict] || verdict} (${confidenceValue}%)

📋 ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}

⏱️ ${(processingTime / 1e3).toFixed(1)}秒`;
  const details = [];
  const truncatedReasoning = reasoning.length > maxSegmentLength ? reasoning.substring(0, maxSegmentLength) + "..." : reasoning;
  details.push(`📝 判决依据

${truncatedReasoning}`);
  for (const r of searchResults) {
    let cleanFindings = r.findings;
    if (r.agentId === "chatluna-search") {
      const summaryEndIndex = r.findings.indexOf("================================");
      if (summaryEndIndex !== -1) {
        cleanFindings = r.findings.substring(0, summaryEndIndex + 32) + "\n\n(搜索详情已在合并消息中省略，请查看判决依据)";
      }
    }
    const truncatedFindings = cleanFindings.length > maxSegmentLength ? cleanFindings.substring(0, maxSegmentLength) + "..." : cleanFindings;
    details.push(`🔍 ${r.perspective}

${truncatedFindings}`);
  }
  if (sources.length > 0) {
    const limitedSources = sources.slice(0, MAX_SOURCES);
    const sourcesText = limitedSources.map((s) => `• ${removeCensorshipBypass(s).substring(0, 100)}`).join("\n");
    const suffix = sources.length > MAX_SOURCES ? `
... 及其他 ${sources.length - MAX_SOURCES} 个来源` : "";
    details.push(`🔗 参考来源

${sourcesText}${suffix}`);
  }
  return { summary, details };
}
__name(formatForwardMessages, "formatForwardMessages");

// src/agents/verifyAgent.ts
var VerifyAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.chatluna = new ChatlunaAdapter(ctx, config);
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "VerifyAgent");
  }
  chatluna;
  logger;
  clampConfidence(value, fallback = 0.5) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    if (numeric < 0) return 0;
    if (numeric > 1) return 1;
    return numeric;
  }
  /**
   * 执行验证判决
   * @param originalContent 原始消息内容
   * @param searchResults 搜索结果
   * @param images 可选的图片 base64 列表（多模态验证）
   */
  async verify(originalContent, searchResults, images) {
    const startTime = Date.now();
    const hasImages = images && images.length > 0;
    this.logger.info(`开始综合验证...${hasImages ? " (包含图片)" : ""}`);
    try {
      let finalSearchResults = this.compactSearchResults(searchResults);
      let prompt = buildVerifyPrompt(
        originalContent.text,
        finalSearchResults.map((r) => ({
          perspective: r.perspective,
          findings: r.findings,
          sources: r.sources
        })),
        hasImages
        // 传递是否有图片
      );
      const systemPrompt = hasImages ? VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL : VERIFY_AGENT_SYSTEM_PROMPT;
      let response;
      let usedSearchResults = finalSearchResults;
      try {
        response = await this.chatluna.chatWithRetry(
          {
            model: this.config.tof.model,
            message: prompt,
            systemPrompt,
            images
            // 传递图片
          },
          this.config.tof.maxRetries
        );
      } catch (error) {
        this.logger.warn("验证请求失败，尝试使用更短的搜索结果重试...");
        const compactedResults = this.compactSearchResults(searchResults, true);
        prompt = buildVerifyPrompt(
          originalContent.text,
          compactedResults.map((r) => ({
            perspective: r.perspective,
            findings: r.findings,
            sources: r.sources
          })),
          hasImages
        );
        response = await this.chatluna.chatWithRetry(
          {
            model: this.config.tof.model,
            message: prompt,
            systemPrompt,
            images
          },
          0
          // 不再重试
        );
        usedSearchResults = compactedResults;
      }
      const parsed = this.parseVerifyResponse(response.content);
      const processingTime = Date.now() - startTime;
      const result = {
        originalContent,
        searchResults: usedSearchResults,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        sources: this.aggregateSources(usedSearchResults, parsed.sources),
        confidence: parsed.confidence,
        processingTime
      };
      this.logger.info(`验证完成，判决: ${result.verdict}，可信度: ${result.confidence}`);
      return result;
    } catch (error) {
      this.logger.error("验证失败:", error);
      return {
        originalContent,
        searchResults,
        verdict: "uncertain" /* UNCERTAIN */,
        reasoning: `验证过程发生错误: ${error.message}`,
        sources: this.aggregateSources(searchResults, []),
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    }
  }
  compactSearchResults(searchResults, aggressive = false) {
    const maxFindingsChars = aggressive ? 400 : 800;
    return searchResults.map((result) => {
      let findings = result.findings || "";
      if (result.agentId === "chatluna-search") {
        const summaryEndIndex = findings.indexOf("==============================");
        if (summaryEndIndex !== -1) {
          findings = findings.substring(0, summaryEndIndex + 32) + "\n\n(搜索详情已省略)";
        }
      }
      if (findings.length > maxFindingsChars) {
        findings = findings.substring(0, maxFindingsChars) + "...";
      }
      return { ...result, findings };
    });
  }
  /**
   * 解析验证响应
   */
  parseVerifyResponse(content) {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      let parsed;
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        parsed = JSON.parse(content);
      }
      return {
        verdict: this.normalizeVerdict(parsed.verdict),
        reasoning: parsed.reasoning || parsed.key_evidence || "无详细说明",
        sources: parsed.sources || [],
        confidence: this.clampConfidence(parsed.confidence, 0.5)
      };
    } catch {
      return {
        verdict: this.extractVerdictFromText(content),
        reasoning: content,
        sources: [],
        confidence: this.clampConfidence(0.3, 0.3)
      };
    }
  }
  /**
   * 标准化判决结果
   */
  normalizeVerdict(verdict) {
    const normalized = verdict?.toLowerCase()?.trim();
    const mapping = {
      "true": "true" /* TRUE */,
      "真实": "true" /* TRUE */,
      "正确": "true" /* TRUE */,
      "false": "false" /* FALSE */,
      "虚假": "false" /* FALSE */,
      "错误": "false" /* FALSE */,
      "partially_true": "partially_true" /* PARTIALLY_TRUE */,
      "partial": "partially_true" /* PARTIALLY_TRUE */,
      "部分真实": "partially_true" /* PARTIALLY_TRUE */,
      "uncertain": "uncertain" /* UNCERTAIN */,
      "不确定": "uncertain" /* UNCERTAIN */,
      "无法确定": "uncertain" /* UNCERTAIN */
    };
    return mapping[normalized] || "uncertain" /* UNCERTAIN */;
  }
  /**
   * 从文本中提取判决
   */
  extractVerdictFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes("虚假") || lower.includes("false") || lower.includes("错误")) {
      return "false" /* FALSE */;
    }
    if (lower.includes("部分真实") || lower.includes("partially")) {
      return "partially_true" /* PARTIALLY_TRUE */;
    }
    if (lower.includes("真实") || lower.includes("true") || lower.includes("正确")) {
      return "true" /* TRUE */;
    }
    return "uncertain" /* UNCERTAIN */;
  }
  /**
   * 汇总所有来源
   */
  aggregateSources(searchResults, verifySources) {
    const allSources = /* @__PURE__ */ new Set();
    for (const result of searchResults) {
      for (const source of result.sources) {
        allSources.add(source);
      }
    }
    for (const source of verifySources) {
      allSources.add(source);
    }
    return [...allSources];
  }
};

// src/agents/subSearchAgent.ts
var SubSearchAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.chatluna = new ChatlunaAdapter(ctx, config);
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "SubSearchAgent");
  }
  chatluna;
  logger;
  /**
   * 执行深度搜索
   * @param claim 原始声明文本
   */
  async deepSearch(claim) {
    return this.deepSearchWithModel(
      claim,
      this.config.tof.searchModel,
      "grok-deep-search",
      "Grok 深度搜索 (X/Twitter)"
    );
  }
  async deepSearchWithModel(claim, modelName, agentId = "multi-search", perspective = "多源深度搜索", promptOverride, systemPromptOverride) {
    this.logger.info(`[SubSearchAgent] 开始深度搜索，模型: ${modelName}`);
    try {
      const response = await this.chatluna.chatWithRetry(
        {
          model: modelName,
          message: promptOverride || buildSubSearchPrompt(claim),
          systemPrompt: systemPromptOverride || SUB_SEARCH_AGENT_SYSTEM_PROMPT,
          enableSearch: true
        },
        this.config.tof.maxRetries
      );
      const parsed = this.parseResponse(response.content);
      return {
        agentId,
        perspective,
        findings: parsed.findings || response.content,
        sources: parsed.sources || response.sources || [],
        confidence: parsed.confidence || 0.8
      };
    } catch (error) {
      this.logger.error("[SubSearchAgent] 搜索失败:", error);
      return {
        agentId,
        perspective,
        findings: `深度搜索失败: ${error.message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: error.message
      };
    }
  }
  parseResponse(content) {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      let parsed;
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        parsed = JSON.parse(content);
      }
      return {
        findings: parsed.findings,
        sources: parsed.sources,
        confidence: parsed.confidence
      };
    } catch {
      return {};
    }
  }
};

// src/services/chatlunaSearch.ts
var MAX_RESULTS_PER_QUERY = 8;
var MAX_TOTAL_RESULTS = 24;
var MAX_DESC_LENGTH = 320;
var ChatlunaSearchAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger("chatluna-fact-check");
    this.chatluna = new ChatlunaAdapter(ctx, config);
    this.initTool();
  }
  static {
    __name(this, "ChatlunaSearchAgent");
  }
  logger;
  // 存储 toolInfo 而不是 tool 实例，每次搜索时重新创建
  toolInfo = null;
  toolReady = false;
  emptyEmbeddings = null;
  chatluna;
  normalizeResultItems(searchResult) {
    if (!searchResult) return [];
    if (Array.isArray(searchResult)) {
      return searchResult;
    }
    if (typeof searchResult === "string") {
      try {
        const parsed = JSON.parse(searchResult);
        return this.normalizeResultItems(parsed);
      } catch {
        return [{ description: searchResult }];
      }
    }
    if (typeof searchResult === "object") {
      if (Array.isArray(searchResult.results)) return searchResult.results;
      if (Array.isArray(searchResult.items)) return searchResult.items;
      if (Array.isArray(searchResult.data)) return searchResult.data;
      if (searchResult.url || searchResult.title || searchResult.description || searchResult.content) {
        return [searchResult];
      }
    }
    return [];
  }
  normalizeUrl(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      let normalized = u.toString();
      if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return (url || "").trim();
    }
  }
  truncate(text, maxLength) {
    if (!text) return "";
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }
  async initTool() {
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    try {
      try {
        const inMemory = require("koishi-plugin-chatluna/llm-core/model/in_memory");
        this.emptyEmbeddings = inMemory.emptyEmbeddings;
        this.logger.debug("[ChatlunaSearch] emptyEmbeddings 已导入");
      } catch {
        this.logger.debug("[ChatlunaSearch] 无法导入 emptyEmbeddings，将使用 null");
      }
      const chatluna = this.ctx.chatluna;
      if (!chatluna?.platform) {
        this.logger.warn("[ChatlunaSearch] chatluna.platform 不可用");
        return;
      }
      const tools = chatluna.platform.getTools();
      this.logger.debug(`[ChatlunaSearch] 可用工具列表: ${JSON.stringify(tools.value)}`);
      if (tools.value && tools.value.includes("web_search")) {
        this.toolInfo = chatluna.platform.getTool("web_search");
        this.logger.debug(`[ChatlunaSearch] toolInfo: ${JSON.stringify(this.toolInfo ? Object.keys(this.toolInfo) : null)}`);
        if (this.toolInfo && typeof this.toolInfo.createTool === "function") {
          this.toolReady = true;
          this.logger.info("[ChatlunaSearch] web_search 工具注册信息已获取");
        } else {
          this.logger.warn("[ChatlunaSearch] toolInfo 无效或没有 createTool 方法");
          this.toolInfo = null;
        }
      } else {
        this.logger.warn("[ChatlunaSearch] web_search 工具未注册，请确保已启用 chatluna-search-service");
      }
    } catch (error) {
      this.logger.warn("[ChatlunaSearch] 初始化工具失败:", error);
    }
  }
  /**
   * 创建搜索工具实例
   */
  createSearchTool() {
    if (!this.toolInfo) {
      return null;
    }
    try {
      const tool = this.toolInfo.createTool({
        embeddings: this.emptyEmbeddings,
        summaryType: "performance"
      });
      this.logger.debug(`[ChatlunaSearch] 创建的 tool: name=${tool?.name}, type=${typeof tool}`);
      this.logger.debug(`[ChatlunaSearch] tool.invoke: ${typeof tool?.invoke}`);
      this.logger.debug(`[ChatlunaSearch] tool._call: ${typeof tool?._call}`);
      return tool;
    } catch (error) {
      this.logger.error("[ChatlunaSearch] createTool 失败:", error);
      return null;
    }
  }
  /**
   * 检查服务是否可用
   */
  isAvailable() {
    const enabled = this.config.tof.enableChatlunaSearch !== false;
    const hasModel = !!this.config.tof.chatlunaSearchModel;
    const hasChatluna = !!this.ctx.chatluna?.platform;
    return enabled && hasModel && hasChatluna;
  }
  /**
   * 多样化搜索关键词
   * 使用小模型生成多个不同角度的搜索关键词
   */
  async diversifyQuery(query) {
    const diversifyModel = this.config.tof.chatlunaSearchDiversifyModel;
    if (!diversifyModel) {
      return [query];
    }
    try {
      this.logger.info("[ChatlunaSearch] 使用小模型多样化搜索关键词...");
      const response = await this.chatluna.chatWithRetry({
        model: diversifyModel,
        systemPrompt: `你是一个搜索关键词优化专家。给定一个声明或问题，生成3个不同角度的搜索关键词，用于事实核查。

要求：
1. 关键词应该简洁有效，适合搜索引擎
2. 从不同角度切入：如正面验证、反面查证、相关背景
3. 每个关键词单独一行
4. 只输出关键词，不要编号或其他说明`,
        message: `请为以下内容生成3个多样化的搜索关键词：

${query}`
      }, this.config.tof.maxRetries);
      const keywords = response.content.split("\n").map((k) => k.trim()).filter((k) => k.length > 0 && k.length < 100);
      if (keywords.length > 0) {
        this.logger.info(`[ChatlunaSearch] 生成了 ${keywords.length} 个多样化关键词: ${keywords.join(" | ")}`);
        return keywords.slice(0, 3);
      }
    } catch (error) {
      this.logger.warn("[ChatlunaSearch] 关键词多样化失败，使用原始查询:", error);
    }
    return [query];
  }
  /**
   * 执行搜索
   */
  async search(query) {
    const startTime = Date.now();
    const modelName = this.config.tof.chatlunaSearchModel;
    const shortModelName = modelName.includes("/") ? modelName.split("/").pop() : modelName;
    this.logger.info(`[ChatlunaSearch] 开始搜索，模型: ${modelName}`);
    try {
      const chatluna = this.ctx.chatluna;
      if (!this.toolReady || !this.toolInfo) {
        this.logger.info("[ChatlunaSearch] 工具未就绪，尝试重新获取...");
        const tools = chatluna.platform.getTools();
        if (tools.value && tools.value.includes("web_search")) {
          this.toolInfo = chatluna.platform.getTool("web_search");
          if (this.toolInfo && typeof this.toolInfo.createTool === "function") {
            this.toolReady = true;
            this.logger.info("[ChatlunaSearch] 工具重新获取成功");
          }
        }
      }
      if (!this.toolReady || !this.toolInfo) {
        throw new Error("web_search 工具未就绪，请确保已启用 chatluna-search-service 并配置了搜索引擎");
      }
      const queries = await this.diversifyQuery(query);
      this.logger.info(`[ChatlunaSearch] 将并行执行 ${queries.length} 次搜索`);
      const searchPromises = queries.map(async (q) => {
        const searchTool = this.createSearchTool();
        if (!searchTool) {
          this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 创建搜索工具失败`);
          return [];
        }
        try {
          this.logger.info(`[ChatlunaSearch] 正在搜索关键词: ${q}`);
          let searchResult;
          if (typeof searchTool.invoke === "function") {
            searchResult = await searchTool.invoke(q);
          } else if (typeof searchTool._call === "function") {
            searchResult = await searchTool._call(q, void 0, {});
          } else {
            throw new Error("搜索工具没有可用的调用方法");
          }
          const searchData = this.normalizeResultItems(searchResult).slice(0, MAX_RESULTS_PER_QUERY);
          return searchData.map((item) => ({ ...item, searchQuery: q }));
        } catch (err) {
          this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 搜索失败:`, err);
          return [];
        }
      });
      const searchResultsArray = await Promise.all(searchPromises);
      const allSearchData = [];
      for (const results of searchResultsArray) {
        if (Array.isArray(results)) {
          for (const item of results) {
            allSearchData.push(item);
          }
        }
      }
      const dedupedSearchData = [];
      const seenKeys = /* @__PURE__ */ new Set();
      for (const item of allSearchData) {
        const url = this.normalizeUrl(item?.url || "");
        const key = url || `${item?.title || ""}|${item?.description || item?.content || ""}`;
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        dedupedSearchData.push(item);
      }
      const finalSearchData = dedupedSearchData.slice(0, MAX_TOTAL_RESULTS);
      const allSources = [...new Set(
        finalSearchData.map((item) => this.normalizeUrl(item?.url || "")).filter(Boolean)
      )];
      const totalResults = finalSearchData.length;
      this.logger.info(
        `[ChatlunaSearch] 原始 ${allSearchData.length} 条，去重后 ${dedupedSearchData.length} 条，最终保留 ${totalResults} 条`
      );
      const formattedResults = finalSearchData.length > 0 ? finalSearchData.map(
        (item, i) => `[${i + 1}] ${this.truncate(item.title || "未知标题", 120)}
来源: ${item.url || "未知"}
${this.truncate(item.description || item.content || "", MAX_DESC_LENGTH)}`
      ).join("\n\n---\n\n") : "未找到搜索结果";
      const summary = `=== Chatluna Search 统计 ===
搜索关键词: ${queries.join(" | ")}
原始结果数: ${allSearchData.length}
去重后结果数: ${dedupedSearchData.length}
返回结果数: ${totalResults}
来源数: ${allSources.length}
================================

`;
      const elapsed = Date.now() - startTime;
      this.logger.info(`[ChatlunaSearch] 搜索完成，耗时 ${elapsed}ms，共 ${totalResults} 条结果`);
      return {
        agentId: "chatluna-search",
        perspective: `Chatluna Search (${shortModelName})`,
        findings: summary + formattedResults,
        sources: allSources,
        confidence: totalResults > 0 ? Math.min(0.45 + allSources.length * 0.06, 0.85) : 0
      };
    } catch (error) {
      this.logger.error("[ChatlunaSearch] 搜索失败:", error);
      return {
        agentId: "chatluna-search",
        perspective: `Chatluna Search (${shortModelName})`,
        findings: `搜索失败: ${error.message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: error.message
      };
    }
  }
};

// src/services/messageParser.ts
var import_koishi = require("koishi");
var COMMAND_ALIASES = /* @__PURE__ */ new Set(["tof", "真假", "事实核查", "factcheck"]);
var MessageParser = class {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.imageTimeoutMs = options.imageTimeoutMs ?? 15e3;
    this.maxImageBytes = options.maxImageBytes ?? 8 * 1024 * 1024;
  }
  static {
    __name(this, "MessageParser");
  }
  imageTimeoutMs;
  maxImageBytes;
  stripLeadingCommand(content) {
    const trimmed = content.trimStart();
    const firstToken = trimmed.split(/\s+/, 1)[0]?.toLowerCase() || "";
    if (!COMMAND_ALIASES.has(firstToken)) return content;
    return trimmed.slice(firstToken.length).trimStart();
  }
  /**
   * 从会话中提取引用消息的内容
   */
  async parseQuotedMessage(session) {
    const result = {
      text: "",
      images: [],
      hasQuote: false
    };
    const quote = session.quote;
    if (!quote) {
      return null;
    }
    result.hasQuote = true;
    const elements = quote.elements || [];
    for (const element of elements) {
      if (element.type === "text") {
        result.text += element.attrs?.content || "";
      } else if (element.type === "img" || element.type === "image") {
        const src = element.attrs?.src || element.attrs?.url;
        if (src) {
          result.images.push(src);
        }
      }
    }
    if (elements.length === 0 && quote.content) {
      const parsed = this.parseContent(quote.content);
      result.text = parsed.text;
      result.images = parsed.images;
    }
    return result;
  }
  /**
   * 从整个会话中提取可验证内容
   * 同时解析引用消息和当前消息，合并内容
   */
  async parseSession(session) {
    const result = {
      text: "",
      images: [],
      hasQuote: false
    };
    const quoted = await this.parseQuotedMessage(session);
    if (quoted) {
      result.hasQuote = true;
      result.images = [...quoted.images];
      if (quoted.text.trim()) {
        result.text = quoted.text;
      }
    }
    const elements = session.elements || [];
    this.ctx.logger("chatluna-fact-check").debug("Parsing session elements:", JSON.stringify(elements));
    let currentText = "";
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.type === "text") {
        let content = element.attrs?.content || "";
        if (i === 0) {
          content = this.stripLeadingCommand(content);
        }
        currentText += content;
      } else if (element.type === "img" || element.type === "image") {
        const src = element.attrs?.src || element.attrs?.url;
        if (src && !result.images.includes(src)) {
          result.images.push(src);
        }
      }
    }
    currentText = currentText.trim();
    if (currentText) {
      if (result.text) {
        result.text = `${result.text}

[用户评论]: ${currentText}`;
      } else {
        result.text = currentText;
      }
      this.ctx.logger("chatluna-fact-check").info(`用户附加文字: ${currentText}`);
    }
    if (result.text.trim() || result.images.length > 0) {
      return result;
    }
    return null;
  }
  /**
   * 解析消息内容字符串
   */
  parseContent(content) {
    const text = [];
    const images = [];
    try {
      const elements = import_koishi.h.parse(content);
      for (const el of elements) {
        if (el.type === "text") {
          text.push(el.attrs?.content || String(el));
        } else if (el.type === "img" || el.type === "image") {
          const src = el.attrs?.src || el.attrs?.url;
          if (src) {
            images.push(src);
          }
        }
      }
    } catch {
      text.push(content);
    }
    return {
      text: text.join(" ").trim(),
      images
    };
  }
  /**
   * 获取图片的base64编码
   */
  async imageToBase64(url) {
    try {
      if (url.startsWith("data:image")) {
        return url.split(",")[1] || url;
      }
      if (url.startsWith("file://")) {
        this.ctx.logger("chatluna-fact-check").warn("本地文件暂不支持:", url);
        return null;
      }
      if (!/^https?:\/\//i.test(url)) {
        this.ctx.logger("chatluna-fact-check").warn("仅支持 http/https 图片链接:", url);
        return null;
      }
      const response = await this.ctx.http.get(url, {
        responseType: "arraybuffer",
        timeout: this.imageTimeoutMs
      });
      const rawData = response?.data ?? response;
      const buffer = Buffer.from(rawData);
      if (buffer.length > this.maxImageBytes) {
        this.ctx.logger("chatluna-fact-check").warn(`图片过大已跳过: ${(buffer.length / 1024 / 1024).toFixed(2)}MB > ${(this.maxImageBytes / 1024 / 1024).toFixed(2)}MB`);
        return null;
      }
      return buffer.toString("base64");
    } catch (error) {
      this.ctx.logger("chatluna-fact-check").error("图片转换失败:", error);
      return null;
    }
  }
  /**
   * 准备消息内容用于LLM处理
   * 将图片转换为base64，合并文本
   */
  async prepareForLLM(content) {
    const imageBase64List = [];
    for (const imageUrl of content.images) {
      const base64 = await this.imageToBase64(imageUrl);
      if (base64) {
        imageBase64List.push(base64);
      }
    }
    return {
      text: content.text,
      imageBase64List
    };
  }
};

// src/services/tavily.ts
var TavilySearchAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.apiKey = config.tof.tavilyApiKey;
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "TavilySearchAgent");
  }
  apiKey;
  logger;
  /**
   * 检查服务是否可用
   */
  isAvailable() {
    return !!this.apiKey;
  }
  /**
   * 执行搜索
   */
  async search(query) {
    const startTime = Date.now();
    this.logger.info("[Tavily] 开始搜索:", query.substring(0, 50));
    try {
      const response = await this.ctx.http.post(
        "https://api.tavily.com/search",
        {
          api_key: this.apiKey,
          query,
          search_depth: "advanced",
          include_answer: true,
          max_results: 5
        },
        {
          timeout: this.config.tof.timeout
        }
      );
      const findings = this.formatFindings(response);
      const sources = response.results.map((r) => r.url);
      const elapsed = Date.now() - startTime;
      this.logger.info(`[Tavily] 搜索完成，耗时 ${elapsed}ms，找到 ${response.results.length} 条结果`);
      return {
        agentId: "tavily",
        perspective: "Tavily 网络搜索",
        findings,
        sources,
        confidence: this.calculateConfidence(response)
      };
    } catch (error) {
      this.logger.error("[Tavily] 搜索失败:", error);
      return {
        agentId: "tavily",
        perspective: "Tavily 网络搜索",
        findings: `搜索失败: ${error.message}`,
        sources: [],
        confidence: 0,
        failed: true,
        error: error.message
      };
    }
  }
  /**
   * 格式化搜索结果
   */
  formatFindings(response) {
    const parts = [];
    if (response.answer) {
      parts.push(`摘要: ${response.answer}`);
    }
    if (response.results.length > 0) {
      parts.push("\n相关结果:");
      for (const result of response.results.slice(0, 3)) {
        parts.push(`- ${result.title}: ${result.content.substring(0, 150)}...`);
      }
    }
    return parts.join("\n") || "未找到相关信息";
  }
  /**
   * 计算置信度
   */
  calculateConfidence(response) {
    if (response.results.length === 0) return 0.1;
    const avgScore = response.results.reduce((sum, r) => sum + r.score, 0) / response.results.length;
    return Math.min(avgScore, 0.9);
  }
};

// src/agents/mainAgent.ts
var MainAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.subSearchAgent = new SubSearchAgent(ctx, config);
    this.chatlunaSearchAgent = new ChatlunaSearchAgent(ctx, config);
    this.verifyAgent = new VerifyAgent(ctx, config);
    this.chatluna = new ChatlunaAdapter(ctx, config);
    this.messageParser = new MessageParser(ctx, {
      imageTimeoutMs: Math.min(config.tof.timeout, 3e4),
      maxImageBytes: 8 * 1024 * 1024
    });
    this.tavilySearchAgent = new TavilySearchAgent(ctx, config);
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "MainAgent");
  }
  subSearchAgent;
  chatlunaSearchAgent;
  verifyAgent;
  chatluna;
  messageParser;
  tavilySearchAgent;
  logger;
  /**
   * 执行完整的核查流程
   */
  async verify(content) {
    const startTime = Date.now();
    this.logger.info("开始主控 Agent 核查流程...");
    try {
      let imageBase64List = [];
      if (content.images.length > 0) {
        this.logger.info(`[Phase 0] 处理 ${content.images.length} 张图片...`);
        const prepared = await this.messageParser.prepareForLLM(content);
        imageBase64List = prepared.imageBase64List;
        this.logger.info(`[Phase 0] 成功转换 ${imageBase64List.length} 张图片为 base64`);
      }
      let searchText = content.text;
      if (!content.text.trim() && imageBase64List.length > 0) {
        this.logger.info("[Phase 0] 纯图片输入，提取图片描述...");
        searchText = await this.extractImageDescription(imageBase64List);
        this.logger.info(`[Phase 0] 图片描述：${searchText.substring(0, 100)}...`);
      }
      this.logger.info("[Phase 1+2] 并行搜索中 (Chatluna + Grok + Tavily)...");
      const searchTasks = [];
      if (this.chatlunaSearchAgent.isAvailable() && this.config.tof.enableChatlunaSearch) {
        searchTasks.push({
          name: "ChatlunaSearch",
          promise: this.withTimeout(
            this.chatlunaSearchAgent.search(searchText),
            this.config.tof.timeout,
            "ChatlunaSearch"
          )
        });
      }
      searchTasks.push({
        name: "GrokSearch",
        promise: this.withTimeout(
          this.subSearchAgent.deepSearch(searchText),
          this.config.tof.timeout,
          "GrokSearch"
        )
      });
      if (this.tavilySearchAgent.isAvailable()) {
        searchTasks.push({
          name: "TavilySearch",
          promise: this.withTimeout(
            this.tavilySearchAgent.search(searchText),
            this.config.tof.timeout,
            "TavilySearch"
          )
        });
      }
      const results = await Promise.allSettled(searchTasks.map((t) => t.promise));
      const allSearchResults = results.filter((r) => r.status === "fulfilled" && r.value !== null).map((r) => r.value);
      const searchResults = allSearchResults.filter((result) => !result.failed);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          this.logger.warn(`搜索 ${searchTasks[i]?.name || i} 失败: ${r.reason}`);
        }
      });
      allSearchResults.filter((result) => result.failed).forEach((result) => {
        this.logger.warn(`搜索 ${result.perspective} 失败: ${result.error || result.findings}`);
      });
      this.logger.info(`[Phase 1+2] 搜索完成，成功 ${searchResults.length} 个`);
      if (searchResults.length === 0) {
        return {
          originalContent: content,
          searchResults: [],
          verdict: "uncertain" /* UNCERTAIN */,
          reasoning: "所有搜索都失败了，无法验证",
          sources: [],
          confidence: 0,
          processingTime: Date.now() - startTime
        };
      }
      const processedResults = searchResults.map((r) => ({
        ...r,
        findings: injectCensorshipBypass(r.findings)
      }));
      this.logger.info("[Phase 3] Gemini 判决中...");
      const finalResult = await this.verifyAgent.verify(
        content,
        processedResults,
        imageBase64List
      );
      return {
        ...finalResult,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      this.logger.error("主控 Agent 流程出错:", error);
      return {
        originalContent: content,
        searchResults: [],
        verdict: "uncertain" /* UNCERTAIN */,
        reasoning: `流程执行失败: ${error.message}`,
        sources: [],
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    }
  }
  /**
   * 带超时的 Promise 包装
   */
  async withTimeout(promise, timeout, name2) {
    let timer = null;
    try {
      return await Promise.race([
        promise,
        new Promise(
          (_, reject) => timer = setTimeout(() => reject(new Error(`${name2} 超时`)), timeout)
        )
      ]);
    } catch (error) {
      this.logger.warn(`[${name2}] 失败: ${error.message}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  /**
   * 从图片中提取描述（用于纯图片输入场景）
   */
  async extractImageDescription(images) {
    try {
      const response = await this.chatluna.chat({
        model: this.config.tof.model,
        message: IMAGE_DESCRIPTION_PROMPT,
        images
      });
      return response.content;
    } catch (error) {
      this.logger.error("图片描述提取失败:", error);
      return "图片内容需要验证";
    }
  }
};

// src/services/factCheckTool.ts
var import_tools = require("@langchain/core/tools");
var FactCheckTool = class extends import_tools.Tool {
  constructor(ctx, config, toolName, toolDescription) {
    super();
    this.ctx = ctx;
    this.config = config;
    this.name = toolName;
    this.description = toolDescription;
    this.logger = ctx.logger("chatluna-fact-check");
  }
  static {
    __name(this, "FactCheckTool");
  }
  name;
  description;
  logger;
  getToolProviders() {
    const providers = [];
    const grokModel = this.config.agent.grokModel?.trim() || this.config.tof.searchModel;
    if (this.config.agent.searchUseGrok && grokModel) {
      providers.push({ key: "grok", label: "GrokSearch", model: grokModel });
    }
    const geminiModel = this.config.agent.geminiModel?.trim();
    if (this.config.agent.searchUseGemini && geminiModel) {
      providers.push({ key: "gemini", label: "GeminiSearch", model: geminiModel });
    }
    const chatgptModel = this.config.agent.chatgptModel?.trim();
    if (this.config.agent.searchUseChatgpt && chatgptModel) {
      providers.push({ key: "chatgpt", label: "ChatGPTSearch", model: chatgptModel });
    }
    const deepseekModel = this.config.agent.deepseekModel?.trim();
    if (this.config.agent.searchUseDeepseek && deepseekModel) {
      providers.push({ key: "deepseek", label: "DeepSeekSearch", model: deepseekModel });
    }
    if (providers.length === 0) {
      providers.push({
        key: "grok",
        label: "GrokSearch",
        model: this.config.tof.searchModel
      });
    }
    return providers;
  }
  async withTimeout(promise, timeout, label) {
    let timer = null;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} 超时`)), timeout);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  truncate(text, maxChars) {
    const normalized = (text || "").trim();
    if (!normalized) return "无可用搜索结果";
    return normalized.length > maxChars ? `${normalized.substring(0, maxChars)}...` : normalized;
  }
  formatSingleResult(result) {
    const findings = this.truncate(result.findings, this.config.agent.maxFindingsChars);
    const sources = result.sources.slice(0, this.config.agent.maxSources);
    const sourceText = sources.length > 0 ? sources.map((s) => `- ${s}`).join("\n") : "- 无";
    return `[${result.perspective}]
${findings}

[Sources]
${sourceText}`;
  }
  formatMultiResults(results) {
    const parts = [];
    const allSources = /* @__PURE__ */ new Set();
    for (const result of results) {
      parts.push(`[${result.perspective}]`);
      parts.push(this.truncate(result.findings, this.config.agent.maxFindingsChars));
      parts.push("");
      for (const source of result.sources) {
        if (source) allSources.add(source);
      }
    }
    const dedupedSources = [...allSources].slice(0, this.config.agent.maxSources);
    const sourceText = dedupedSources.length > 0 ? dedupedSources.map((s) => `- ${s}`).join("\n") : "- 无";
    parts.push("[Sources]");
    parts.push(sourceText);
    return parts.join("\n");
  }
  async _call(input) {
    const rawClaim = (input || "").trim();
    if (!rawClaim) {
      return "[GrokSearch]\n输入为空，请提供需要检索的文本。";
    }
    const limit = this.config.agent.maxInputChars;
    const claim = rawClaim.substring(0, limit);
    if (rawClaim.length > limit) {
      this.logger.warn(`[ChatlunaTool] 输入过长，已截断到 ${limit} 字符`);
    }
    try {
      this.logger.info("[ChatlunaTool] 收到事实核查请求");
      const subSearchAgent = new SubSearchAgent(this.ctx, this.config);
      const providers = this.getToolProviders();
      if (!this.config.agent.enableMultiSourceSearch || providers.length === 1) {
        const provider = providers[0];
        const result = await this.withTimeout(
          subSearchAgent.deepSearchWithModel(
            claim,
            provider.model,
            `tool-${provider.key}`,
            provider.label,
            buildFactCheckToolSearchPrompt(claim),
            FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
          ),
          this.config.agent.perSourceTimeout,
          provider.label
        );
        if (result.failed) {
          return `[${provider.label}]
搜索失败: ${result.error || result.findings}`;
        }
        return this.formatSingleResult(result);
      }
      const settled = await Promise.allSettled(
        providers.map(
          (provider) => this.withTimeout(
            subSearchAgent.deepSearchWithModel(
              claim,
              provider.model,
              `tool-${provider.key}`,
              provider.label,
              buildFactCheckToolSearchPrompt(claim),
              FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT
            ),
            this.config.agent.perSourceTimeout,
            provider.label
          )
        )
      );
      const successResults = [];
      const failedLabels = [];
      settled.forEach((item, index) => {
        const provider = providers[index];
        if (item.status === "fulfilled") {
          if (item.value.failed) {
            failedLabels.push(provider.label);
            this.logger.warn(`[ChatlunaTool] ${provider.label} 失败: ${item.value.error || item.value.findings}`);
          } else {
            successResults.push(item.value);
          }
        } else {
          failedLabels.push(provider.label);
          this.logger.warn(`[ChatlunaTool] ${provider.label} 失败: ${item.reason?.message || item.reason}`);
        }
      });
      if (successResults.length === 0) {
        return `[MultiSourceSearch]
搜索失败: ${failedLabels.join("、") || "全部来源不可用"}`;
      }
      const output = this.formatMultiResults(successResults);
      if (failedLabels.length > 0) {
        return `${output}

[Failed]
- ${failedLabels.join("\n- ")}`;
      }
      return output;
    } catch (error) {
      this.logger.error("[ChatlunaTool] 核查失败:", error);
      return `[MultiSourceSearch]
搜索失败: ${error.message}`;
    }
  }
};
function registerFactCheckTool(ctx, config) {
  const logger = ctx.logger("chatluna-fact-check");
  if (!config.agent.enable) {
    logger.info("[ChatlunaTool] 已禁用工具注册");
    return;
  }
  const chatluna = ctx.chatluna;
  if (!chatluna?.platform?.registerTool) {
    logger.warn("[ChatlunaTool] chatluna.platform.registerTool 不可用，跳过注册");
    return;
  }
  const name2 = config.agent.name?.trim() || "fact_check";
  const description = config.agent.description?.trim() || "用于检索证据（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/DeepSeek），由上层 Agent 自行判断。";
  ctx.effect(() => {
    logger.info(`[ChatlunaTool] 注册工具: ${name2}`);
    return chatluna.platform.registerTool(name2, {
      createTool() {
        return new FactCheckTool(ctx, config, name2, description);
      },
      selector() {
        return true;
      }
    });
  });
}
__name(registerFactCheckTool, "registerFactCheckTool");

// src/config.ts
var import_koishi2 = require("koishi");
var tofConfigSchema = import_koishi2.Schema.object({
  model: import_koishi2.Schema.dynamic("model").default("google/gemini-3-flash").description("判决模型 (用于最终判决，推荐 Gemini-3-Flash)"),
  searchModel: import_koishi2.Schema.dynamic("model").default("x-ai/grok-4-1").description("搜索模型 (用于深度搜索，推荐 Grok-4-1)"),
  timeout: import_koishi2.Schema.number().min(1e4).max(3e5).default(6e4).description("单次请求超时时间 (毫秒)"),
  maxRetries: import_koishi2.Schema.number().min(0).max(5).default(2).description("失败重试次数")
}).description("基础设置");
var tofSearchSchema = import_koishi2.Schema.object({
  tavilyApiKey: import_koishi2.Schema.string().default("").role("secret").description("Tavily API Key (可选，用于补充搜索)"),
  chatlunaSearchModel: import_koishi2.Schema.dynamic("model").default("").description("Chatluna Search 使用的模型 (可选；chatluna-search-service 不稳定时可留空并使用 fact_check 工具替代)"),
  enableChatlunaSearch: import_koishi2.Schema.boolean().default(false).description("启用 Chatluna 搜索集成（默认关闭，建议优先使用 fact_check 工具作为 LLMSearch 替代）"),
  chatlunaSearchDiversifyModel: import_koishi2.Schema.dynamic("model").default("").description("搜索关键词多样化模型 (可选，推荐 Gemini 2.5 Flash Lite)")
}).description("搜索集成");
var tofOutputSchema = import_koishi2.Schema.object({
  outputFormat: import_koishi2.Schema.union([
    import_koishi2.Schema.const("auto").description("自动 (QQ 使用纯文本)"),
    import_koishi2.Schema.const("markdown").description("Markdown"),
    import_koishi2.Schema.const("plain").description("纯文本")
  ]).default("auto").description("输出格式"),
  useForwardMessage: import_koishi2.Schema.boolean().default(true).description("使用合并转发消息展示详情 (仅支持 QQ)"),
  forwardMaxNodes: import_koishi2.Schema.number().min(0).max(99).default(8).description("合并转发最大节点数，超过则回退普通消息（0 表示直接回退）"),
  forwardMaxTotalChars: import_koishi2.Schema.number().min(0).max(2e4).default(3e3).description("合并转发总字符数上限，超过则回退普通消息（0 表示直接回退）"),
  forwardMaxSegmentChars: import_koishi2.Schema.number().min(50).max(2e3).default(500).description("合并转发单节点字符数上限"),
  verbose: import_koishi2.Schema.boolean().default(false).description("显示详细验证过程 (进度提示)")
}).description("输出格式");
var tofDebugSchema = import_koishi2.Schema.object({
  bypassProxy: import_koishi2.Schema.boolean().default(false).description("是否绕过系统代理"),
  logLLMDetails: import_koishi2.Schema.boolean().default(false).description("是否打印 LLM 请求体和响应详情 (Debug 用)")
}).description("调试");
var agentToolSchema = import_koishi2.Schema.object({
  enable: import_koishi2.Schema.boolean().default(true).description("开启：注册事实核查为 Chatluna 可调用工具"),
  name: import_koishi2.Schema.string().default("fact_check").description("Chatluna 工具名称（需与预设中提及名称一致）"),
  description: import_koishi2.Schema.string().default("用于检索证据（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/DeepSeek），由上层 Agent 自行判断。").description("Chatluna 工具描述，建议明确该工具只提供证据不做最终裁决"),
  maxInputChars: import_koishi2.Schema.number().min(100).max(1e4).default(1200).description("Chatluna 工具单次输入文本最大字符数"),
  maxSources: import_koishi2.Schema.number().min(1).max(20).default(5).description("Chatluna 工具返回来源链接数量上限")
}).description("Fact Check 工具");
var agentMultiSourceSchema = import_koishi2.Schema.object({
  enableMultiSourceSearch: import_koishi2.Schema.boolean().default(true).description("Agent 调用 fact_check 时，启用多源并行搜索"),
  searchUseGrok: import_koishi2.Schema.boolean().default(true).description("多源搜索包含 Grok"),
  searchUseGemini: import_koishi2.Schema.boolean().default(true).description("多源搜索包含 Gemini（需模型支持搜索工具）"),
  searchUseChatgpt: import_koishi2.Schema.boolean().default(false).description("多源搜索包含 ChatGPT（需模型支持搜索工具）"),
  searchUseDeepseek: import_koishi2.Schema.boolean().default(false).description("多源搜索包含 DeepSeek（需模型支持搜索工具）"),
  grokModel: import_koishi2.Schema.dynamic("model").default("").description("Grok 来源模型（留空时回退 searchModel）"),
  geminiModel: import_koishi2.Schema.dynamic("model").default("").description("Gemini 来源模型（留空则跳过 Gemini 来源）"),
  chatgptModel: import_koishi2.Schema.dynamic("model").default("").description("ChatGPT 来源模型（留空则跳过 ChatGPT 来源）"),
  deepseekModel: import_koishi2.Schema.dynamic("model").default("").description("DeepSeek 来源模型（留空则跳过 DeepSeek 来源）"),
  perSourceTimeout: import_koishi2.Schema.number().min(5e3).max(18e4).default(45e3).description("fact_check 多源模式下每个来源的独立超时时间（毫秒）"),
  maxFindingsChars: import_koishi2.Schema.number().min(200).max(8e3).default(2e3).description("fact_check 输出中每个来源 findings 的最大字符数")
}).description("多源搜索配置");
var Config = import_koishi2.Schema.intersect([
  import_koishi2.Schema.object({
    tof: import_koishi2.Schema.intersect([
      tofConfigSchema,
      tofSearchSchema,
      tofOutputSchema,
      tofDebugSchema
    ]).description("Tof 命令配置"),
    agent: import_koishi2.Schema.intersect([
      agentToolSchema,
      agentMultiSourceSchema
    ]).description("Agent 工具配置")
  })
]);

// src/index.ts
var name = "chatluna-fact-check";
var inject = {
  required: ["chatluna"],
  optional: ["console"]
};
var usage = `
## 事实核查插件

使用多Agent架构对消息进行事实核查验证。

### 使用方法

1. 引用一条需要验证的消息
2. 发送 \`tof\` 指令
3. 等待验证结果

### 工作流程

1. **解析阶段**: 提取引用消息中的文本和图片
2. **搜索阶段**: 多个Agent并行从不同角度搜索信息
3. **验证阶段**: 综合搜索结果，由低幻觉率LLM做出判决

### 判决类别

- ✅ **真实**: 有充分可靠证据支持
- ❌ **虚假**: 有充分可靠证据反驳
- ⚠️ **部分真实**: 声明中部分内容属实
- ❓ **无法确定**: 证据不足或相互矛盾
`;
var import_meta = {};
function apply(ctx, config) {
  const logger = ctx.logger("chatluna-fact-check");
  const messageParser = new MessageParser(ctx, {
    imageTimeoutMs: Math.min(config.tof.timeout, 3e4),
    maxImageBytes: 8 * 1024 * 1024
  });
  registerFactCheckTool(ctx, config);
  ctx.inject(["console"], (innerCtx) => {
    const consoleService = innerCtx.console;
    const packageBase = import_node_path.default.resolve(ctx.baseDir, "node_modules/koishi-plugin-chatluna-fact-check");
    const browserEntry = import_meta.url ? import_meta.url.replace(/\/src\/[^/]+$/, "/client/index.ts") : import_node_path.default.resolve(__dirname, "../client/index.ts");
    const entry = process.env.KOISHI_BASE ? [process.env.KOISHI_BASE + "/dist/index.js"] : process.env.KOISHI_ENV === "browser" ? [browserEntry] : {
      dev: import_node_path.default.resolve(packageBase, "client/index.ts"),
      prod: import_node_path.default.resolve(packageBase, "dist")
    };
    consoleService?.addEntry?.(entry);
  });
  ctx.command("tof", "验证消息的真实性").alias("真假").alias("事实核查").alias("factcheck").option("verbose", "-v 显示详细过程").action(async ({ session, options }) => {
    logger.info("tof 命令被触发");
    if (!session) {
      logger.warn("session 为空");
      return "无法获取会话信息";
    }
    logger.info(`用户 ${session.userId} 在 ${session.channelId} 触发 tof 命令`);
    logger.debug("Session elements:", JSON.stringify(session.elements));
    const verbose = options?.verbose ?? config.tof.verbose;
    const format = config.tof.outputFormat === "auto" ? session.platform === "qq" ? "plain" : "markdown" : config.tof.outputFormat;
    const chatluna = new ChatlunaAdapter(ctx, config);
    if (!chatluna.isAvailable()) {
      return "❌ Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna";
    }
    const content = await messageParser.parseSession(session);
    if (!content || !content.text && content.images.length === 0) {
      return "❌ 请提供需要验证的内容\n\n使用方法:\n1. 引用一条消息后发送 tof\n2. 直接发送 tof [文本或图片]";
    }
    if (verbose) {
      await session.send("🔍 正在验证消息真实性，请稍候...");
    }
    try {
      if (content.images.length > 0 && verbose) {
        await session.send("📷 正在处理图片内容...");
      }
      const mainAgent = new MainAgent(ctx, config);
      const result = await mainAgent.verify(content);
      const textToDisplay = content.text.trim() || "[图片内容]";
      const searchResultsForOutput = result.searchResults.map((r) => ({
        agentId: r.agentId,
        perspective: r.perspective,
        findings: r.findings
      }));
      const useForward = config.tof.useForwardMessage && session.platform === "onebot";
      if (useForward) {
        const { summary, details } = formatForwardMessages(
          textToDisplay,
          searchResultsForOutput,
          result.verdict,
          result.reasoning,
          result.sources,
          result.confidence,
          result.processingTime,
          config.tof.forwardMaxSegmentChars
        );
        const maxNodes = config.tof.forwardMaxNodes ?? 8;
        const maxTotalChars = config.tof.forwardMaxTotalChars ?? 3e3;
        const totalChars = details.reduce((sum, detail) => sum + detail.length, 0);
        if (maxNodes <= 0 || maxTotalChars <= 0 || details.length > maxNodes || totalChars > maxTotalChars) {
          logger.warn(`合并转发内容过长，回退普通消息: nodes=${details.length}/${maxNodes}, chars=${totalChars}/${maxTotalChars}`);
          const output2 = formatVerificationOutput(
            textToDisplay,
            searchResultsForOutput,
            result.verdict,
            result.reasoning,
            result.sources,
            result.confidence,
            result.processingTime,
            format
          );
          return output2;
        }
        const forwardNodes = details.map(
          (detail) => (0, import_koishi3.h)("message", { nickname: "事实核查", userId: session.selfId }, detail)
        );
        let summarySent = false;
        try {
          await session.send(summary);
          summarySent = true;
        } catch (sendSummaryError) {
          logger.warn("发送摘要失败，将尝试回退由 Koishi 发送:", sendSummaryError);
        }
        try {
          await session.send((0, import_koishi3.h)("message", { forward: true }, forwardNodes));
        } catch (forwardError) {
          logger.warn("合并转发发送失败，回退到普通消息:", forwardError);
          for (const detail of details) {
            try {
              await session.send(detail);
            } catch (detailError) {
              logger.warn("回退详情发送失败，已忽略:", detailError);
            }
          }
          if (!summarySent) {
            return summary;
          }
        }
        return;
      }
      const output = formatVerificationOutput(
        textToDisplay,
        searchResultsForOutput,
        result.verdict,
        result.reasoning,
        result.sources,
        result.confidence,
        result.processingTime,
        format
      );
      return output;
    } catch (error) {
      logger.error("验证过程出错:", error);
      return `❌ 验证过程发生错误: ${error.message}`;
    }
  });
  ctx.command("tof.quick <text:text>", "快速验证文本真实性").action(async ({ session }, text) => {
    if (!session) return "无法获取会话信息";
    if (!text?.trim()) return "请提供需要验证的文本";
    const format = config.tof.outputFormat === "auto" ? session.platform === "qq" ? "plain" : "markdown" : config.tof.outputFormat;
    const chatluna = new ChatlunaAdapter(ctx, config);
    if (!chatluna.isAvailable()) {
      return "❌ Chatluna 服务不可用";
    }
    await session.send("🔍 快速验证中...");
    try {
      const mainAgent = new MainAgent(ctx, config);
      const result = await mainAgent.verify({ text, images: [], hasQuote: false });
      const verdictEmoji = {
        ["true" /* TRUE */]: "✅ 真实",
        ["false" /* FALSE */]: "❌ 虚假",
        ["partially_true" /* PARTIALLY_TRUE */]: "⚠️ 部分真实",
        ["uncertain" /* UNCERTAIN */]: "❓ 无法确定"
      };
      const confidenceValue = Math.round(result.confidence * 100);
      const reasoning = result.reasoning.substring(0, 200);
      if (format === "plain") {
        return `${verdictEmoji[result.verdict]} (${confidenceValue}%)
${reasoning}`;
      }
      return `**${verdictEmoji[result.verdict]}** (${confidenceValue}%)

${reasoning}`;
    } catch (error) {
      return `❌ 验证失败: ${error.message}`;
    }
  });
  logger.info("chatluna-fact-check 插件已加载");
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name,
  usage
});
