import type { BookSource, SearchResult } from '@/source/types/BookSource'

/** 与书源管理的分组分隔规则一致，空字符串单独表示未分组。 */
export function getSearchSourceGroups(source: BookSource): string[] {
  const groups = source.bookSourceGroup?.split(/[,;，；]/).map(group => group.trim()).filter(Boolean) ?? []
  return groups.length > 0 ? groups : ['']
}

/** 精准搜索仅保留完整书名或作者相同的结果，忽略首尾空白和大小写。 */
export function matchesExactSearch(result: SearchResult, keyword: string): boolean {
  const query = keyword.trim().toLowerCase()
  return [result.name, result.author].some(value => value?.trim().toLowerCase() === query)
}
