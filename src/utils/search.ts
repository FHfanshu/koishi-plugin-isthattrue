import type { SearchResultItem } from '../types'

export function normalizeResultItems(searchResult: unknown): SearchResultItem[] {
  if (!searchResult) return []

  if (Array.isArray(searchResult)) {
    return searchResult as SearchResultItem[]
  }

  if (typeof searchResult === 'string') {
    try {
      const parsed = JSON.parse(searchResult)
      return normalizeResultItems(parsed)
    } catch {
      return [{ description: searchResult }]
    }
  }

  if (typeof searchResult === 'object' && searchResult) {
    const record = searchResult as Record<string, unknown>

    if (Array.isArray(record.results)) return record.results as SearchResultItem[]
    if (Array.isArray(record.items)) return record.items as SearchResultItem[]
    if (Array.isArray(record.data)) return record.data as SearchResultItem[]

    if (record.url || record.title || record.description || record.content) {
      return [record as SearchResultItem]
    }
  }

  return []
}
