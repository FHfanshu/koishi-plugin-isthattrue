/**
 * 将各种格式的搜索结果归一化为数组
 */
export function normalizeResultItems(searchResult: any): any[] {
  if (!searchResult) return []

  if (Array.isArray(searchResult)) {
    return searchResult
  }

  if (typeof searchResult === 'string') {
    try {
      const parsed = JSON.parse(searchResult)
      return normalizeResultItems(parsed)
    } catch {
      return [{ description: searchResult }]
    }
  }

  if (typeof searchResult === 'object') {
    if (Array.isArray(searchResult.results)) return searchResult.results
    if (Array.isArray(searchResult.items)) return searchResult.items
    if (Array.isArray(searchResult.data)) return searchResult.data
    if (
      searchResult.url ||
      searchResult.title ||
      searchResult.description ||
      searchResult.content
    ) {
      return [searchResult]
    }
  }

  return []
}
