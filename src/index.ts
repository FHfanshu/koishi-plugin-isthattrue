import { Context } from 'koishi'
import path from 'node:path'
import { Config } from './config'
import { registerFactCheckTool } from './services/factCheckTool'
import { registerDeepSearchTool } from './services/deepSearchTool'

export const name = 'chatluna-fact-check'
export const inject = {
  required: ['chatluna'],
  optional: ['console'],
}

export const usage = `
## ⚠️ 推荐配置：异步结果汇总模型

配置 \`agent.asyncResultSummaryModel\`（如 \`CA-cs-gemini/gemini-3-flash\`）后，\`fact_check\` 工具异步完成时会先将多源搜索结果整合为自然语言，再发送到会话，**避免直接向 QQ 推送原始搜索数据**。留空则直接发送原始结果。

---

## Chatluna Fact Check

用于消息事实核查与 Agent 搜索工具扩展，核心工具：
- \`fact_check\`：默认快速核查
- \`deep_search\`：迭代式深搜（可选）
  - 同名异步模式（默认开启）：传入 JSON
    - \`{"action":"submit","claim":"..."}\`
    - \`{"action":"status","taskId":"..."}\`
    - \`{"action":"result","taskId":"..."}\`

### 异步模式（推荐开启）

\`agent.asyncMode = true\`（默认）时，\`fact_check\` 和 \`deep_search\` 工具会：
1. **立即返回** "任务已在后台启动" 提示，不阻塞 LLM 对话
2. **后台执行** 搜索/核查流程
3. **完成后自动推送** 结果到当前会话

这样可以 **规避 chatluna-character 的 180 秒锁超时**。  
如果 session 不可用（非 chatluna-character 调用），会自动回退到同步模式。

### 快速上手

1. 在控制台打开本插件配置页，进入 **Ollama 配置**。  
2. 填写 \`api.ollamaApiKey\`（从 ollama.com 获取），其余留默认即可。  
3. 在 **FactCheck 基础** 中确认 \`agent.enable=true\`、\`agent.enableQuickTool=true\`，工具名保持 \`fact_check\`。  
4. 在 **FactCheck 运行配置** 中确认代理模式与调试选项。  
5. 首次使用建议先关闭 \`deepSearch.enable\`，先验证 \`fact_check\` 能稳定返回结果；需要迭代深搜时再开启。  

### 关键配置

- \`api.ollamaApiKey\`：Ollama API Key（唯一必填项）
- \`api.ollamaBaseUrl\`：Ollama Base URL（留空使用默认地址）
- \`factCheck\`：核查模型、搜索模型、超时、重试、代理与调试
- \`agent.asyncMode\`：异步模式开关（默认开启，规避锁超时）
- \`agent.appendChatlunaSearchContext\` / \`agent.appendOllamaSearchContext\`：给 \`fact_check\` 追加上下文（仅补充，不改判定）
- \`deepSearch.enable\`：启用 \`deep_search\`

### Gemini 搜索模型要求

\`factCheck.chatlunaSearchModel\`（或 \`agent.geminiModel\`）填写 Gemini 模型时，**必须同时满足以下两个条件**，否则调用时会报错：

1. **使用 Gemini 原生适配器**（\`koishi-plugin-chatluna-gemini-adapter\`）——不可使用 OpenAI 兼容中转。
2. **该 Gemini 适配器内仅开启两项联网工具**，其余全部关闭：
   - ✅ \`Google Search\`（网络搜索）
   - ✅ \`URL context\`（URL 内容读取）

> 如未满足上述条件，会报 \`TypeError: Cannot read properties of undefined (reading 'model')\` 并导致搜索失败。

### 排障提示

- Docker 场景下，Base URL 必须是 **Koishi 容器可达地址**
- 遇到 \`Lock timeout after 180000ms\` 错误时，确认 \`agent.asyncMode=true\`
- Gemini 搜索报 \`Cannot read properties of undefined (reading 'model')\`：检查是否使用了 Gemini 原生适配器，以及适配器中仅开启了 Google Search 和 URL context 两项工具
`

export { Config } from './config'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('chatluna-fact-check')
  if (!config || typeof config !== 'object') {
    logger.error('插件配置为空或无效，已跳过加载。请在 koishi.yml 中检查 chatluna-fact-check 配置。')
    return
  }

  // 注册 Chatluna 工具
  registerFactCheckTool(ctx, config)
  registerDeepSearchTool(ctx, config)

  // 注入控制台前端入口（与 affinity 同款注入方式）
  ctx.inject(['console'], (innerCtx) => {
    const consoleService = (innerCtx as any).console
    const packageBase = path.resolve(ctx.baseDir, 'node_modules/koishi-plugin-chatluna-fact-check')
    const entry = process.env.KOISHI_BASE
      ? [process.env.KOISHI_BASE + '/dist/index.js']
      : process.env.KOISHI_ENV === 'browser'
        ? [path.resolve(__dirname, '../client/index.ts')]
        : {
            dev: path.resolve(packageBase, 'client/index.ts'),
            prod: path.resolve(packageBase, 'dist'),
          }
    consoleService?.addEntry?.(entry)
  })

  logger.info('chatluna-fact-check 插件已加载')
}
