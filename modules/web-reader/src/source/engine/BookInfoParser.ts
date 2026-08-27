import type { BookInfoRule } from '@/source/types/BookSource'
import { parseStringAsync, resolveAbsoluteUrl, cleanBookTitle } from './RuleParser'
import type { RuleExecutionContext } from './RuleTypes'

export interface BookInfo {
  name: string
  author: string
  coverUrl: string
  intro: string
  tocUrl: string
}

export async function parseBookInfo(
  html: string,
  rule: BookInfoRule,
  baseUrl: string,
  options?: Partial<RuleExecutionContext>,
): Promise<BookInfo> {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')

  // 1. 目录链接
  const field = (name: string) => ({ ...options, stage: 'bookInfo' as const, baseUrl, field: `ruleBookInfo.${name}` })
  let rawTocUrl = await parseStringAsync(context, rule.tocUrl || '', field('tocUrl'))
  if (!rawTocUrl && !isJson && context instanceof Document) {
    rawTocUrl = await parseStringAsync(
      context,
      'a[href*="chapter"]@href || a[href*="mulu"]@href || a:contains("目录")@href || a:contains("章节")@href',
      field('tocUrl.fallback'),
    )
  }
  const finalTocUrl = resolveAbsoluteUrl(rawTocUrl, baseUrl)

  // 2. 封面图片 (支持多重常见 meta/DOM 标签兜底)
  let rawCoverUrl = await parseStringAsync(context, rule.coverUrl || '', field('coverUrl'))
  if (!rawCoverUrl && !isJson && context instanceof Document) {
    rawCoverUrl = await parseStringAsync(
      context,
      'meta[property="og:image"]@content || meta[name="twitter:image"]@content || img.lazyload_book_cover@src || img.lazyload_book_cover@data-src || .fengmian2@src || .fengmian2@data-src || .cover img@src || .book-cover img@src || img@src',
      field('coverUrl.fallback'),
    )
  }
  const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl)

  // 3. 书名
  let name = await parseStringAsync(context, rule.name || '', field('name'))
  if (!name && !isJson && context instanceof Document) {
    name = await parseStringAsync(context, 'h1 || meta[property="og:title"]@content || .title || .book-name', field('name.fallback'))
  }
  name = cleanBookTitle(name)

  // 4. 作者
  let author = await parseStringAsync(context, rule.author || '', field('author'))
  if (!author && !isJson && context instanceof Document) {
    author = await parseStringAsync(context, 'meta[property="og:novel:author"]@content || .author || [class*="author"]', field('author.fallback'))
  }
  if (author.startsWith('作者：') || author.startsWith('作者:')) {
    author = author.substring(3).trim()
  }

  // 5. 简介
  let intro = await parseStringAsync(context, rule.intro || '', field('intro'))
  if (!intro && !isJson && context instanceof Document) {
    intro = await parseStringAsync(context, 'meta[property="og:description"]@content || .content-txt || .intro || .desc', field('intro.fallback'))
  }

  return {
    name,
    author,
    coverUrl: finalCoverUrl,
    intro,
    tocUrl: finalTocUrl,
  }
}
