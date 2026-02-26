/**
 * Prompt 模板集合
 */

import { removeCensorshipBypass } from './url'

// ============ 常量定义 ============

/** 输出格式限制 */
const OUTPUT = {
  /** 内容预览最大字符数（详细输出） */
  CONTENT_PREVIEW_MAX: 200,
  /** 内容摘要最大字符数（简要输出） */
  CONTENT_SUMMARY_MAX: 100,
  /** 搜索结果预览最大字符数 */
  FINDINGS_PREVIEW_MAX: 100,
  /** 合并转发单节点最大字符数 */
  SEGMENT_MAX_CHARS: 500,
  /** 参考来源显示最大数量 */
  MAX_SOURCES_DISPLAY: 5,
} as const

/** Agent ID 常量 */
const AGENT = {
  CHATLUNA_SEARCH: 'chatluna-search',
} as const

/** 判决结果到 Emoji 的映射 */
export const VERDICT_EMOJI: Record<string, string> = {
  true: '✅ 真实',
  false: '❌ 虚假',
  partially_true: '⚠️ 部分真实',
  uncertain: '❓ 无法确定',
}

// ============ System Prompts - 搜索 Agent ============

/**
 * 搜索 Agent 系统提示词（通用网页搜索）
 * 用于 ChatlunaSearchAgent
 */
export const SEARCH_AGENT_SYSTEM_PROMPT = `你是事实核查搜索员。搜索验证声明的相关信息。

搜索角度：官方来源、新闻报道、学术研究、社交讨论、历史背景。

输出 JSON：
\`\`\`json
{"findings":"发现摘要","sources":["来源 URL"],"supports":true/false/null,"confidence":0.0-1.0}
\`\`\`

要求：客观中立，注明来源可信度，找不到就说明。`

/**
 * 深度搜索 Agent 系统提示词（专注 X/Twitter）
 * 用于 SubSearchAgent (Grok)
 */
export const DEEP_SEARCH_AGENT_SYSTEM_PROMPT = `你是事实核查搜索员，专门使用 X (Twitter) 和网络搜索验证声明。

重点搜索：
- X (Twitter) 上的相关讨论和官方账号声明
- 新闻报道和权威媒体来源
- 社交媒体上的第一手证据

输出 JSON：
\`\`\`json
{"findings":"详细发现摘要","sources":["来源 URL"],"confidence":0.0-1.0}
\`\`\`
`

/**
 * fact_check 工具专用系统提示词
 * 用于 FactCheckTool（支持多源并行搜索）
 */
export const FACT_CHECK_TOOL_SEARCH_SYSTEM_PROMPT = `你是事实核查搜索员，专门使用 X (Twitter) 和网络搜索核查待验证内容。

重点搜索：
- X (Twitter) 上的相关讨论和官方账号消息
- 新闻报道和权威媒体来源
- 社交媒体上的第一手证据

输出 JSON：
\`\`\`json
{"findings":"详细发现摘要","sources":["来源 URL"],"confidence":0.0-1.0}
\`\`\`

输入处理规则（必须遵守）：
1. 如果输入是完整断言（例如"某人做了某事"），按事实核查流程给出支持/反驳证据。
2. 如果输入是关键词串（例如"日期 + 今日新闻 + 国际/国内/科技/娱乐"），将其视为"新闻检索任务"，直接给出当日要点摘要与来源，不要输出"这不是声明/不是事实主张"之类的元解释。
3. 无论哪种输入，都优先给出可用信息与链接，避免空泛解释。`

// ============ System Prompts - 验证 Agent ============

/**
 * 验证 Agent 系统提示词（纯文本）
 * 用于 VerifyAgent（无图片场景）
 */
export const VERIFY_AGENT_SYSTEM_PROMPT = `你是事实核查裁判。基于搜索证据做出判决。

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出 JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判 UNCERTAIN，重视权威来源，考虑时效性。`

/**
 * 验证 Agent 系统提示词（多模态）
 * 用于 VerifyAgent（包含图片场景）
 */
