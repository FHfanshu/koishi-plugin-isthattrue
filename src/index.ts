import { Context, h } from 'koishi'
import path from 'node:path'
import { Config } from './config'
import { MainAgent } from './agents'
import { MessageParser } from './services/messageParser'
import { ChatlunaAdapter } from './services/chatluna'
import { registerFactCheckTool } from './services/factCheckTool'
import { registerDeepSearchTool } from './services/deepSearchTool'
import { formatVerificationOutput, formatForwardMessages } from './utils/prompts'
import { Verdict } from './types'

export const name = 'chatluna-fact-check'
export const inject = {
  required: ['chatluna'],
  optional: ['console'],
}
export const usage = `
## Chatluna Fact Check

用于消息事实核查与 Agent 搜索工具扩展，支持普通核查与迭代式 DeepSearch。

### 功能概览

1. **Tof 命令核查**
: 在聊天中直接使用 \`tof\` / \`tof.quick\` 对文本与图片进行事实核查。
2. **Fact Check 工具**
: 默认注册 \`fact_check\`（快速检索）；可选注册 legacy 多源深搜工具（默认关闭）。
3. **DeepSearch 工具（可选）**
: 注册 \`deep_search\`，由主控模型进行多轮计划-执行-评估迭代，支持 \`web_search\`、\`browser\`、\`searxng\`。

### 架构流程

默认核查流程：
1. 解析输入（引用消息、当前消息、图片）
2. 执行证据搜索（Chatluna Search / Grok / Tavily）
3. 由判决模型输出结论

启用 DeepSearch 后：
1. 主控模型生成本轮搜索计划
2. 并行执行多条查询（工具或模型）
3. 主控模型评估结果是否充分
4. 继续迭代或综合输出最终报告

### 命令用法

1. **引用核查**
: 引用消息后发送 \`tof\`
2. **详细过程**
: \`tof -v\`
3. **快速文本核查**
: \`tof.quick 这里输入待核查文本\`

### 工具用法（供 ChatLuna Agent / Character 调用）

- \`fact_check\`
: 快速网络搜索工具（原 \`fact_check_web\` 职责），返回 findings + sources，不做最终裁决。
- \`fact_check_deep\`（legacy，可选）
: 原多源深搜工具，默认关闭，建议由 \`deep_search\` 替代。
- \`deep_search\`
: 迭代式深度搜索，返回综合摘要、关键发现、来源与结论。

### 配置说明

1. **\`tof\`**
: 命令模式配置（判决模型、搜索模型、输出格式、代理、日志）。
2. **\`agent\`**
: 工具模式配置（工具注册、来源开关、并发超时、快速返回策略）。
3. **\`deepSearch\`**
: DeepSearch 配置（主控模型、迭代轮数、停止阈值、工具开关、SearXNG 参数）。

### DeepSearch 关键配置项

- \`deepSearch.enable\`：启用迭代式 DeepSearch 与 \`deep_search\` 工具注册
- \`deepSearch.controllerModel\`：主控模型（规划 / 评估 / 综合）
- \`deepSearch.maxIterations\`：最大迭代轮数
- \`deepSearch.perIterationTimeout\`：单轮超时（ms）
- \`deepSearch.useChatlunaSearchTool\`：允许使用 \`web_search\`
- \`deepSearch.usePuppeteerBrowser\`：允许使用 \`browser\`
- \`deepSearch.useSearXNG\`：启用 SearXNG 元搜索
- \`deepSearch.searXNGApiBase\`：SearXNG 地址（如 \`http://127.0.0.1:8080\`）
- \`deepSearch.searXNGEngines\`：搜索引擎（逗号分隔）
- \`deepSearch.searXNGCategories\`：分类（逗号分隔）
- \`deepSearch.searXNGNumResults\`：返回条数

### 示例配置（DeepSearch + SearXNG）

\`\`\`yaml
chatluna-fact-check:
  tof:
    model: google/gemini-3-flash
    searchModel: x-ai/grok-4-1
    enableChatlunaSearch: true
  agent:
    enable: true
    enableDeepTool: false
    enableQuickTool: true
  deepSearch:
    enable: true
    controllerModel: google/gemini-3-flash
    maxIterations: 3
    perIterationTimeout: 30000
    useChatlunaSearchTool: true
    usePuppeteerBrowser: false
    useSearXNG: true
    searXNGApiBase: http://127.0.0.1:8080
    searXNGEngines: google,bing,duckduckgo
    searXNGCategories: general,news
    searXNGNumResults: 10
\`\`\`

### 依赖检查清单

- 已启用 \`koishi-plugin-chatluna\`
- 已启用 \`koishi-plugin-chatluna-search-service\`（若使用 \`web_search\` / \`browser\`）
- 已安装并可访问 \`koishi-plugin-puppeteer\`（若使用 \`browser\`）
- 若启用 SearXNG：实例可访问（如本地 \`http://127.0.0.1:8080\`）
- 若使用 Character 自动工具：预设中 \`toolCalling: true\`

### 判决说明

- ✅ **真实**：证据支持原内容
- ❌ **虚假**：证据明确反驳原内容
- ⚠️ **部分真实**：仅部分内容可被证据支持
- ❓ **无法确定**：证据不足或证据冲突
`

