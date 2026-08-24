// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { captureReaderSelection, resolveTextAnchor } from './textSelection'

function select(start: Text, startOffset: number, end: Text, endOffset: number) {
  const range = document.createRange()
  range.setStart(start, startOffset)
  range.setEnd(end, endOffset)
  Object.defineProperty(range, 'getBoundingClientRect', {
    value: () => new DOMRect(10, 20, 120, 24),
  })
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

describe('阅读页文本选区锚点', () => {
  it('定位 TXT 同章跨段落选区的正文偏移', () => {
    document.body.innerHTML = '<section data-chapter-index="2"><div data-reader-body><div data-chapterpos="0"><p>甲乙丙</p></div><div data-chapterpos="1"><p>丁戊己</p></div></div></section>'
    const texts = [...document.querySelectorAll('p')].map(item => item.firstChild as Text)
    const result = captureReaderSelection(select(texts[0]!, 1, texts[1]!, 2))
    expect(result?.anchor).toMatchObject({
      chapterIndex: 2,
      startOffset: 1,
      endOffset: 5,
      startParagraph: 0,
      endParagraph: 1,
      text: '乙丙丁戊',
    })
  })

  it('支持 EPUB 嵌套文本节点，并识别跨章节选区', () => {
    document.body.innerHTML = `
      <section data-chapter-index="0"><div data-reader-body><p>开头<em>嵌套文本</em></p></div></section>
      <section data-chapter-index="1"><div data-reader-body><p>下一章</p></div></section>`
    const nested = document.querySelector('em')!.firstChild as Text
    const same = captureReaderSelection(select(nested, 1, nested, 3))
    expect(same?.anchor).toMatchObject({ startOffset: 3, endOffset: 5, text: '套文' })

    const first = document.querySelector('p')!.firstChild as Text
    const last = document.querySelectorAll('p')[1]!.firstChild as Text
    const crossed = captureReaderSelection(select(first, 1, last, 2))
    expect(crossed?.crossesChapters).toBe(true)
    expect(crossed?.anchor).toBeNull()
  })

  it('正文替换后优先精确位置，否则选择最近同文锚点', () => {
    expect(resolveTextAnchor('甲目标乙', '目标', 1)).toEqual({ startOffset: 1, endOffset: 3 })
    expect(resolveTextAnchor('目标----目标', '目标', 6)).toEqual({ startOffset: 6, endOffset: 8 })
    expect(resolveTextAnchor('正文已移除', '目标', 2)).toBeNull()
  })
})
