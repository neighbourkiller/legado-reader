// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ChapterPayload } from '@/stores/reading'
import { convertChapterChinese, convertChineseText, resolveChineseTextAnchor } from './chineseConversion'

describe('阅读内容简繁转换', () => {
  it('按词语转换简繁字形，并保留非中文字符', () => {
    expect(convertChineseText('头发发展，皇后后来。Hello 123', 'traditional')).toBe('頭髮發展，皇后後來。Hello 123')
    expect(convertChineseText('閱讀書籍，頭髮發展。Hello 123', 'simplified')).toBe('阅读书籍，头发发展。Hello 123')
  })

  it('每次由原文派生标题和正文，切回原文不会丢失原字形', () => {
    const original: ChapterPayload = { index: 0, title: '第一章 阅读', format: 'txt', content: ['阅读书籍', '頭髮發展'] }
    expect(convertChapterChinese(original, 'traditional')).toMatchObject({ title: '第一章 閱讀', content: ['閱讀書籍', '頭髮發展'] })
    expect(convertChapterChinese(original, 'simplified').content).toEqual(['阅读书籍', '头发发展'])
    expect(convertChapterChinese(original, 'original')).toBe(original)
    expect(original.content).toEqual(['阅读书籍', '頭髮發展'])
  })

  it('转换 EPUB 文本节点并保留 HTML、链接、图片地址及代码', () => {
    const original: ChapterPayload = {
      index: 0, title: '阅读', format: 'epub',
      content: '<p class="阅读"><a href="/阅读">阅读 &amp; 书籍</a><img src="/书籍.png" alt="书籍"></p><style>.阅读 { color: red }</style><code>书籍</code>',
    }
    const converted = convertChapterChinese(original, 'traditional')
    const template = document.createElement('template')
    template.innerHTML = converted.content as string
    expect(template.content.querySelector('a')?.textContent).toBe('閱讀 & 書籍')
    expect(template.content.querySelector('a')?.getAttribute('href')).toBe('/阅读')
    expect(template.content.querySelector('p')?.className).toBe('阅读')
    expect(template.content.querySelector('img')?.getAttribute('src')).toBe('/书籍.png')
    expect(template.content.querySelector('style')?.textContent).toBe('.阅读 { color: red }')
    expect(template.content.querySelector('code')?.textContent).toBe('书籍')
  })

  it('TXT 插图标记与漫画图片数据保持不变', () => {
    const image = '<img src="/书籍.jpg">'
    expect(convertChapterChinese({ index: 0, title: '阅读', format: 'txt', content: ['书籍', image] }, 'traditional').content).toEqual(['書籍', image])
    const images = [{ index: 0, url: '/书籍.jpg', alt: '书籍' }]
    expect(convertChapterChinese({ index: 0, title: '阅读', format: 'images', content: images }, 'traditional').content).toBe(images)
  })

  it('切换字形后仍能定位原书签和划线，优先靠近已保存偏移', () => {
    expect(resolveChineseTextAnchor('閱讀書籍，閱讀書籍', '阅读书籍', 5)).toEqual({ startOffset: 5, endOffset: 9 })
    expect(resolveChineseTextAnchor('阅读书籍', '閱讀書籍', 0)).toEqual({ startOffset: 0, endOffset: 4 })
    expect(resolveChineseTextAnchor('另一段正文', '阅读书籍', 0)).toBeNull()
  })
})
