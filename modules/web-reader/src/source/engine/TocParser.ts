import type { TocRule } from '@/source/types/BookSource'
import { parseListAsync, parseStringAsync, resolveAbsoluteUrl } from './RuleParser'
import type { RuleExecutionContext } from './RuleTypes'

export interface TocItem {
  name: string
  url: string
  isVolume?: boolean
  isVip?: boolean
  isPay?: boolean
  updateTime?: string
  variableMap?: Record<string, string>
}

export function isLegadoTrue(val: string | null | undefined, nullIsTrue = false): boolean {
  if (!val || !val.trim() || val.trim().toLowerCase() === 'null') {
    return nullIsTrue
  }
  return !/^(?:false|no|not|0|0\.0)$/i.test(val.trim())
}

export async function parseToc(
  html: string,
  rule: TocRule,
  baseUrl: string,
  options?: Partial<RuleExecutionContext>,
): Promise<TocItem[]> {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')

  const field = (name: string) => ({ ...options, stage: 'toc' as const, baseUrl, field: `ruleToc.${name}` })
  const rawChapters = await parseListAsync(context, rule.chapterList || '', field('chapterList'))

  const result = await Promise.all(
    rawChapters.map(async (item) => {
      // 1. 提取章节链接
      let chapterUrl = await parseStringAsync(item, rule.chapterUrl || '', field('chapterUrl'))
      if (!chapterUrl && item instanceof Element) {
        chapterUrl = item.getAttribute('href') || item.querySelector('a')?.getAttribute('href') || ''
      }
      const finalUrl = resolveAbsoluteUrl(chapterUrl, baseUrl)

      // 2. 提取章节名称
      let name = await parseStringAsync(item, rule.chapterName || '', field('chapterName'))
      if (!name && item instanceof Element) {
        const aEl = item.querySelector('a')
        name = aEl?.textContent?.trim() || item.textContent?.trim() || ''
      }
      if (rule.formatJs?.trim()) {
        name = await parseStringAsync(name, `@js:${rule.formatJs}`, field('formatJs'))
      }

      const isVolumeStr = rule.isVolume?.trim() ? await parseStringAsync(item, rule.isVolume, field('isVolume')) : undefined
      const isVipStr = rule.isVip?.trim() ? await parseStringAsync(item, rule.isVip, field('isVip')) : undefined
      const isPayStr = rule.isPay?.trim() ? await parseStringAsync(item, rule.isPay, field('isPay')) : undefined

      return {
        name: name.trim(),
        url: finalUrl,
        isVolume: isLegadoTrue(isVolumeStr),
        isVip: isLegadoTrue(isVipStr),
        isPay: isLegadoTrue(isPayStr),
        updateTime: await parseStringAsync(item, rule.updateTime || '', field('updateTime')) || undefined,
        variableMap: baseVariableMap(options),
      }
    }))
  return result.filter(item => Boolean(item.name && item.url))
}

function baseVariableMap(options?: Partial<RuleExecutionContext>): Record<string, string> | undefined {
  return options?.variables ? Object.fromEntries(options.variables) : undefined
}