export { Config } from './config'
const import_meta = {} as { url?: string }

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('chatluna-fact-check')
  const messageParser = new MessageParser(ctx, {
    imageTimeoutMs: Math.min(config.tof.timeout, 30000),
    maxImageBytes: 8 * 1024 * 1024,
    tofConfig: config.tof,
  })

  // 注册 Chatluna 工具
  registerFactCheckTool(ctx, config)
  registerDeepSearchTool(ctx, config)

  // 注入控制台前端入口（与 affinity 同款注入方式）
  ctx.inject(['console'], (innerCtx) => {
    const consoleService = (innerCtx as any).console
    const packageBase = path.resolve(ctx.baseDir, 'node_modules/koishi-plugin-chatluna-fact-check')
    const browserEntry = import_meta.url
      ? import_meta.url.replace(/\/src\/[^/]+$/, '/client/index.ts')
      : path.resolve(__dirname, '../client/index.ts')
    const entry = process.env.KOISHI_BASE
      ? [process.env.KOISHI_BASE + '/dist/index.js']
      : process.env.KOISHI_ENV === 'browser'
        ? [browserEntry]
        : {
          dev: path.resolve(packageBase, 'client/index.ts'),
          prod: path.resolve(packageBase, 'dist'),
        }
    consoleService?.addEntry?.(entry)
  })

  // 注册 tof 指令
  ctx.command('tof', '验证消息的真实性')
    .alias('真假')
    .alias('事实核查')
    .alias('factcheck')
    .option('verbose', '-v 显示详细过程')
    .action(async ({ session, options }) => {
      logger.info('tof 命令被触发')
      if (!session) {
        logger.warn('session 为空')
        return '无法获取会话信息'
      }
      logger.info(`用户 ${session.userId} 在 ${session.channelId} 触发 tof 命令`)
      logger.debug('Session elements:', JSON.stringify(session.elements))

      const verbose = options?.verbose ?? config.tof.verbose
      const format = config.tof.outputFormat === 'auto'
        ? (session.platform === 'qq' ? 'plain' : 'markdown')
        : config.tof.outputFormat

      // 1. 检查 Chatluna 服务
      const chatluna = new ChatlunaAdapter(ctx, config)
      if (!chatluna.isAvailable()) {
        return '❌ Chatluna 服务不可用，请确保已安装并启用 koishi-plugin-chatluna'
      }

      // 2. 解析消息内容 (优先引用，其次是当前消息)
      const content = await messageParser.parseSession(session)
      if (!content || (!content.text && content.images.length === 0)) {
        return '❌ 请提供需要验证的内容\n\n使用方法:\n1. 引用一条消息后发送 tof\n2. 直接发送 tof [文本或图片]'
      }

      // 3. 发送处理中提示
      if (verbose) {
        await session.send('🔍 正在验证消息真实性，请稍候...')
      }

      try {
        // 4. 发送图片处理提示
        if (content.images.length > 0 && verbose) {
          await session.send('📷 正在处理图片内容...')
        }

        // 5. 执行验证 (使用主控 Agent，内部处理图片)
        const mainAgent = new MainAgent(ctx, config)
        const result = await mainAgent.verify(content)

        // 用于输出的文本（优先使用原始文本，纯图片时显示"图片内容"）
        const textToDisplay = content.text.trim() || '[图片内容]'

        // 6. 格式化并发送输出
        const searchResultsForOutput = result.searchResults.map(r => ({
          agentId: r.agentId,
          perspective: r.perspective,
          findings: r.findings,
        }))

        // 检查是否使用合并转发（仅支持 OneBot 协议）
        const useForward = config.tof.useForwardMessage && session.platform === 'onebot'

        if (useForward) {
          // 使用合并转发消息
          const { summary, details } = formatForwardMessages(
            textToDisplay,
            searchResultsForOutput,
            result.verdict,
            result.reasoning,
            result.sources,
            result.confidence,
            result.processingTime,
            config.tof.forwardMaxSegmentChars
          )

          const maxNodes = config.tof.forwardMaxNodes ?? 8
          const maxTotalChars = config.tof.forwardMaxTotalChars ?? 3000
          const totalChars = details.reduce((sum, detail) => sum + detail.length, 0)

          if (maxNodes <= 0 || maxTotalChars <= 0 || details.length > maxNodes || totalChars > maxTotalChars) {
            logger.warn(`合并转发内容过长，回退普通消息: nodes=${details.length}/${maxNodes}, chars=${totalChars}/${maxTotalChars}`)
            const output = formatVerificationOutput(
              textToDisplay,
              searchResultsForOutput,
              result.verdict,
              result.reasoning,
              result.sources,
              result.confidence,
              result.processingTime,
              format as 'markdown' | 'plain'
            )
            return output
          }

          // 构建转发消息节点
          const forwardNodes = details.map(detail =>
            h('message', { nickname: '事实核查', userId: session.selfId }, detail)
          )

          // 发送主消息
          let summarySent = false
          try {
            await session.send(summary)
            summarySent = true
          } catch (sendSummaryError) {
            logger.warn('发送摘要失败，将尝试回退由 Koishi 发送:', sendSummaryError)
          }

          // 尝试发送合并转发，失败则回退到普通消息
          try {
            await session.send(h('message', { forward: true }, forwardNodes))
          } catch (forwardError) {
            logger.warn('合并转发发送失败，回退到普通消息:', forwardError)
            // 回退：逐条发送详情
            for (const detail of details) {
              try {
                await session.send(detail)
              } catch (detailError) {
                logger.warn('回退详情发送失败，已忽略:', detailError)
              }
            }
            if (!summarySent) {
              return summary
            }
          }
          return
        }

        // 普通输出
        const output = formatVerificationOutput(
          textToDisplay,
          searchResultsForOutput,
          result.verdict,
          result.reasoning,
          result.sources,
          result.confidence,
          result.processingTime,
          format as 'markdown' | 'plain'
        )

        return output

      } catch (error) {
        logger.error('验证过程出错:', error)
        return `❌ 验证过程发生错误: ${(error as Error).message}`
      }
    })

  // 注册快速验证指令（简化输出）
  ctx.command('tof.quick <text:text>', '快速验证文本真实性')
    .action(async ({ session }, text) => {
      if (!session) return '无法获取会话信息'
      if (!text?.trim()) return '请提供需要验证的文本'

      const format = config.tof.outputFormat === 'auto'
        ? (session.platform === 'qq' ? 'plain' : 'markdown')
        : config.tof.outputFormat

      const chatluna = new ChatlunaAdapter(ctx, config)
      if (!chatluna.isAvailable()) {
        return '❌ Chatluna 服务不可用'
      }

      await session.send('🔍 快速验证中...')

      try {
        const mainAgent = new MainAgent(ctx, config)
        const result = await mainAgent.verify({ text, images: [], hasQuote: false })

        const verdictEmoji: Record<string, string> = {
          [Verdict.TRUE]: '✅ 真实',
          [Verdict.FALSE]: '❌ 虚假',
          [Verdict.PARTIALLY_TRUE]: '⚠️ 部分真实',
          [Verdict.UNCERTAIN]: '❓ 无法确定',
        }

        const confidenceValue = Math.round(result.confidence * 100)
        const reasoning = result.reasoning.substring(0, 200)

        if (format === 'plain') {
          return `${verdictEmoji[result.verdict]} (${confidenceValue}%)\n${reasoning}`
        }

        return `**${verdictEmoji[result.verdict]}** (${confidenceValue}%)\n\n${reasoning}`

      } catch (error) {
        return `❌ 验证失败: ${(error as Error).message}`
      }
    })

  logger.info('chatluna-fact-check 插件已加载')
}
