import { Context } from 'koishi';
import { Config } from './config';
export declare const name = "chatluna-fact-check";
export declare const inject: {
    required: string[];
    optional: string[];
};
export declare const inject2: {
    chatluna: {
        required: boolean;
    };
    console: {
        required: boolean;
    };
};
export declare const usage = "\n## Chatluna Fact Check\n\n\u7528\u4E8E\u6D88\u606F\u4E8B\u5B9E\u6838\u67E5\u4E0E Agent \u641C\u7D22\u5DE5\u5177\u6269\u5C55\uFF0C\u6838\u5FC3\u5DE5\u5177\uFF1A\n- `fact_check`\uFF1A\u9ED8\u8BA4\u5FEB\u901F\u6838\u67E5\n- `deep_search`\uFF1A\u8FED\u4EE3\u5F0F\u6DF1\u641C\uFF08\u53EF\u9009\uFF09\n  - \u540C\u540D\u5F02\u6B65\u6A21\u5F0F\uFF08\u9ED8\u8BA4\u5F00\u542F\uFF09\uFF1A\u4F20\u5165 JSON\n    - `{\"action\":\"submit\",\"claim\":\"...\"}`\n    - `{\"action\":\"status\",\"taskId\":\"...\"}`\n    - `{\"action\":\"result\",\"taskId\":\"...\"}`\n\n### \u5FEB\u901F\u4E0A\u624B\n\n1. \u5728\u63A7\u5236\u53F0\u6253\u5F00\u672C\u63D2\u4EF6\u914D\u7F6E\u9875\uFF0C\u5148\u8FDB\u5165 **API Key / Base URL \u5BF9\u7167\u8868**\u3002  \n2. \u5728 `api.apiKeys` \u8868\u683C\u4E2D\u6DFB\u52A0\u6765\u6E90\uFF08\u5982 Ollama\u3001SearXNG\uFF09\uFF0C\u586B\u5199\u5BF9\u5E94 key \u548C\u5730\u5740\uFF0C\u5E76\u542F\u7528\u3002  \n3. \u5728 **FactCheck \u57FA\u7840** \u4E2D\u786E\u8BA4 `agent.enable=true`\u3001`agent.enableQuickTool=true`\uFF0C\u5DE5\u5177\u540D\u4FDD\u6301 `fact_check`\u3002  \n4. \u9996\u6B21\u4F7F\u7528\u5EFA\u8BAE\u5148\u5173\u95ED `deepSearch.enable`\uFF0C\u5148\u9A8C\u8BC1 `fact_check` \u80FD\u7A33\u5B9A\u8FD4\u56DE\u7ED3\u679C\u3002  \n5. \u9700\u8981\u8FED\u4EE3\u6DF1\u641C\u65F6\u518D\u5F00\u542F `deepSearch.enable`\u3002  \n\n### \u5173\u952E\u914D\u7F6E\n\n- `api.apiKeys`\uFF1A\u7EDF\u4E00\u7BA1\u7406 API Key / Base URL\n- `agent.appendChatlunaSearchContext` / `agent.appendOllamaSearchContext`\uFF1A\u7ED9 `fact_check` \u8FFD\u52A0\u4E0A\u4E0B\u6587\uFF08\u4EC5\u8865\u5145\uFF0C\u4E0D\u6539\u5224\u5B9A\uFF09\n- `deepSearch.enable`\uFF1A\u542F\u7528 `deep_search`\n- `deepSearch.useSearXNG` + `deepSearch.searXNGApiBase`\uFF1A\u542F\u7528\u5E76\u914D\u7F6E SearXNG\n- `tof` \u4E3A\u53EF\u9009\u547D\u4EE4\u5165\u53E3\uFF08`tof` / `tof.quick`\uFF09\n\n### \u6392\u969C\u63D0\u793A\n\n- Docker \u573A\u666F\u4E0B\uFF0CBase URL \u5FC5\u987B\u662F **Koishi \u5BB9\u5668\u53EF\u8FBE\u5730\u5740**\n- SearXNG \u9700\u4FDD\u8BC1 `/search?format=json` \u8FD4\u56DE 200\n- `fact_check_deep` \u4E3A legacy \u5DE5\u5177\uFF0C\u9ED8\u8BA4\u5173\u95ED\n";
export { Config } from './config';
export declare function apply(ctx: Context, config: Config): void;
