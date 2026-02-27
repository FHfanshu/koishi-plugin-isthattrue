/**
 * 截断文本到指定长度，自动规范化空白字符
 * @param text 原始文本
 * @param maxChars 最大字符数
 * @param emptyFallback 空文本时的回退值（默认 ''）
 */
export function truncate(
  text: string,
  maxChars: number,
  emptyFallback = ''
): string {
  const normalized = (text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return emptyFallback
  return normalized.length > maxChars
    ? `${normalized.substring(0, maxChars)}...`
    : normalized
}
