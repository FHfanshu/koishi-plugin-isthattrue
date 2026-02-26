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

### 模型配置

| 配置项 | 说明 | 推荐 |
|--------|------|------|
| mainModel | 主控 Agent 模型，用于编排和最终判决 | Gemini-3-Flash |
| subSearchModel | 子搜索 Agent 模型，用于深度搜索 | Grok-4-1 |

### 搜索 API 配置

| 配置项 | 说明 |
|--------|------|
| tavilyApiKey | Tavily API Key（可选） |
| chatlunaSearchModel | Chatluna Search 使用的模型（可选） |
| enableChatlunaSearch | 启用 Chatluna 搜索集成（默认关闭） |
| chatlunaSearchDiversifyModel | 搜索关键词多样化模型 |

### Agent 配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| timeout | 60000 | 单次请求超时时间（毫秒） |
| maxRetries | 2 | 失败重试次数 |

### 其他设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| verbose | false | 显示详细验证过程 |
| outputFormat | auto | 输出格式（auto/markdown/plain） |
| useForwardMessage | true | 使用合并转发消息展示详情（仅 QQ） |
| enableChatlunaTool | true | 注册为 Chatluna 工具（供 Agent 调用） |
| chatlunaToolName | fact_check | Chatluna 工具名称 |
| bypassProxy | false | 绕过系统代理 |
| logLLMDetails | false | 打印 LLM 请求详情（调试用） |

### Chatluna 工具调用

- 插件会注册一个 Chatluna 工具（默认名：`fact_check`）
- `fact_check` 实际定位为 chatluna-search 的 LLMSearch 替代
- 建议在 Chatluna `plugin`（Agent）模式下使用，让 Bot 可自动调用工具
- 在角色预设中可加入规则：遇到“真假求证/辟谣/是否属实”优先调用 `fact_check`

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
