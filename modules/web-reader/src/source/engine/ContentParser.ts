import type { ContentRule, ImageChapterPayload, ImageReference } from '@/source/types/BookSource'
import { parseListAsync, parseStringAsync, resolveAbsoluteUrl } from './RuleParser'
import type { RuleExecutionContext } from './RuleTypes'

export interface ContentResult {
  content: string
  nextUrl?: string
  nextUrls?: string[]
  title?: string
  subContent?: string
  embeddedImages?: ImageReference[]
}

const HTML_BLOCK_TAG_REGEX = /<\/?(?:div|p|br|hr|h\d|article|dd|dl|li|section)[^>]*>/gi
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g
const HTML_TAG_REGEX = /<\/?[a-zA-Z][^<>]*>/g
const INVISIBLE_SPACE_REGEX = /(?:&thinsp;|&zwnj;|&zwj;|\u2009|\u200c|\u200d)/gi

/**
 * 对齐 Android 端 BookContent -> HtmlFormatter.formatKeepImg 的正文净化语义：
 * 块级标签转换为段落换行，剥除非 <img> 的其他 HTML 标签，并解码 HTML 实体。
 * 对于 <img> 标签，保留并在段落中以规范的 <img src="..."> 形式呈现，实现原位图文混排。
 */
export function formatOnlineContent(rawContent: string, baseUrl?: string): string {
  if (!rawContent) return ''

  // 1. 提取并保留合法 <img> 标签，将相对地址转绝对地址并转为占位标识
  const imgPlaceholders: string[] = []
  const imgRegex = /<img\s+[^>]*?(?:src|data-src|data-original)=["']([^"']+)["'][^>]*?>/gi

  const withImgTokens = rawContent.replace(imgRegex, (_, src: string) => {
    const absUrl = resolveAbsoluteUrl(src, baseUrl)
    if (!absUrl) return ''
    const token = `__LEGADO_INLINE_IMG_${imgPlaceholders.length}__`
    imgPlaceholders.push(`<img src="${absUrl}" />`)
    return `\n${token}\n`
  })

  // 2. 块级标签转换行，其余 HTML 标签清理
  const withLineBreaks = withImgTokens
    .replace(/(?:&nbsp;)+/gi, ' ')
    .replace(/(?:&ensp;|&emsp;)/gi, ' ')
    .replace(INVISIBLE_SPACE_REGEX, '')
    .replace(HTML_BLOCK_TAG_REGEX, '\n')
    .replace(HTML_COMMENT_REGEX, '')
    .replace(HTML_TAG_REGEX, '')

  // 3. DOMParser 负责解码 HTML 实体
  const decoded = new DOMParser().parseFromString(withLineBreaks, 'text/html').body.textContent || ''

  // 4. 分行并还原内嵌图片段落
  return decoded
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/\n+/)
    .map(line => {
      const trimmed = line.trim()
      const match = trimmed.match(/^__LEGADO_INLINE_IMG_(\d+)__$/)
      if (match) {
        return imgPlaceholders[Number(match[1])] || ''
      }
      return trimmed
    })
    .filter(Boolean)
    .join('\n')
}

export async function parseContent(
  html: string,
  rule: ContentRule,
  baseUrl: string,
  options?: Partial<RuleExecutionContext>,
): Promise<ContentResult> {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')

  const field = (name: string) => ({ ...options, stage: 'content' as const, baseUrl, field: `ruleContent.${name}` })
  let content = await parseStringAsync(context, rule.content || '', field('content'))
  const subContent = await parseStringAsync(context, rule.subContent || '', field('subContent'))
  const title = await parseStringAsync(context, rule.title || '', field('title'))
  let selectedImageValues: unknown[] = []
  if (!isJson && rule.content && !/@(?:js|webjs):/i.test(rule.content)) {
    const containerRule = rule.content.split('##')[0]!
      .replace(/@(text|textNodes|ownText|html|all)$/i, '')
    if (containerRule.trim()) selectedImageValues = await parseListAsync(context, containerRule, field('content.images'))
  }

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

  let nextUrl: string | undefined
  let nextUrls: string[] | undefined

  if (rule.nextContentUrl?.trim()) {
    const list = await parseListAsync(context, rule.nextContentUrl, field('nextContentUrl'))
    const candidates = list
      .map(item => typeof item === 'string' ? item : item instanceof Element ? item.getAttribute('href') || item.textContent || '' : '')
      .flatMap(str => str.split(/[\r\n]+/))
      .map(str => str.trim())
      .filter(Boolean)
      .map(u => resolveAbsoluteUrl(u, baseUrl))
      .filter((u, i, arr) => arr.indexOf(u) === i)

    if (candidates.length > 1) {
      nextUrls = candidates
      nextUrl = candidates[0]
    } else if (candidates.length === 1) {
      nextUrl = candidates[0]
    } else {
      const single = await parseStringAsync(context, rule.nextContentUrl, field('nextContentUrl'))
      if (single?.trim()) {
        const splitUrls = single.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean).map(u => resolveAbsoluteUrl(u, baseUrl))
        if (splitUrls.length > 1) {
          nextUrls = splitUrls
          nextUrl = splitUrls[0]
        } else if (splitUrls.length === 1) {
          nextUrl = splitUrls[0]
        }
      }
    }
  }

  return {
    content: formatOnlineContent([content, subContent].filter(Boolean).join('\n'), baseUrl),
    nextUrl,
    nextUrls,
    title: title || undefined,
    subContent: subContent || undefined,
    embeddedImages: [...selectedImageValues.flatMap(collectImageUrls),
      ...collectImageUrls([content, subContent].filter(Boolean).join('\n'))]
      .map(url => resolveAbsoluteUrl(url, baseUrl))
      .filter((url, index, list) => Boolean(url) && list.indexOf(url) === index)
      .map((url, index) => ({ url, index })),
  }
}

