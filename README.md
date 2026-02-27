# koishi-plugin-chatluna-fact-check

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatluna-fact-check?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chatluna-fact-check)

事实核查插件，提供两个核心工具：
- `fact_check`：快速搜索聚合（默认）
- `deep_search`：迭代式深度搜索（可选）

## 安装

```bash
npm install koishi-plugin-chatluna-fact-check
```

## FactCheck 基础

建议新用户先启用 `fact_check`，确认流程通畅后再启用 `deep_search`。

最小配置：

```yaml
chatluna-fact-check:
  agent:
    enable: true
    enableQuickTool: true
    quickToolName: fact_check
  deepSearch:
    enable: false
```

## 搜索源上下文注入

### 1) `fact_check` 追加上下文（仅附加参考，不改变最终判定）

- Chatluna Search：`agent.appendChatlunaSearchContext` + `agent.chatlunaSearchContext*`
- Ollama Search：`agent.appendOllamaSearchContext` + `agent.ollamaSearchContext*`

触发条件与失败行为：
- 开关为 `true` 且依赖可用才会执行
- 超时或调用失败会“跳过该上下文”，不会中断 `fact_check`

### 2) `deep_search` 迭代来源

- `deepSearch.useChatlunaSearchTool`：调用 `web_search`
- `deepSearch.useSearXNG`：调用 SearXNG
- `deepSearch.searchUseOllama`：调用 Ollama Search

失败行为：
- 工具调用失败时回退到模型搜索
- 若来源整体不可用，最终报告会降置信度并提示来源不足

## API Key / Base URL 对照表

推荐优先在 `api.apiKeys` 表格中集中填写（来源 / key / base url / 启用开关）。

| key | base url | 说明 |
|---|---|---|
| `api.apiKeys` 中 `provider=ollama` 的 `apiKey` | `api.apiKeys` 中 `provider=ollama` 的 `baseUrl` | 统一填写 Ollama 凭据（推荐）；`agent/deepSearch` 同名字段可单独覆盖；key 留空再回退 `OLLAMA_API_KEY` |
| `N/A` | `api.apiKeys` 中 `provider=searxng` 的 `baseUrl` | 统一 SearXNG Base URL（推荐）；`deepSearch.searXNGApiBase` 可单独覆盖；需保证 `/search?format=json` 返回 200 |
| `N/A`（`tof.enableChatlunaSearch`） | `N/A` | 依赖 `chatluna-search-service` 内部配置，不在本插件配置 API key |

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
    useSearXNG: true
    searXNGApiBase: http://192.168.110.38:8080
```

Docker 注意事项：
- `searXNGApiBase` / `ollamaSearchApiBase` 必须填写 **Koishi 容器可达地址**
- 先在 Koishi 容器内自检：

```bash
docker exec -it koishi sh -lc "curl -i 'http://192.168.110.38:8080/search?q=test&format=json'"
```

## Tof（可选）

命令模式：

```text
tof
tof -v
tof.quick 这里输入待核查文本
```

如果你主要通过 Chatluna Agent/Character 调工具，可将 Tof 视为次要入口。

## 调试与排障

- `tof.proxyMode`：排障建议先设为 `direct`
- `tof.logLLMDetails`：仅排障时打开
- `fact_check_deep`：legacy 工具，默认关闭，建议由 `deep_search` 替代

## License

MIT
