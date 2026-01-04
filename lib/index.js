var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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

// src/services/chatluna.ts
var import_messages = require("@langchain/core/messages");
var ChatlunaAdapter = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger("isthattrue");
  }
  static {
    __name(this, "ChatlunaAdapter");
  }
  logger;
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
    let originalProxies = {};
    try {
      if (this.config?.bypassProxy) {
        const proxyVars = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"];
        proxyVars.forEach((v) => {
          originalProxies[v] = process.env[v];
          delete process.env[v];
        });
        this.logger.debug("已临时移除系统代理环境变量");
      } else {
        const proxyVars = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"];
        const activeProxies = proxyVars.filter((v) => process.env[v]).map((v) => `${v}=${process.env[v]}`);
        if (activeProxies.length > 0) {
          this.logger.debug(`当前环境代理: ${activeProxies.join(", ")}`);
        } else {
          this.logger.debug("当前环境未检测到系统代理环境变量");
        }
      }
      const modelRef = await this.ctx.chatluna.createChatModel(request.model);
      const model = modelRef.value;
      if (!model) {
        throw new Error(`无法创建模型: ${request.model}，请确保模型已正确配置`);
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
      const response = await model.invoke(messages, {
        temperature: 0.3
        // 低温度以减少幻觉
      });
      if (this.config?.bypassProxy) {
        Object.keys(originalProxies).forEach((v) => {
          if (originalProxies[v] !== void 0) {
            process.env[v] = originalProxies[v];
          }
        });
      }
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
    } catch (error) {
      if (this.config?.bypassProxy) {
        Object.keys(originalProxies).forEach((v) => {
          if (originalProxies[v] !== void 0) {
            process.env[v] = originalProxies[v];
          }
        });
      }
      this.logger.error("Chatluna 请求失败:", error);
      throw error;
    }
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
          this.logger.info(`切换到备用模型: ${fallbackModel}`);
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
    const sourceRegex = /\[来源[：:]\s*([^\]]+)\]/g;
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
      output2 += sources.map((s) => `• ${s}`).join("\n");
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
${sources.map((s) => `• ${s}`).join("\n")}
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
    const sourcesText = limitedSources.map((s) => `• ${s.substring(0, 100)}`).join("\n");
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
    this.logger = ctx.logger("isthattrue");
  }
  static {
    __name(this, "VerifyAgent");
  }
  chatluna;
  logger;
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
      const prompt = buildVerifyPrompt(
        originalContent.text,
        searchResults.map((r) => ({
          perspective: r.perspective,
          findings: r.findings,
          sources: r.sources
        })),
        hasImages
        // 传递是否有图片
      );
      const systemPrompt = hasImages ? VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL : VERIFY_AGENT_SYSTEM_PROMPT;
      const response = await this.chatluna.chatWithRetry(
        {
          model: this.config.mainModel,
          message: prompt,
          systemPrompt,
          images
          // 传递图片
        },
        this.config.maxRetries
      );
      const parsed = this.parseVerifyResponse(response.content);
      const processingTime = Date.now() - startTime;
      const result = {
        originalContent,
        searchResults,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        sources: this.aggregateSources(searchResults, parsed.sources),
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
        confidence: parsed.confidence || 0.5
      };
    } catch {
      return {
        verdict: this.extractVerdictFromText(content),
        reasoning: content,
        sources: [],
        confidence: 0.3
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
    this.logger = ctx.logger("isthattrue");
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
    this.logger.info(`[SubSearchAgent] 开始深度搜索，模型: ${this.config.subSearchModel}`);
    try {
      const response = await this.chatluna.chatWithRetry(
        {
          model: this.config.subSearchModel,
          message: buildSubSearchPrompt(claim),
          systemPrompt: SUB_SEARCH_AGENT_SYSTEM_PROMPT,
          enableSearch: true
        },
        this.config.maxRetries
      );
      const parsed = this.parseResponse(response.content);
      return {
        agentId: "grok-deep-search",
        perspective: "Grok 深度搜索 (X/Twitter)",
        findings: parsed.findings || response.content,
        sources: parsed.sources || response.sources || [],
        confidence: parsed.confidence || 0.8
      };
    } catch (error) {
      this.logger.error("[SubSearchAgent] 搜索失败:", error);
      return {
        agentId: "grok-deep-search",
        perspective: "Grok 深度搜索 (X/Twitter)",
        findings: `深度搜索失败: ${error.message}`,
        sources: [],
        confidence: 0
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
var ChatlunaSearchAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger("isthattrue");
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
        summaryType: "speed"
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
    const enabled = this.config.enableChatlunaSearch !== false;
    const hasModel = !!this.config.chatlunaSearchModel;
    const hasChatluna = !!this.ctx.chatluna?.platform;
    return enabled && hasModel && hasChatluna;
  }
  /**
   * 多样化搜索关键词
   * 使用小模型生成多个不同角度的搜索关键词
   */
  async diversifyQuery(query) {
    const diversifyModel = this.config.chatlunaSearchDiversifyModel;
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
      }, this.config.maxRetries);
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
    const modelName = this.config.chatlunaSearchModel;
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
          let searchData = [];
          if (typeof searchResult === "string") {
            try {
              searchData = JSON.parse(searchResult);
            } catch {
              searchData = [{ description: searchResult }];
            }
          } else if (Array.isArray(searchResult)) {
            searchData = searchResult;
          }
          return searchData.map((item) => ({ ...item, searchQuery: q }));
        } catch (err) {
          this.logger.warn(`[ChatlunaSearch] 关键词 "${q}" 搜索失败:`, err);
          return [];
        }
      });
      const searchResultsArray = await Promise.all(searchPromises);
      const allSearchData = [];
      const allSources = [];
      for (const results of searchResultsArray) {
        if (Array.isArray(results)) {
          for (const item of results) {
            allSearchData.push(item);
            if (item.url && !allSources.includes(item.url)) {
              allSources.push(item.url);
            }
          }
        }
      }
      const totalResults = allSearchData.length;
      this.logger.info(`[ChatlunaSearch] 共获取 ${totalResults} 条搜索结果，来自 ${queries.length} 个关键词`);
      const formattedResults = allSearchData.length > 0 ? allSearchData.map(
        (item, i) => `[${i + 1}] ${item.title || "未知标题"}
来源: ${item.url || "未知"}
${item.description || item.content || ""}`
      ).join("\n\n---\n\n") : "未找到搜索结果";
      const summary = `=== Chatluna Search 统计 ===
搜索关键词: ${queries.join(" | ")}
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
        confidence: totalResults > 0 ? Math.min(0.5 + totalResults * 0.05, 0.9) : 0.3
      };
    } catch (error) {
      this.logger.error("[ChatlunaSearch] 搜索失败:", error);
      return {
        agentId: "chatluna-search",
        perspective: `Chatluna Search (${shortModelName})`,
        findings: `搜索失败: ${error.message}`,
        sources: [],
        confidence: 0
      };
    }
  }
};

// src/services/messageParser.ts
var import_koishi = require("koishi");
var MessageParser = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  static {
    __name(this, "MessageParser");
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
    this.ctx.logger("isthattrue").debug("Parsing session elements:", JSON.stringify(elements));
    let currentText = "";
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.type === "text") {
        let content = element.attrs?.content || "";
        if (i === 0) {
          content = content.replace(/^[^\s]+\s*/, "");
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
      this.ctx.logger("isthattrue").info(`用户附加文字: ${currentText}`);
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
        this.ctx.logger("isthattrue").warn("本地文件暂不支持:", url);
        return null;
      }
      const response = await this.ctx.http.get(url, {
        responseType: "arraybuffer"
      });
      const buffer = Buffer.from(response);
      return buffer.toString("base64");
    } catch (error) {
      this.ctx.logger("isthattrue").error("图片转换失败:", error);
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

// src/agents/mainAgent.ts
var MainAgent = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.subSearchAgent = new SubSearchAgent(ctx, config);
    this.chatlunaSearchAgent = new ChatlunaSearchAgent(ctx, config);
    this.verifyAgent = new VerifyAgent(ctx, config);
    this.chatluna = new ChatlunaAdapter(ctx, config);
    this.messageParser = new MessageParser(ctx);
    this.logger = ctx.logger("isthattrue");
  }
  static {
    __name(this, "MainAgent");
  }
  subSearchAgent;
  chatlunaSearchAgent;
  verifyAgent;
  chatluna;
  messageParser;
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
      this.logger.info("[Phase 1+2] 并行搜索中 (Chatluna + Grok)...");
      const searchPromises = [];
      if (this.chatlunaSearchAgent.isAvailable()) {
        searchPromises.push(
          this.withTimeout(
            this.chatlunaSearchAgent.search(searchText),
            this.config.timeout,
            "ChatlunaSearch"
          )
        );
      }
      searchPromises.push(
        this.withTimeout(
          this.subSearchAgent.deepSearch(searchText),
          this.config.timeout,
          "GrokSearch"
        )
      );
      const results = await Promise.allSettled(searchPromises);
      const searchResults = results.filter((r) => r.status === "fulfilled" && r.value !== null).map((r) => r.value);
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          this.logger.warn(`搜索 ${i === 0 ? "Chatluna" : "Grok"} 失败: ${r.reason}`);
        }
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
    try {
      return await Promise.race([
        promise,
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`${name2} 超时`)), timeout)
        )
      ]);
    } catch (error) {
      this.logger.warn(`[${name2}] 失败: ${error.message}`);
      return null;
    }
  }
  /**
   * 从图片中提取描述（用于纯图片输入场景）
   */
  async extractImageDescription(images) {
    try {
      const response = await this.chatluna.chat({
        model: this.config.mainModel,
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

// src/config.ts
var import_koishi2 = require("koishi");
var Config = import_koishi2.Schema.intersect([
  import_koishi2.Schema.object({
    mainModel: import_koishi2.Schema.dynamic("model").default("google/gemini-3-flash").description("主控 Agent 模型 (用于编排和最终判决，推荐 Gemini-3-Flash)"),
    subSearchModel: import_koishi2.Schema.dynamic("model").default("x-ai/grok-4-1").description("子搜索 Agent 模型 (用于深度搜索，推荐 Grok-4-1)")
  }).description("模型配置"),
  import_koishi2.Schema.object({
    tavilyApiKey: import_koishi2.Schema.string().default("").role("secret").description("Tavily API Key (可选，用于补充搜索)"),
    anspireApiKey: import_koishi2.Schema.string().default("").role("secret").description("Anspire API Key (可选，用于补充搜索)"),
    kimiApiKey: import_koishi2.Schema.string().default("").role("secret").description("Kimi API Key (可选，用于 Kimi K2 内置搜索)"),
    zhipuApiKey: import_koishi2.Schema.string().default("").role("secret").description("智谱 API Key (可选，用于智谱 Web Search)"),
    chatlunaSearchModel: import_koishi2.Schema.dynamic("model").default("").description("Chatluna Search 使用的模型 (可选，用于调用 chatluna-search-service)"),
    enableChatlunaSearch: import_koishi2.Schema.boolean().default(true).description("启用 Chatluna 搜索集成"),
    chatlunaSearchDiversifyModel: import_koishi2.Schema.dynamic("model").default("").description("搜索关键词多样化模型 (可选，推荐 Gemini 2.5 Flash Lite)")
  }).description("搜索API配置"),
  import_koishi2.Schema.object({
    timeout: import_koishi2.Schema.number().min(1e4).max(3e5).default(6e4).description("单次请求超时时间(毫秒)"),
    maxRetries: import_koishi2.Schema.number().min(0).max(5).default(2).description("失败重试次数")
  }).description("Agent配置"),
  import_koishi2.Schema.object({
    verbose: import_koishi2.Schema.boolean().default(false).description("显示详细验证过程 (进度提示)"),
    outputFormat: import_koishi2.Schema.union([
      import_koishi2.Schema.const("auto").description("自动 (QQ使用纯文本)"),
      import_koishi2.Schema.const("markdown").description("Markdown"),
      import_koishi2.Schema.const("plain").description("纯文本")
    ]).default("auto").description("输出格式"),
    useForwardMessage: import_koishi2.Schema.boolean().default(true).description("使用合并转发消息展示详情 (仅支持QQ)"),
    forwardMaxNodes: import_koishi2.Schema.number().min(0).max(99).default(8).description("合并转发最大节点数，超过则回退普通消息（0 表示直接回退）"),
    forwardMaxTotalChars: import_koishi2.Schema.number().min(0).max(2e4).default(3e3).description("合并转发总字符数上限，超过则回退普通消息（0 表示直接回退）"),
    forwardMaxSegmentChars: import_koishi2.Schema.number().min(50).max(2e3).default(500).description("合并转发单节点字符数上限"),
    bypassProxy: import_koishi2.Schema.boolean().default(false).description("是否绕过系统代理"),
    logLLMDetails: import_koishi2.Schema.boolean().default(false).description("是否打印 LLM 请求体和响应详情 (Debug用)")
  }).description("其他设置")
]);

// src/index.ts
var name = "isthattrue";
var inject = ["chatluna"];
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
function apply(ctx, config) {
  const logger = ctx.logger("isthattrue");
  const messageParser = new MessageParser(ctx);
  ctx.command("tof", "验证消息的真实性").alias("真假").alias("事实核查").alias("factcheck").option("verbose", "-v 显示详细过程").action(async ({ session, options }) => {
    logger.info("tof 命令被触发");
    if (!session) {
      logger.warn("session 为空");
      return "无法获取会话信息";
    }
    logger.info(`用户 ${session.userId} 在 ${session.channelId} 触发 tof 命令`);
    logger.debug("Session elements:", JSON.stringify(session.elements));
    const verbose = options?.verbose ?? config.verbose;
    const format = config.outputFormat === "auto" ? session.platform === "qq" ? "plain" : "markdown" : config.outputFormat;
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
      const useForward = config.useForwardMessage && session.platform === "onebot";
      if (useForward) {
        const { summary, details } = formatForwardMessages(
          textToDisplay,
          searchResultsForOutput,
          result.verdict,
          result.reasoning,
          result.sources,
          result.confidence,
          result.processingTime,
          config.forwardMaxSegmentChars
        );
        const maxNodes = config.forwardMaxNodes ?? 8;
        const maxTotalChars = config.forwardMaxTotalChars ?? 3e3;
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
    const format = config.outputFormat === "auto" ? session.platform === "qq" ? "plain" : "markdown" : config.outputFormat;
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
  logger.info("isthattrue 插件已加载");
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
