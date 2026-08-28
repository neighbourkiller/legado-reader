import type { SearchRule, SearchResult, BookSource } from '@/source/types/BookSource'
import { parseListAsync, parseStringAsync, resolveAbsoluteUrl, cleanBookTitle } from './RuleParser'
import type { RuleExecutionContext } from './RuleTypes'

export async function parseSearchResults(
  html: string,
  rule: SearchRule,
  baseUrl: string,
  source?: BookSource,
  options?: Partial<RuleExecutionContext>,
): Promise<SearchResult[]> {
  if (!rule.bookList) return []

  const baseContext: Partial<RuleExecutionContext> = {
    ...options,
    compatibilityMode: options?.compatibilityMode || source?.webReaderCompatibilityMode || 'legado',
    stage: 'search', baseUrl, source: source as unknown as Record<string, unknown>,
  }
  const field = (name: string) => ({ ...baseContext, field: `ruleSearch.${name}` })
  const list = await parseListAsync(html, rule.bookList, field('bookList'))

  const results = await Promise.all(list.map(async item => {
      // 1. 书名
      let name = await parseStringAsync(item, rule.name || '', field('name'))
      if (!name && typeof item === 'object') {
        name = await parseStringAsync(item, 'h5 a || h3 a || h4 a || h2 a || h1 a || .title a || .bname a || .name || a', field('name.fallback'))
      }
      name = cleanBookTitle(name)

      // 2. 书籍详情链接
      let rawBookUrl = await parseStringAsync(item, rule.bookUrl || '', field('bookUrl'))
      if (!rawBookUrl && typeof item === 'object') {
        rawBookUrl = await parseStringAsync(item, 'h5 a@href || h3 a@href || h4 a@href || h2 a@href || .title a@href || a@href', field('bookUrl.fallback'))
      }
      const finalBookUrl = resolveAbsoluteUrl(rawBookUrl, baseUrl)

      // 3. 封面
      let rawCoverUrl = await parseStringAsync(item, rule.coverUrl || '', field('coverUrl'))
      if (!rawCoverUrl && typeof item === 'object') {
        rawCoverUrl = await parseStringAsync(item, 'img@src', field('coverUrl.fallback'))
      }
      const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl)

      // 4. 作者
      let author = await parseStringAsync(item, rule.author || '', field('author'))
      if (!author && typeof item === 'object') {
        author = await parseStringAsync(item, '.bauthor || [class*="author"] || .text-muted a || .author', field('author.fallback'))
      }
      if (author.startsWith('作者：') || author.startsWith('作者:')) {
        author = author.substring(3).trim()
      }

      // 5. 简介
      let intro = await parseStringAsync(item, rule.intro || '', field('intro'))
      if (!intro && typeof item === 'object') {
        intro = await parseStringAsync(item, '.content-txt || .intro || .desc || p.l-p2 || p', field('intro.fallback'))
      }

      // 6. 分类与最新章节
      const kind = await parseStringAsync(item, rule.kind || '', field('kind'))
      const lastChapter = await parseStringAsync(item, rule.lastChapter || '', field('lastChapter'))
      const updateTime = await parseStringAsync(item, rule.updateTime || '', field('updateTime'))
      const wordCount = await parseStringAsync(item, rule.wordCount || '', field('wordCount'))

      return {
        name,
        author,
        bookUrl: finalBookUrl,
        coverUrl: finalCoverUrl,
        intro,
        kind,
        lastChapter,
        updateTime,
        wordCount,
        sourceName: source?.bookSourceName || '',
        sourceUrl: source?.bookSourceUrl || baseUrl,
        variableMap: baseContext.variables ? Object.fromEntries(baseContext.variables) : undefined,
      }
    }))
  return results.filter(book => Boolean(book.name && book.name.trim()))
}
