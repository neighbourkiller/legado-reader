import { Converter } from 'opencc-js'
import type { ChineseConversion } from '@/parsers/types'
import type { ChapterPayload } from '@/stores/reading'
import { resolveTextAnchor } from '@/utils/textSelection'

const converters: Partial<Record<Exclude<ChineseConversion, 'original'>, (text: string) => string>> = {}

export function convertChineseText(text: string, mode: ChineseConversion): string {
  if (mode === 'original' || !text) return text
  const converter = converters[mode] ??= mode === 'simplified'
    ? Converter({ from: 't', to: 'cn' })
    : Converter({ from: 'cn', to: 't' })
  return converter(text)
}

function convertHtmlText(html: string, mode: ChineseConversion): string {
  const template = document.createElement('template')
  template.innerHTML = html
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.parentElement?.closest('script, style, code, pre')) {
      node.data = convertChineseText(node.data, mode)
    }
  }
  return template.innerHTML
}

// 只派生显示内容，原始章节与缓存保留原文；HTML 属性和插图地址不参与转换。
export function convertChapterChinese(payload: ChapterPayload, mode: ChineseConversion): ChapterPayload {
  if (mode === 'original') return payload
  let content = payload.content
  if (payload.format === 'epub') {
    content = convertHtmlText(Array.isArray(content) ? content.join('') : content as string, mode)
  } else if (payload.format === 'txt') {
    content = Array.isArray(content)
      ? (content as string[]).map(text => /^<img\s/i.test(text.trim()) ? text : convertChineseText(text, mode))
      : convertChineseText(content as string, mode)
  }
  return { ...payload, title: convertChineseText(payload.title, mode), content }
}

// 书签和划线可能保存在另一种字形下，统一字形后仍按原字符偏移定位。
export function resolveChineseTextAnchor(fullText: string, text: string, preferredStart: number) {
  const exact = resolveTextAnchor(fullText, text, preferredStart)
  if (exact) return exact
  const normalized = convertChineseText(fullText, 'simplified')
  if (normalized.length !== fullText.length) return null
  return resolveTextAnchor(normalized, convertChineseText(text, 'simplified'), preferredStart)
}
