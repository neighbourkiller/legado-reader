import type { TocRule } from '@/source/types/BookSource'
import { parseList, parseString, resolveAbsoluteUrl } from './RuleParser'

export interface TocItem {
  name: string
  url: string
}

export function parseToc(html: string, rule: TocRule, baseUrl: string): TocItem[] {
  if (!rule.chapterList) return []

  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const list = parseList(html, rule.chapterList, isJson)

  return list.map(item => {
    const rawUrl = parseString(item, rule.chapterUrl || '')
    const finalUrl = resolveAbsoluteUrl(rawUrl, baseUrl)

    return {
      name: parseString(item, rule.chapterName || ''),
      url: finalUrl,
    }
  })
}
