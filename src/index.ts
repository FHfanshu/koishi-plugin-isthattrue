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
- \`fact_check\`：默认快速核查（Grok + Gemini 双源并行）
- \`deep_search\`：迭代式深搜（可选）
  - 任务模式：传入 JSON
    - \`{"action":"submit","claim":"..."}\`
    - \`{"action":"status","taskId":"..."}\`
    - \`{"action":"result","taskId":"..."}\`

---

### 快速上手

1. 在控制台打开本插件配置页，进入 **Grok 搜索配置**。
2. 确认 \`grokWebSearch.apiBaseUrl\` 指向本地 grok2api 地址（默认 \`http://127.0.0.1:28000/v1\`）。
3. 在 **Jina Reader 配置** 中填写 \`jina.apiKey\`（留空将自动回退免费层）。
4. 在 **FactCheck 基础 → Fact Check 工具** 中确认 \`enable=true\`、\`enableQuickTool=true\`。
5. 首次使用建议先关闭 \`deepSearch.enable\`，验证 \`fact_check\` 稳定后再开启 DeepSearch。

### 配置分组一览

| 分组 | 说明 |
|---|---|
| **Grok 搜索配置** | grok2api Base URL、超时 |
| **Jina Reader 配置** | Jina API Key、超时 |
| **FactCheck 基础 → Fact Check 工具** | 工具注册、搜索模型、输入上限 |
| **FactCheck 基础 → 搜索配置** | 多源并行搜索模型与参数 |
| **DeepSearch → 迭代搜索** | 异步任务、主控模型、迭代轮数、置信度阈值 |
| **调试与排障** | 重试、代理模式、调试日志 |

### 关键配置

- \`factCheck.grokModel\`：Grok 搜索模型（如 \`Grok2api/grok-4.1-fast\`）
- \`factCheck.geminiModel\`：Gemini 搜索模型（如 \`cs-gemini/gemini-3-flash\`）
- \`grokWebSearch.apiBaseUrl\`：grok2api 本地地址
- \`jina.apiKey\`：Jina Reader API Key（可选，留空走免费层）
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

- Docker 场景下，grok2api Base URL 必须是 **Koishi 容器可达地址**
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
