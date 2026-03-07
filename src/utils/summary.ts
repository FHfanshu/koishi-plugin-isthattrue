import { ChatlunaAdapter } from '../services/chatluna'
import { withTimeout } from './async'
import { normalizeModelName } from './model'

import type { PluginConfig } from '../types'

type Ctx = any

const SUMMARY_SYSTEM_PROMPT = `你是一个精简摘要助手。你的任务是将搜索结果压缩成简短摘要，供角色扮演 AI 自然引用。
规则：
- 只保留最关键的结论、数据和来源
- 不要逐字引用原文，用自己的话概括
- 不要添加原文中没有的信息
- 输出纯文本，不要 markdown 格式
- 严格控制在目标字数内`

export function clipText(input: string, maxLength: number): string {
  const text = (input || '').trim()
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...`
}

export function resolveSummaryModel(config: PluginConfig): string {
  const explicit = normalizeModelName(config.models.summaryModel)
  if (explicit) return explicit

  const gemini = normalizeModelName(config.models.geminiModel)
  if (gemini) return gemini

  const controller = normalizeModelName(config.models.controllerModel)
  if (controller) return controller

  return ''
}

export async function maybeSummarize(
  ctx: Ctx,
  config: PluginConfig,
  text: string,
  label: string
): Promise<string> {
  const logger = ctx.logger('chatluna-fact-check')
  const maxChars = config.search.summaryMaxChars || 800

  if (!config.search.enableSummary) {
    logger.debug(`[Summary] 已禁用摘要压缩，保留原始输出: ${label}`)
    return text
  }

  if (text.length <= maxChars) {
    return text
  }

  const model = resolveSummaryModel(config)
  if (!model) {
    logger.debug(`[Summary] 无可用摘要模型，回退截断: ${label}`)
    return clipText(text, maxChars)
  }

  try {
    const adapter = new ChatlunaAdapter(ctx, config)
    const response = await withTimeout(
      adapter.chat({
        model,
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        message: `请将以下内容压缩到 ${maxChars} 字以内，保留关键结论和来源：\n\n${text}`,
      }),
      (config.search.summaryTimeout || 15) * 1000,
      `Summary(${label})`
    )

    const summary = (response.content || '').trim()
    if (!summary) {
      logger.warn(`[Summary] LLM 返回空摘要，回退截断: ${label}`)
      return clipText(text, maxChars)
    }

    logger.info(`[Summary] 摘要压缩: ${text.length} → ${summary.length} 字 (${label})`)
    return summary.length > maxChars ? summary.slice(0, maxChars) : summary
  } catch (error: any) {
    logger.warn(`[Summary] 摘要压缩失败，回退截断: ${label}: ${error?.message || error}`)
    return clipText(text, maxChars)
  }
}
