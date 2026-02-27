import type { FactCheckConfig } from '../config';
/**
 * 根据 factCheck 代理模式解析 proxyAgent 参数
 *
 * - 'follow-global': 返回 undefined，不覆盖全局代理设置
 * - 'direct': 返回空字符串 ''，指示请求层绕过全局代理
 * - 'custom': 返回自定义代理地址，无有效地址时回退 undefined
 */
export declare function resolveProxyAgent(factCheck: FactCheckConfig): string | undefined;
