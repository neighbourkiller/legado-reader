import type { BookInfoRule } from '@/source/types/BookSource'
import { parseString, resolveAbsoluteUrl } from './RuleParser'

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

  const rawTocUrl = parseString(context, rule.tocUrl || '')
  const finalTocUrl = resolveAbsoluteUrl(rawTocUrl, baseUrl)

  const rawCoverUrl = parseString(context, rule.coverUrl || '')
  const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl)

  return {
    name: parseString(context, rule.name || ''),
    author: parseString(context, rule.author || ''),
    coverUrl: finalCoverUrl,
    intro: parseString(context, rule.intro || ''),
    tocUrl: finalTocUrl,
  }
}
