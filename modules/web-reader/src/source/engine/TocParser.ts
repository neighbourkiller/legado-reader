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

  return list
    .map(item => {
      // 1. 提取章节链接
      let rawUrl = parseString(item, rule.chapterUrl || '')
      if (!rawUrl && typeof item === 'object' && item !== null) {
        if (typeof (item as any).getAttribute === 'function') {
          const directHref = (item as Element).getAttribute('href')
          if (directHref) {
            rawUrl = directHref
          }
        }
        if (!rawUrl && typeof (item as any).querySelector === 'function') {
          const aEl = (item as Element).querySelector('a') || (item as Element).querySelector('[href]')
          if (aEl) {
            rawUrl = aEl.getAttribute('href') || ''
          }
        }
      }
      const finalUrl = resolveAbsoluteUrl(rawUrl, baseUrl)

      // 2. 提取章节名称
      let name = parseString(item, rule.chapterName || '')
      if (!name && typeof item === 'object' && item !== null) {
        if (typeof (item as any).querySelector === 'function') {
          const aEl = (item as Element).querySelector('a')
          name = aEl?.textContent?.trim() || (item as Element).textContent?.trim() || ''
        } else if ((item as any).textContent) {
          name = String((item as any).textContent).trim()
        }
      }

      return {
        name: name.trim(),
        url: finalUrl,
      }
    })
    .filter(item => Boolean(item.name && item.url))
}
