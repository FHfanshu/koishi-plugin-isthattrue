/**
 * Prompt 模板集合
 */

/**
 * 主控 Agent (Gemini) 编排提示词
 */
export const MAIN_AGENT_SYSTEM_PROMPT = `你是事实核查编排员。你的任务是协调核查流程。

流程：
1. 接收原始声明。
2. 调用搜索工具获取初步证据和关键链接。
3. 你的输出将作为下一步子搜索 Agent 的输入。

要求：
- 尽可能多地收集相关 URL。
- 对声明进行初步分析。`

/**
 * 子搜索 Agent (Grok) 系统提示词
 */
export const SUB_SEARCH_AGENT_SYSTEM_PROMPT = `你是事实核查搜索员，专门使用 X (Twitter) 和网络搜索验证声明。

重点搜索：
- X (Twitter) 上的相关讨论和官方账号声明
- 新闻报道和权威媒体来源
- 社交媒体上的第一手证据

输出 JSON：
\`\`\`json
{"findings":"详细发现摘要","sources":["来源URL"],"confidence":0.0-1.0}
\`\`\`
`

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
 * 搜索Agent系统提示词 (精简版)
 */
export const SEARCH_AGENT_SYSTEM_PROMPT = `你是事实核查搜索员。搜索验证声明的相关信息。

搜索角度：官方来源、新闻报道、学术研究、社交讨论、历史背景。

输出JSON：
\`\`\`json
{"findings":"发现摘要","sources":["来源URL"],"supports":true/false/null,"confidence":0.0-1.0}
\`\`\`

要求：客观中立，注明来源可信度，找不到就说明。`

/**
 * 生成搜索Agent的角度提示 (已废弃，现在每个Agent搜索所有角度)
 */
export function getSearchPerspectives(count: number): string[] {
  // 返回通用标识
  return Array.from({ length: count }, (_, i) => `搜索Agent ${i + 1}`)
}

/**
 * 搜索请求模板 (精简版)
 */
export function buildSearchPrompt(content: string, _perspective: string): string {
  return `验证声明："${content}"\n\n从多角度搜索相关证据。`
}

/**
 * 验证Agent系统提示词 (精简版)
 */
export const VERIFY_AGENT_SYSTEM_PROMPT = `你是事实核查裁判。基于搜索证据做出判决。

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判UNCERTAIN，重视权威来源，考虑时效性。`

/**
 * 构建验证请求 (精简版，支持多模态)
 */
export function buildVerifyPrompt(
  originalContent: string,
  searchResults: Array<{ perspective: string; findings: string; sources: string[] }>,
  hasImages?: boolean
): string {
  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] ${r.findings}\n来源: ${r.sources.slice(0, 3).join(', ') || '无'}`)
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

/**
 * 图片OCR提示词
 */
export const OCR_PROMPT = `提取图片中的文字。无文字则简述图片内容。`

/**
 * 图片描述提取提示词（用于纯图片输入时，提取内容供搜索使用）
 */
export const IMAGE_DESCRIPTION_PROMPT = `请仔细观察这张图片，描述其中的主要内容。

重点关注：
1. 图片中是否包含可核查的声明或信息
2. 任何文字内容（标题、正文、水印等）
3. 图片展示的事件、人物或场景
4. 可能的来源或出处线索

请用简洁的中文描述，便于后续进行事实核查搜索。`

/**
 * 验证Agent系统提示词 - 支持多模态
 */
export const VERIFY_AGENT_SYSTEM_PROMPT_MULTIMODAL = `你是事实核查裁判。基于搜索证据和图片内容做出判决。

如果消息包含图片：
- 仔细分析图片内容
- 将图片中的信息与搜索证据对比
- 判断图片是否被篡改、断章取义或误导

判决类别：TRUE(真实)、FALSE(虚假)、PARTIALLY_TRUE(部分真实)、UNCERTAIN(无法确定)

输出JSON：
\`\`\`json
{"verdict":"TRUE/FALSE/PARTIALLY_TRUE/UNCERTAIN","confidence":0.0-1.0,"reasoning":"判决理由","sources":["来源"]}
\`\`\`

原则：证据不足时判UNCERTAIN，重视权威来源，考虑时效性。`