export const VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL = `你是事实核查裁判。基于搜索证据和图片内容做出判决。

如果消息包含图片：
- 仔细分析图片内容
- 将图片中的信息与搜索证据对比
- 判断图片是否被篡改、断章取义或误导

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出 JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判 UNCERTAIN，重视权威来源，考虑时效性。`

// ============ 图片处理 Prompt ============

/**
 * 图片 OCR 提示词
 */
export const OCR_PROMPT = `提取图片中的文字。无文字则简述图片内容。`

/**
 * 图片描述提取提示词
 * 用于纯图片输入时，提取内容供搜索使用
 */
export const IMAGE_DESCRIPTION_PROMPT = `请仔细观察这张图片，描述其中的主要内容。

重点关注：
1. 图片中是否包含可核查的声明或信息
2. 任何文字内容（标题、正文、水印等）
3. 图片展示的事件、人物或场景
4. 可能的来源或出处线索

请用简洁的中文描述，便于后续进行事实核查搜索。`

// ============ Prompt 构建函数 ============

/**
 * 构建子搜索 Agent 的请求
 */
export function buildSubSearchPrompt(claim: string): string {
  return `请验证以下声明的真实性，重点搜索 X (Twitter) 和社交媒体上的相关讨论和证据：

"${claim}"

搜索要点：
1. 在 X/Twitter 上搜索相关话题和讨论
2. 查找官方账号的声明或澄清
3. 搜索相关新闻报道
4. 注意时间线和来源可信度`
}

/**
 * fact_check 工具专用搜索请求
 */
export function buildFactCheckToolSearchPrompt(content: string): string {
  return `请处理以下输入并进行联网检索。若是断言则核查真伪；若是关键词串则按新闻检索任务产出摘要与来源。

"${content}"

执行要求：
1. 在 X/Twitter 和网页中搜索相关信息
2. 优先使用权威来源（官方通报、主流媒体、机构网站）
3. 输出精炼结论，避免讨论"输入文本本身是不是声明"
4. 返回结构化 findings + sources + confidence`
}

/**
 * 构建验证请求（支持多模态）
 */
export function buildVerifyPrompt(
  originalContent: string,
  searchResults: Array<{ perspective: string; findings: string; sources: string[] }>,
  hasImages?: boolean
): string {
  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] ${r.findings}\n来源：${r.sources.slice(0, 3).join(', ') || '无'}`)
    .join('\n\n')

  let prompt = `声明："${originalContent}"

搜索结果：
${resultsText}

`

  if (hasImages) {
    prompt += `请结合图片内容和搜索结果进行判决。注意核实图片中的信息是否与搜索结果一致。

`
  }

  prompt += `请判决。`
  return prompt
}

// ============ 辅助函数 ============

/**
 * 限制置信度在 0-1 范围内
 */
function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

/**
 * 生成置信度进度条
 */
function buildConfidenceBar(confidence: number): string {
  const clamped = clampConfidence(confidence)
  const filled = Math.round(clamped * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// ============ 输出格式化 ============

/**
 * 格式化验证结果为 Markdown 或纯文本
 */
export function formatVerificationOutput(
  content: string,
  searchResults: Array<{ agentId: string; perspective: string; findings: string }>,
  verdict: string,
  reasoning: string,
  sources: string[],
  confidence: number,
  processingTime: number,
  format: 'markdown' | 'plain' = 'markdown'
): string {
  const verdictLabel = VERDICT_EMOJI[verdict] || verdict
  const confidenceValue = Math.round(clampConfidence(confidence) * 100)
  const confidenceBar = buildConfidenceBar(confidence)

  const contentPreview = content.substring(0, OUTPUT.CONTENT_PREVIEW_MAX) +
    (content.length > OUTPUT.CONTENT_PREVIEW_MAX ? '...' : '')

  if (format === 'plain') {
    let output = `🔍 事实核查结果\n\n`
    output += `📋 待验证内容:\n${contentPreview}\n\n`
    output += `🤖 搜索发现:\n`
    output += searchResults
      .map(r => `• ${r.perspective}: ${r.findings.substring(0, OUTPUT.FINDINGS_PREVIEW_MAX)}...`)
      .join('\n')
    output += `\n\n⚖️ 最终判决：${verdictLabel}\n`
    output += `📊 可信度：${confidenceValue}%\n\n`
    output += `📝 判决依据:\n${reasoning}\n`

    if (sources.length > 0) {
      output += `\n源：\n`
      output += sources.map(s => `• ${removeCensorshipBypass(s)}`).join('\n')
      output += `\n`
    }

    output += `\n⏱️ 处理耗时：${(processingTime / 1000).toFixed(1)}秒`
    return output
  }

  // Markdown 格式
  let output = `🔍 **事实核查结果**

