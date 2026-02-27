# koishi-plugin-chatluna-fact-check

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatluna-fact-check?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chatluna-fact-check)

事实核查插件，提供两个核心工具：
- `fact_check`：快速搜索聚合（默认）
- `deep_search`：迭代式深度搜索（可选）

## 安装

```bash
npm install koishi-plugin-chatluna-fact-check
```

## 最小配置

```yaml
chatluna-fact-check:
  api:
    apiKeys:
      - [ollama, '', 'https://ollama.com/api/web_search', true]
  factCheck:
    enableChatlunaSearch: false
    chatlunaSearchModel: ''
    chatlunaSearchDiversifyModel: ''
    timeout: 60000
    maxRetries: 2
    proxyMode: follow-global
    proxyAddress: ''
    logLLMDetails: false
  agent:
    enable: true
    enableQuickTool: true
    quickToolName: fact_check
    grokModel: x-ai/grok-4-1
  deepSearch:
    enable: false
```

## API Key / Base URL 对照表

推荐优先在 `api.apiKeys` 表格中集中填写（来源 / key / base url / 启用开关）。

| key | base url | 说明 |
|---|---|---|
| `api.apiKeys` 中 `provider=ollama` 的 `apiKey` | `api.apiKeys` 中 `provider=ollama` 的 `baseUrl` | 统一填写 Ollama 凭据（唯一入口）；key 留空再回退 `OLLAMA_API_KEY` |
| `N/A`（`factCheck.enableChatlunaSearch`） | `N/A` | 依赖 `chatluna-search-service` 内部配置，不在本插件配置 API key |

## FactCheck 配置

`factCheck` 负责核查流程的运行参数：
- Chatluna 搜索模型：`factCheck.chatlunaSearchModel`
- 搜索关键词多样化：`factCheck.chatlunaSearchDiversifyModel`
- 搜索集成开关：`factCheck.enableChatlunaSearch`
- 超时与重试：`factCheck.timeout` / `factCheck.maxRetries`
- 代理与调试：`factCheck.proxyMode` / `factCheck.proxyAddress` / `factCheck.logLLMDetails`

### Gemini 搜索模型要求

`factCheck.chatlunaSearchModel`（及 `agent.geminiModel`）填写 Gemini 模型时，**必须满足以下条件**，否则会报 `Cannot read properties of undefined (reading 'model')` 错误：

1. **使用 Gemini 适配器**（`koishi-plugin-chatluna-gemini-adapter`），不可使用 OpenAI 兼容中转。
2. **Gemini 适配器内仅开启**以下两项联网工具，其余工具（如代码执行等）关闭：
   - `Google Search`（网络搜索）
   - `URL context`（URL 内容读取）

> 原因：`chatluna-search-service` 的 `web_search` 工具在 `summaryType` 为 `balanced` 时需要向 LLM 发送 configurable，若适配器或工具配置不兼容，configurable 解析的 `model` 字段会为 undefined 导致崩溃。Gemini 原生适配器 + 仅开启搜索类工具可规避此问题。

## 搜索源上下文注入

### 1) `fact_check` 追加上下文（仅附加参考，不改变最终判定）

- Chatluna Search：`agent.appendChatlunaSearchContext` + `agent.chatlunaSearchContext*`
- Ollama Search：`agent.appendOllamaSearchContext` + `agent.ollamaSearchContext*`

触发条件与失败行为：
- 开关为 `true` 且依赖可用才会执行
- 超时或调用失败会“跳过该上下文”，不会中断 `fact_check`

### 2) `deep_search` 迭代来源

- `deepSearch.useChatlunaSearchTool`：调用 `web_search`
- `api.apiKeys` 中启用 `ollama` 行：允许 DeepSearch 调用 Ollama Search

失败行为：
- 工具调用失败时回退到模型搜索
- 若来源整体不可用，最终报告会降置信度并提示来源不足

## DeepSearch（可选）

推荐配置：

```yaml
chatluna-fact-check:
  deepSearch:
    enable: true
    controllerModel: google/gemini-3-flash
    maxIterations: 3
    perIterationTimeout: 30000
    useChatlunaSearchTool: true
```

## 调试与排障

- `factCheck.proxyMode`：排障建议先设为 `direct`
- `factCheck.logLLMDetails`：仅排障时打开

## License

MIT