/**
 * 输出格式化模板
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
  const verdictEmoji: Record<string, string> = {
    true: '✅ 真实',
    false: '❌ 虚假',
    partially_true: '⚠️ 部分真实',
    uncertain: '❓ 无法确定',
  }

  const confidenceValue = Math.round(confidence * 100)
  const confidenceBar = '█'.repeat(Math.round(confidence * 10)) + '░'.repeat(10 - Math.round(confidence * 10))

  if (format === 'plain') {
    let output = `🔍 事实核查结果\n\n`
    output += `📋 待验证内容:\n${content.substring(0, 200)}${content.length > 200 ? '...' : ''}\n\n`
    output += `🤖 搜索发现:\n`
    output += searchResults.map(r => `• ${r.perspective}: ${r.findings.substring(0, 100)}...`).join('\n')
    output += `\n\n⚖️ 最终判决: ${verdictEmoji[verdict] || verdict}\n`
    output += `📊 可信度: ${confidenceValue}%\n\n`
    output += `📝 判决依据:\n${reasoning}\n`

    if (sources.length > 0) {
      output += `\n源：\n`
      output += sources.map(s => `• ${s}`).join('\n')
      output += `\n`
    }

    output += `\n⏱️ 处理耗时: ${(processingTime / 1000).toFixed(1)}秒`
    return output
  }

  let output = `🔍 **事实核查结果**

📋 **待验证内容:**
> ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}

---

🤖 **搜索Agent结果:**
${searchResults.map(r => `• **${r.perspective}**: ${r.findings.substring(0, 100)}...`).join('\n')}

---

⚖️ **最终判决: ${verdictEmoji[verdict] || verdict}**

📊 **可信度:** ${confidenceBar} ${confidenceValue}%

📝 **判决依据:**
${reasoning}
`

  if (sources.length > 0) {
    output += `
🔗 **参考来源:**
${sources.map(s => `• ${s}`).join('\n')}
`
  }

  output += `
⏱️ *处理耗时: ${(processingTime / 1000).toFixed(1)}秒*`

  return output
}

/**
 * 判决emoji映射
 */
export const VERDICT_EMOJI: Record<string, string> = {
  true: '✅ 真实',
  false: '❌ 虚假',
  partially_true: '⚠️ 部分真实',
  uncertain: '❓ 无法确定',
}

/**
 * 格式化合并转发消息的各个部分
 * 每个消息段限制在500字符以内，避免触发QQ限制
 */
export function formatForwardMessages(
  content: string,
  searchResults: Array<{ agentId: string; perspective: string; findings: string }>,
  verdict: string,
  reasoning: string,
  sources: string[],
  confidence: number,
  processingTime: number
): {
  summary: string
  details: string[]
} {
  const MAX_SEGMENT_LENGTH = 500
  const MAX_SOURCES = 5
  const confidenceValue = Math.round(confidence * 100)

  // 主消息：简要判决
  const summary = `${VERDICT_EMOJI[verdict] || verdict} (${confidenceValue}%)\n\n📋 ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n⏱️ ${(processingTime / 1000).toFixed(1)}秒`

  // 详情消息列表
  const details: string[] = []

  // 1. 判决理由（截断）
  const truncatedReasoning = reasoning.length > MAX_SEGMENT_LENGTH
    ? reasoning.substring(0, MAX_SEGMENT_LENGTH) + '...'
    : reasoning
  details.push(`📝 判决依据\n\n${truncatedReasoning}`)

  // 2. 各Agent搜索结果（截断每个）
  for (const r of searchResults) {
    // 移除 Chatluna Search 中可能导致超长的详情部分，只保留摘要
    let cleanFindings = r.findings
    if (r.agentId === 'chatluna-search') {
      const summaryEndIndex = r.findings.indexOf('================================')
      if (summaryEndIndex !== -1) {
        // 保留到统计摘要结束，再加一点后续内容
        cleanFindings = r.findings.substring(0, summaryEndIndex + 32) + '\n\n(搜索详情已在合并消息中省略，请查看判决依据)'
      }
    }

    const truncatedFindings = cleanFindings.length > MAX_SEGMENT_LENGTH
      ? cleanFindings.substring(0, MAX_SEGMENT_LENGTH) + '...'
      : cleanFindings
    details.push(`🔍 ${r.perspective}\n\n${truncatedFindings}`)
  }

  // 3. 参考来源（限制数量）
  if (sources.length > 0) {
    const limitedSources = sources.slice(0, MAX_SOURCES)
    const sourcesText = limitedSources.map(s => `• ${s.substring(0, 100)}`).join('\n')
    const suffix = sources.length > MAX_SOURCES ? `\n... 及其他 ${sources.length - MAX_SOURCES} 个来源` : ''
    details.push(`🔗 参考来源\n\n${sourcesText}${suffix}`)
  }

  return { summary, details }
}
