import type { ContentRule } from '@/source/types/BookSource'
import { parseString, resolveAbsoluteUrl } from './RuleParser'

export interface ContentResult {
  content: string
  nextUrl?: string
}

const HTML_BLOCK_TAG_REGEX = /<\/?(?:div|p|br|hr|h\d|article|dd|dl|li|section)[^>]*>/gi
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g
const HTML_TAG_REGEX = /<\/?[a-zA-Z][^<>]*>/g
const INVISIBLE_SPACE_REGEX = /(?:&thinsp;|&zwnj;|&zwj;|\u2009|\u200c|\u200d)/gi

/**
 * 对齐 Android 端 BookContent -> HtmlFormatter 的正文净化语义：
 * 块级标签转换为段落换行，其余 HTML 标签移除，并解码 HTML 实体。
 *
 * 在线正文最终由 ChapterContent 作为纯文本段落渲染，因此这里不能把远端
 * HTML 直接交给 v-html；除了避免标签外露，也避免把书源页面中的脚本带入阅读器。
 */
export function formatOnlineContent(rawContent: string): string {
  if (!rawContent) return ''

  const withLineBreaks = rawContent
    .replace(/(?:&nbsp;)+/gi, ' ')
    .replace(/(?:&ensp;|&emsp;)/gi, ' ')
    .replace(INVISIBLE_SPACE_REGEX, '')
    .replace(HTML_BLOCK_TAG_REGEX, '\n')
    .replace(HTML_COMMENT_REGEX, '')
    .replace(HTML_TAG_REGEX, '')

  // DOMParser 负责解码 &amp;、&#...; 等实体；textContent 不会重新执行其中的标签。
  const decoded = new DOMParser().parseFromString(withLineBreaks, 'text/html').body.textContent || ''

  return decoded
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
}

export function parseContent(html: string, rule: ContentRule, baseUrl: string): ContentResult {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')

  let content = parseString(context, rule.content || '')

  // 兜底：如果规则提取出来的正文为空或过短，尝试提取常见小说正文容器
  if (!content || content.length < 20) {
    if (!isJson && context instanceof Document) {
      const selectors = [
        '#content',
        '#chaptercontent',
        '.read-content',
        '.content-body',
        '.content',
        '#article',
        '.article-content',
        '#htmlContent',
        '.txtnav',
        '#BookText',
        '.chapter-content',
      ]
      for (const sel of selectors) {
        const el = context.querySelector(sel)
        if (el) {
          // 移除广告、无用脚本和页面操作按钮
          el.querySelectorAll('script, style, .ad, #user_ad, .page-ops, .chapter-control').forEach(ad => ad.remove())
          const pList = Array.from(el.querySelectorAll('p'))
          if (pList.length > 0) {
            content = pList.map(p => p.textContent?.trim() || '').filter(Boolean).join('\n')
          } else {
            content = el.textContent?.trim() || ''
          }
          if (content && content.length >= 20) {
            break
          }
        }
      }
    }
  }

  let nextUrl = parseString(context, rule.nextContentUrl || '')
  if (nextUrl) {
    nextUrl = resolveAbsoluteUrl(nextUrl, baseUrl)
  }

  return {
    content: formatOnlineContent(content),
    nextUrl: nextUrl || undefined,
  }
}
