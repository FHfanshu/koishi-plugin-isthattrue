# koishi-plugin-chatluna-fact-check

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatluna-fact-check?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chatluna-fact-check)

事实核查插件 - 使用多 Agent LLM 架构验证消息真实性

## 功能特点

- 多 Agent 协作：主控 Agent 编排任务，子搜索 Agent 并行检索
- 多搜索源支持：Grok/Tavily/可选模型，并支持 `fact_check` 工具模式
- 支持文本和图片内容（OCR 识别）
- 可引用消息进行核查
- 输出判定结果：TRUE / FALSE / PARTIALLY_TRUE / UNCERTAIN

## 安装

```bash
npm install koishi-plugin-chatluna-fact-check
```

## 依赖

- [koishi-plugin-chatluna](https://github.com/ChatLunaLab/chatluna) - LLM 服务接入

## 使用方法

```
tof [内容]        # 核查指定内容
tof               # 引用一条消息后使用，核查被引用的消息
```

别名：`鉴定`、`核查`

## 配置说明

插件配置分为两个模块：`tof`（命令模式）和 `agent`（工具模式）。

---

### Tof 命令配置 (`tof`)

#### 基础设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `model` | `google/gemini-3-flash` | 判决模型，用于最终事实判定 |
| `searchModel` | `x-ai/grok-4-1` | 搜索模型，用于深度信息检索 |
| `timeout` | `60000` | 单次请求超时时间（毫秒） |
| `maxRetries` | `2` | 失败重试次数 |

#### 搜索集成

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `tavilyApiKey` | `””` | Tavily API Key（可选，用于补充搜索） |
| `chatlunaSearchModel` | `””` | Chatluna Search 使用的模型（可选；若 `chatluna-search-service` 不稳定可留空，改用 `fact_check` 工具） |
| `enableChatlunaSearch` | `false` | 启用 Chatluna 搜索集成（建议关闭，优先使用 `fact_check` 工具作为 LLMSearch 替代） |
| `chatlunaSearchDiversifyModel` | `””` | 搜索关键词多样化模型（可选，推荐 Gemini 2.5 Flash Lite） |

#### 输出格式

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `outputFormat` | `auto` | 输出格式：`auto`（QQ 自动纯文本）/ `markdown` / `plain` |
| `useForwardMessage` | `true` | 使用合并转发消息展示详情（仅 QQ 平台支持） |
| `forwardMaxNodes` | `8` | 合并转发最大节点数，超过则回退普通消息（`0` 表示直接回退） |
| `forwardMaxTotalChars` | `3000` | 合并转发总字符数上限，超过则回退普通消息（`0` 表示直接回退） |
| `forwardMaxSegmentChars` | `500` | 合并转发单节点字符数上限 |
| `verbose` | `false` | 显示详细验证过程（进度提示） |

#### 调试

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `proxyMode` | `follow-global` | HTTP 代理模式：`follow-global`（遵循全局代理）/ `direct`（直连）/ `custom`（自定义代理） |
| `proxyAddress` | `""` | 自定义 HTTP 代理地址（仅 `custom` 生效） |
| `logLLMDetails` | `false` | 打印 LLM 请求体和响应详情（Debug 用） |

说明：`proxyMode` 影响本插件通过 `ctx.http` 发起的请求（如 Tavily 与图片下载）。LLM 调用仍由 chatluna 主插件管理并遵循其代理策略。

---

### Agent 工具配置 (`agent`)

#### Fact Check 工具

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enable` | `true` | 开启：注册事实核查为 Chatluna 可调用工具 |
| `enableDeepTool` | `true` | 注册多源深度搜索工具 `fact_check` |
| `enableQuickTool` | `true` | 额外注册 Gemini 快速搜索工具 |
| `name` | `fact_check` | 多源深度搜索工具名称（建议用于疑难场景） |
| `quickToolName` | `fact_check_web` | Gemini 快速搜索工具名称（建议用于日常场景） |
| `description` | *(见下文)* | 多源深度搜索工具描述 |
| `quickToolDescription` | *(见下文)* | Gemini 快速搜索工具描述 |
| `maxInputChars` | `1200` | 单次输入文本最大字符数 |
| `maxSources` | `5` | 返回来源链接数量上限 |
| `quickToolModel` | `””` | Gemini 快速搜索模型（留空时回退 geminiModel/chatlunaSearchModel） |
| `quickToolTimeout` | `15000` | Gemini 快速搜索超时（毫秒） |

多源深度搜索工具描述默认值：
> 用于 LLM 网络搜索（作为 chatluna-search 的 LLMSearch 替代）。输入待核查文本，返回多源搜索结果与来源链接（可配置 Grok/Gemini/ChatGPT/DeepSeek），由上层 Agent 自行判断。

Gemini 快速搜索工具描述默认值：
> 用于快速网络搜索（Gemini 单源）。输入待核查文本，快速返回来源与摘要，适合日常场景。

#### 多源搜索配置

当 Agent 调用 `fact_check` 工具时，可启用多源并行搜索：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enableMultiSourceSearch` | `true` | 启用多源并行搜索 |
| `searchUseGrok` | `true` | 多源搜索包含 Grok |
| `searchUseGemini` | `true` | 多源搜索包含 Gemini（需模型支持搜索工具） |
| `searchUseChatgpt` | `false` | 多源搜索包含 ChatGPT（需模型支持搜索工具） |
| `searchUseDeepseek` | `false` | 多源搜索包含 DeepSeek（需模型支持搜索工具） |
| `grokModel` | `””` | Grok 来源模型（留空时回退 `searchModel`） |
| `geminiModel` | `””` | Gemini 来源模型（留空则跳过 Gemini 来源） |
| `chatgptModel` | `””` | ChatGPT 来源模型（留空则跳过 ChatGPT 来源） |
| `deepseekModel` | `””` | DeepSeek 来源模型（留空则跳过 DeepSeek 来源） |
| `perSourceTimeout` | `45000` | 多源模式下每个来源的独立超时时间（毫秒） |
| `fastReturnMinSuccess` | `2` | 多源模式达到该成功来源数后提前返回 |
| `fastReturnMaxWaitMs` | `12000` | 多源模式最大等待时长（毫秒），达到后提前返回 |
| `maxFindingsChars` | `2000` | 输出中每个来源 findings 的最大字符数 |

---

### Chatluna 工具调用指南

- 插件默认注册两个 Chatluna 工具：
  - `fact_check_web`：Gemini 单源快速搜索（低延迟，日常优先）
  - `fact_check`：多源深度搜索（Grok/Gemini 等，疑难再用）
- 建议在 Chatluna **Agent 模式**下使用，让 Bot 自动调用工具
- 在角色预设中加入规则示例：
  > 遇到用户提出”真假求证””辟谣””是否属实”等问题时，先调用 `fact_check_web`；若证据冲突、来源不足或涉及 X/Twitter，再调用 `fact_check` 获取多源深度证据


## 工作流程

1. 用户发送 `tof` 命令（可引用消息或直接输入内容）
2. MessageParser 提取文本和图片，如有图片则进行 OCR
3. 主控 Agent 分析内容，生成搜索计划
4. 子搜索 Agent 并行执行多源搜索
5. 主控 Agent 综合搜索结果，输出最终判定

## 架构

```
src/
├── index.ts              # 插件入口，注册 tof 命令
├── config.ts             # 配置 Schema
├── types.ts              # TypeScript 类型定义
├── agents/
│   ├── mainAgent.ts      # 主控 Agent（编排 + 判决）
│   └── subSearchAgent.ts # 子搜索 Agent（多源检索）
├── services/
│   ├── chatluna.ts       # Chatluna LLM 适配器
│   ├── chatlunaSearch.ts # Chatluna Search 集成
│   ├── messageParser.ts  # 消息解析（文本/图片）
│   └── tavily.ts         # Tavily 搜索
└── utils/
    └── prompts.ts        # LLM Prompt 模板
```

## License

MIT