📋 **待验证内容:**
> ${contentPreview}

---

🤖 **搜索 Agent 结果:**
${searchResults.map(r => `• **${r.perspective}**: ${r.findings.substring(0, OUTPUT.FINDINGS_PREVIEW_MAX)}...`).join('\n')}

---

⚖️ **最终判决：${verdictLabel}**

📊 **可信度:** ${confidenceBar} ${confidenceValue}%

📝 **判决依据:**
${reasoning}
`

  if (sources.length > 0) {
    output += `
🔗 **参考来源:**
${sources.map(s => `• ${removeCensorshipBypass(s)}`).join('\n')}
`
  }

  output += `
⏱️ *处理耗时：${(processingTime / 1000).toFixed(1)}秒*`

  return output
}

/**
 * 格式化合并转发消息
 * 每个消息段限制在 OUTPUT.SEGMENT_MAX_CHARS 字符以内
 */
export function formatForwardMessages(
  content: string,
  searchResults: Array<{ agentId: string; perspective: string; findings: string }>,
  verdict: string,
  reasoning: string,
  sources: string[],
  confidence: number,
  processingTime: number,
  maxSegmentLength: number = OUTPUT.SEGMENT_MAX_CHARS
): {
  summary: string
  details: string[]
} {
  const confidenceValue = Math.round(clampConfidence(confidence) * 100)
  const verdictLabel = VERDICT_EMOJI[verdict] || verdict

  // 主消息：简要判决
  const summary = `${verdictLabel} (${confidenceValue}%)\n\n📋 ${content.substring(0, OUTPUT.CONTENT_SUMMARY_MAX)}${content.length > OUTPUT.CONTENT_SUMMARY_MAX ? '...' : ''}\n\n⏱️ ${(processingTime / 1000).toFixed(1)}秒`

  // 详情消息列表
  const details: string[] = []

  // 1. 判决理由（截断）
  const truncatedReasoning = reasoning.length > maxSegmentLength
    ? reasoning.substring(0, maxSegmentLength) + '...'
    : reasoning
  details.push(`📝 判决依据\n\n${truncatedReasoning}`)

  // 2. 各 Agent 搜索结果（截断每个）
  for (const r of searchResults) {
    let cleanFindings = r.findings

    // 移除 Chatluna Search 中可能导致超长的详情部分
    if (r.agentId === AGENT.CHATLUNA_SEARCH) {
      const summaryEndIndex = r.findings.indexOf('================================')
      if (summaryEndIndex !== -1) {
        cleanFindings = r.findings.substring(0, summaryEndIndex + 32) +
          '\n\n(搜索详情已在合并消息中省略，请查看判决依据)'
      }
    }

    const truncatedFindings = cleanFindings.length > maxSegmentLength
      ? cleanFindings.substring(0, maxSegmentLength) + '...'
      : cleanFindings

    details.push(`🔍 ${r.perspective}\n\n${truncatedFindings}`)
  }

  // 3. 参考来源（限制数量）
  if (sources.length > 0) {
    const limitedSources = sources.slice(0, OUTPUT.MAX_SOURCES_DISPLAY)
    const sourcesText = limitedSources
      .map(s => `• ${removeCensorshipBypass(s).substring(0, OUTPUT.CONTENT_SUMMARY_MAX)}`)
      .join('\n')
    const suffix = sources.length > OUTPUT.MAX_SOURCES_DISPLAY
      ? `\n... 及其他 ${sources.length - OUTPUT.MAX_SOURCES_DISPLAY} 个来源`
      : ''
    details.push(`🔗 参考来源\n\n${sourcesText}${suffix}`)
  }

  return { summary, details }
}