function collectImageUrls(value: unknown): string[] {
  if (typeof value === 'string') {
    if (/<img\b/i.test(value)) {
      const doc = new DOMParser().parseFromString(value, 'text/html')
      return Array.from(doc.querySelectorAll('img')).flatMap(image => [
        image.getAttribute('data-original'), image.getAttribute('data-src'), image.getAttribute('src'),
      ].filter((url): url is string => Boolean(url)))
    }
    return value.split(/[\r\n,]+/).map(item => item.trim()).filter(item =>
      /^(?:https?:)?\/\//i.test(item) || /^\.?\.?(?:\/|\\)/.test(item))
  }
  if (!(value instanceof Element)) return []
  const images = value.matches('img') ? [value] : Array.from(value.querySelectorAll('img'))
  return images.flatMap(image => [
    image.getAttribute('data-original'), image.getAttribute('data-src'), image.getAttribute('src'),
  ].filter((url): url is string => Boolean(url)))
}

export async function parseImageContent(
  html: string,
  rule: ContentRule,
  baseUrl: string,
  options?: Partial<RuleExecutionContext>,
): Promise<{ payload: ImageChapterPayload; nextUrl?: string; nextUrls?: string[] }> {
  const isJson = html.trim().startsWith('{') || html.trim().startsWith('[')
  const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html')
  const field = (name: string) => ({ ...options, stage: 'content' as const, baseUrl, field: `ruleContent.${name}` })
  const values = await parseListAsync(context, rule.content || 'img', field('content'))
  const candidates = values.flatMap(collectImageUrls)
  if (candidates.length === 0) candidates.push(...collectImageUrls(await parseStringAsync(context, rule.content || '', field('content'))))
  const seen = new Set<string>()
  const images: ImageReference[] = candidates
    .map(url => resolveAbsoluteUrl(url, baseUrl))
    .filter(url => Boolean(url) && !seen.has(url) && Boolean(seen.add(url)))
    .map((url, index) => ({ url, index }))

  let nextUrl: string | undefined
  let nextUrls: string[] | undefined

  if (rule.nextContentUrl?.trim()) {
    const list = await parseListAsync(context, rule.nextContentUrl, field('nextContentUrl'))
    const nextCandidates = list
      .map(item => typeof item === 'string' ? item : item instanceof Element ? item.getAttribute('href') || item.textContent || '' : '')
      .flatMap(str => str.split(/[\r\n]+/))
      .map(str => str.trim())
      .filter(Boolean)
      .map(u => resolveAbsoluteUrl(u, baseUrl))
      .filter((u, i, arr) => arr.indexOf(u) === i)

    if (nextCandidates.length > 1) {
      nextUrls = nextCandidates
      nextUrl = nextCandidates[0]
    } else if (nextCandidates.length === 1) {
      nextUrl = nextCandidates[0]
    } else {
      const rawNextUrl = await parseStringAsync(context, rule.nextContentUrl, field('nextContentUrl'))
      if (rawNextUrl?.trim()) {
        const splitUrls = rawNextUrl.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean).map(u => resolveAbsoluteUrl(u, baseUrl))
        if (splitUrls.length > 1) {
          nextUrls = splitUrls
          nextUrl = splitUrls[0]
        } else if (splitUrls.length === 1) {
          nextUrl = splitUrls[0]
        }
      }
    }
  }

  const title = await parseStringAsync(context, rule.title || '', field('title')) || undefined
  return {
    payload: {
      type: 'images', images, title, style: rule.imageStyle,
      sourceUrl: baseUrl, decodeRule: rule.imageDecode,
    },
    nextUrl,
    nextUrls,
  }
}
