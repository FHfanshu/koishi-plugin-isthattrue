import path from 'node:path'

import type { Context } from 'koishi'

import { Config } from './config'
import type { PluginConfig } from './types'
import { registerDeepSearchTool } from './services/deepSearchTool'
import { registerFactCheckTool } from './services/factCheckTool'

export const name = 'chatluna-fact-check'

export const inject = {
  required: ['chatluna'],
  optional: ['console', 'chatluna_character'],
} as const

export const usage = `
## Chatluna Fact Check

用于消息事实核查与 Agent 搜索工具扩展，核心工具：
- \`fact_check\`：默认快速核查
- \`deep_search\`：迭代式深搜（可选）
  - 任务模式：传入 JSON
    - \`{"action":"submit","claim":"..."}\`
    - \`{"action":"status","taskId":"..."}\`
    - \`{"action":"result","taskId":"..."}\`

---

### 快速上手

1. 在控制台打开本插件配置页，进入 **Ollama 配置**。
2. 填写 \`api.ollamaApiKey\`（从 ollama.com 获取），其余留默认即可。
3. 在 **FactCheck 基础 → Fact Check 工具** 中确认 \`enable=true\`、\`enableQuickTool=true\`，工具名保持 \`fact_check\`。
4. 在 **FactCheck 基础 → 搜索配置** 中配置多源搜索模型与上下文注入选项。
5. 在 **调试与排障** 中确认超时、重试、代理模式与调试选项。
6. 首次使用建议先关闭 \`deepSearch.enable\`，先验证 \`fact_check\` 能稳定返回结果；需要迭代深搜时再开启。

### 配置分组一览

| 分组 | 说明 |
|---|---|
| **Ollama 配置** | API Key、Base URL、启用开关 |
| **FactCheck 基础 → Fact Check 工具** | 工具注册、快速搜索模型、输入上限 |
| **FactCheck 基础 → 搜索配置** | 多源并行搜索模型与参数（FactCheck/DeepSearch 共用）、搜索源上下文注入 |
| **DeepSearch → 迭代搜索** | 异步任务、主控模型、迭代轮数、置信度阈值 |
| **DeepSearch → Chatluna 搜索集成** | web_search / browser 工具集成开关 |
| **调试与排障** | 重试、代理模式、调试日志 |

### 关键配置

- \`api.ollamaApiKey\`：Ollama API Key（唯一必填项）
- \`api.ollamaBaseUrl\`：Ollama Base URL（留空使用默认地址）
- \`factCheck.enableMultiSourceSearch\`：启用多源并行搜索
- \`factCheck.appendChatlunaSearchContext\` / \`factCheck.appendOllamaSearchContext\`：给 \`fact_check\` 追加上下文（仅补充，不改判定）
- \`deepSearch.enable\`：启用 \`deep_search\`

---

### Gemini 搜索模型要求

\`factCheck.geminiModel\` 填写 Gemini 模型时，**必须同时满足以下两个条件**，否则调用时会报错：

1. **使用 Gemini 原生适配器**（\`koishi-plugin-chatluna-gemini-adapter\`）——不可使用 OpenAI 兼容中转。
2. **该 Gemini 适配器内仅开启两项联网工具**，其余全部关闭：
   - ✅ \`Google Search\`（网络搜索）
   - ✅ \`URL context\`（URL 内容读取）

> 如未满足上述条件，会报 \`TypeError: Cannot read properties of undefined (reading 'model')\` 并导致搜索失败。

### 排障提示

- Docker 场景下，Base URL 必须是 **Koishi 容器可达地址**
- Gemini 搜索报 \`Cannot read properties of undefined (reading 'model')\`：检查是否使用了 Gemini 原生适配器，以及适配器中仅开启了 Google Search 和 URL context 两项工具
`

export function apply(ctx: Context, config: PluginConfig): void {
  const logger = ctx.logger('chatluna-fact-check')

  if (!config || typeof config !== 'object') {
    logger.error('插件配置为空或无效，已跳过加载。请在 koishi.yml 中检查 chatluna-fact-check 配置。')
    return
  }

  registerFactCheckTool(ctx as any, config)
  registerDeepSearchTool(ctx as any, config)

  ctx.inject(['console'], (innerCtx) => {
    const packageBase = path.resolve(ctx.baseDir, 'node_modules/koishi-plugin-chatluna-fact-check')
    const entry = process.env.KOISHI_BASE
      ? [`${process.env.KOISHI_BASE}/dist/index.js`]
      : process.env.KOISHI_ENV === 'browser'
        ? [path.resolve(__dirname, '../client/index.ts')]
        : {
            dev: path.resolve(packageBase, 'client/index.ts'),
            prod: path.resolve(packageBase, 'dist'),
          }

    ;(innerCtx as any).console?.addEntry?.(entry as any)
  })

  logger.info('chatluna-fact-check 插件已加载')
}

export { Config }
