/**
 * URL 处理工具
 */

/**
 * 在 URL 中间或末尾插入 '、' 以规避审查
 */
export function injectCensorshipBypass(text: string): string {
  // 匹配 URL 的正则
  const urlRegex = /(https?:\/\/[^\s]+)/g

  return text.replace(urlRegex, (url) => {
    // 如果 URL 较长，在中间插入
    if (url.length > 20) {
      const mid = Math.floor(url.length / 2)
      return url.slice(0, mid) + '、' + url.slice(mid)
    }
    // 否则在末尾插入
    return url + '、'
  })
}

/**
 * 移除文本中所有的 '、' 符号
 */
export function removeCensorshipBypass(text: string): string {
  return text.replace(/、/g, '')
}
