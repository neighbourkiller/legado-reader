import type { BookInfoRule } from '@/source/types/BookSource'
import { parseString, resolveAbsoluteUrl, cleanBookTitle } from './RuleParser'

export interface BookInfo {
  name: string
  author: string
  coverUrl: string
  intro: string
  tocUrl: string
}

export function parseBookInfo(html: string, rule: BookInfoRule, baseUrl: string): BookInfo {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')

  // 1. 目录链接
  let rawTocUrl = parseString(context, rule.tocUrl || '')
  if (!rawTocUrl && !isJson && context instanceof Document) {
    rawTocUrl = parseString(
      context,
      'a[href*="chapter"]@href || a[href*="mulu"]@href || a:contains("目录")@href || a:contains("章节")@href'
    )
  }
  const finalTocUrl = resolveAbsoluteUrl(rawTocUrl, baseUrl)

  // 2. 封面图片 (支持多重常见 meta/DOM 标签兜底)
  let rawCoverUrl = parseString(context, rule.coverUrl || '')
  if (!rawCoverUrl && !isJson && context instanceof Document) {
    rawCoverUrl = parseString(
      context,
      'meta[property="og:image"]@content || meta[name="twitter:image"]@content || img.lazyload_book_cover@src || img.lazyload_book_cover@data-src || .fengmian2@src || .fengmian2@data-src || .cover img@src || .book-cover img@src || img@src'
    )
  }
  const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl)

  // 3. 书名
  let name = parseString(context, rule.name || '')
  if (!name && !isJson && context instanceof Document) {
    name = parseString(context, 'h1 || meta[property="og:title"]@content || .title || .book-name')
  }
  name = cleanBookTitle(name)

  // 4. 作者
  let author = parseString(context, rule.author || '')
  if (!author && !isJson && context instanceof Document) {
    author = parseString(context, 'meta[property="og:novel:author"]@content || .author || [class*="author"]')
  }
  if (author.startsWith('作者：') || author.startsWith('作者:')) {
    author = author.substring(3).trim()
  }

  // 5. 简介
  let intro = parseString(context, rule.intro || '')
  if (!intro && !isJson && context instanceof Document) {
    intro = parseString(context, 'meta[property="og:description"]@content || .content-txt || .intro || .desc')
  }

  return {
    name,
    author,
    coverUrl: finalCoverUrl,
    intro,
    tocUrl: finalTocUrl,
  }
}
