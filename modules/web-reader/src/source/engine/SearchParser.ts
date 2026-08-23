import type { SearchRule, SearchResult, BookSource } from '@/source/types/BookSource'
import { parseList, parseString, resolveAbsoluteUrl, cleanBookTitle } from './RuleParser'

export function parseSearchResults(
  html: string,
  rule: SearchRule,
  baseUrl: string,
  source?: BookSource
): SearchResult[] {
  if (!rule.bookList) return []

  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const list = parseList(html, rule.bookList, isJson)

  return list
    .map(item => {
      // 1. 书名
      let name = parseString(item, rule.name || '')
      if (!name && typeof item === 'object') {
        name = parseString(item, 'h5 a || h3 a || h4 a || h2 a || h1 a || .title a || .bname a || .name || a')
      }
      name = cleanBookTitle(name)

      // 2. 书籍详情链接
      let rawBookUrl = parseString(item, rule.bookUrl || '')
      if (!rawBookUrl && typeof item === 'object') {
        rawBookUrl = parseString(item, 'h5 a@href || h3 a@href || h4 a@href || h2 a@href || .title a@href || a@href')
      }
      const finalBookUrl = resolveAbsoluteUrl(rawBookUrl, baseUrl)

      // 3. 封面
      let rawCoverUrl = parseString(item, rule.coverUrl || '')
      if (!rawCoverUrl && typeof item === 'object') {
        rawCoverUrl = parseString(item, 'img@src')
      }
      const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl)

      // 4. 作者
      let author = parseString(item, rule.author || '')
      if (!author && typeof item === 'object') {
        author = parseString(item, '.bauthor || [class*="author"] || .text-muted a || .author')
      }
      if (author.startsWith('作者：') || author.startsWith('作者:')) {
        author = author.substring(3).trim()
      }

      // 5. 简介
      let intro = parseString(item, rule.intro || '')
      if (!intro && typeof item === 'object') {
        intro = parseString(item, '.content-txt || .intro || .desc || p.l-p2 || p')
      }

      // 6. 分类与最新章节
      let kind = parseString(item, rule.kind || '')
      let lastChapter = parseString(item, rule.lastChapter || '')

      return {
        name,
        author,
        bookUrl: finalBookUrl,
        coverUrl: finalCoverUrl,
        intro,
        kind,
        lastChapter,
        sourceName: source?.bookSourceName || '',
        sourceUrl: source?.bookSourceUrl || baseUrl,
      }
    })
    .filter(b => Boolean(b.name && b.name.trim()))
}
