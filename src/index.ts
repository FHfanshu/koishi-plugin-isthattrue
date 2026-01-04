import { Context, Schema, h } from 'koishi'
import { Config } from './config'
import { MainAgent } from './agents'
import { MessageParser } from './services/messageParser'
import { ChatlunaAdapter } from './services/chatluna'
import { formatVerificationOutput, formatForwardMessages } from './utils/prompts'
import { Verdict } from './types'

export const name = 'isthattrue'
export const inject = ['chatluna']
export const usage = `
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
`

export { Config } from './config'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('isthattrue')
  const messageParser = new MessageParser(ctx)

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

      const verbose = options?.verbose ?? config.verbose
      const format = config.outputFormat === 'auto'
        ? (session.platform === 'qq' ? 'plain' : 'markdown')
        : config.outputFormat

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
        const useForward = config.useForwardMessage && session.platform === 'onebot'

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
            config.forwardMaxSegmentChars
          )

          const maxNodes = config.forwardMaxNodes ?? 8
          const maxTotalChars = config.forwardMaxTotalChars ?? 3000
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

      const format = config.outputFormat === 'auto'
        ? (session.platform === 'qq' ? 'plain' : 'markdown')
        : config.outputFormat

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

  logger.info('isthattrue 插件已加载')
}
