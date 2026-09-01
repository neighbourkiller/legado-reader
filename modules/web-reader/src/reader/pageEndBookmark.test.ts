// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { findLastVisibleReaderLine } from './pageEndBookmark'

interface RectInit {
  left: number
  top: number
  width: number
  height: number
}

const rect = ({ left, top, width, height }: RectInit) =>
  new DOMRect(left, top, width, height)

const textRects = new WeakMap<Text, DOMRect[]>()

function mockPositionElement(element: Element, rects: DOMRect[]) {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => rects,
  })
}

function mockTextLines(text: Text, rects: DOMRect[]) {
  textRects.set(text, rects)
}

const originalGetClientRects = Range.prototype.getClientRects

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: originalGetClientRects,
  })
})

function installRangeRects() {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value(this: Range) {
      const node = this.startContainer
      if (!(node instanceof Text) || node !== this.endContainer) return []
      const rects = textRects.get(node) || []
      if (this.startOffset === 0 && this.endOffset === node.data.length) {
        return [...new Set(rects)]
      }
      return rects.slice(this.startOffset, this.endOffset)
    },
  })
}

describe('Dock 当前页末尾行书签定位', () => {
  it('滚动阅读时选择视口内最下方完整行并保留精确正文偏移', () => {
    installRangeRects()
    document.body.innerHTML = `
      <main id="root">
        <section data-chapter-index="7">
          <div data-reader-body>
            <div data-chapterpos="3"><p>第一行第二行</p></div>
            <div data-chapterpos="4"><p>下一页</p></div>
          </div>
        </section>
      </main>`
    const root = document.querySelector<HTMLElement>('#root')!
    const paragraphs = [...document.querySelectorAll<HTMLElement>('[data-chapterpos]')]
    const firstText = paragraphs[0]!.querySelector('p')!.firstChild as Text
    const secondText = paragraphs[1]!.querySelector('p')!.firstChild as Text
    const firstLine = rect({ left: 100, top: 80, width: 120, height: 20 })
    const lastLine = rect({ left: 100, top: 180, width: 120, height: 20 })
    const clippedBottomLine = rect({ left: 100, top: 230, width: 120, height: 20 })
    mockPositionElement(paragraphs[0]!, [firstLine, lastLine])
    mockPositionElement(paragraphs[1]!, [clippedBottomLine])
    mockTextLines(firstText, [firstLine, firstLine, firstLine, lastLine, lastLine, lastLine, lastLine])
    mockTextLines(secondText, [clippedBottomLine, clippedBottomLine, clippedBottomLine])
    const bodyText = document.querySelector<HTMLElement>('[data-reader-body]')!.textContent || ''
    const lineStart = bodyText.indexOf('第二行')

    expect(findLastVisibleReaderLine(root, {
      left: 0,
      top: 0,
      right: 800,
      bottom: 240,
    })).toEqual({
      chapterIndex: 7,
      chapterPos: 3,
      content: '第二行',
      startOffset: lineStart,
      endOffset: lineStart + 3,
    })
  })

  it('分页阅读时忽略左右相邻列，只选择当前列的末尾行', () => {
    installRangeRects()
    document.body.innerHTML = `
      <main id="root">
        <section data-chapter-index="2">
          <div data-reader-body>
            <div data-chapterpos="8"><p>前页当前行后页</p></div>
          </div>
        </section>
      </main>`
    const root = document.querySelector<HTMLElement>('#root')!
    const paragraph = document.querySelector<HTMLElement>('[data-chapterpos]')!
    const text = paragraph.querySelector('p')!.firstChild as Text
    const previousColumn = rect({ left: -700, top: 180, width: 120, height: 20 })
    const currentColumn = rect({ left: 100, top: 180, width: 120, height: 20 })
    const nextColumn = rect({ left: 900, top: 180, width: 120, height: 20 })
    mockPositionElement(paragraph, [previousColumn, currentColumn, nextColumn])
    mockTextLines(text, [
      previousColumn,
      previousColumn,
      currentColumn,
      currentColumn,
      currentColumn,
      nextColumn,
      nextColumn,
    ])
    const bodyText = document.querySelector<HTMLElement>('[data-reader-body]')!.textContent || ''
    const lineStart = bodyText.indexOf('当前行')

    expect(findLastVisibleReaderLine(root, {
      left: 0,
      top: 0,
      right: 800,
      bottom: 240,
    })).toMatchObject({
      chapterIndex: 2,
      chapterPos: 8,
      content: '当前行',
      startOffset: lineStart,
      endOffset: lineStart + 3,
    })
  })

  it('EPUB 没有段落序号节点时仍使用页末行的精确字符偏移', () => {
    installRangeRects()
    document.body.innerHTML = `
      <main id="root">
        <section data-chapter-index="4">
          <div data-reader-body><article><p>上一行页末行</p></article></div>
        </section>
      </main>`
    const root = document.querySelector<HTMLElement>('#root')!
    const body = document.querySelector<HTMLElement>('[data-reader-body]')!
    const text = document.querySelector('p')!.firstChild as Text
    const firstLine = rect({ left: 100, top: 80, width: 120, height: 20 })
    const lastLine = rect({ left: 100, top: 180, width: 120, height: 20 })
    mockPositionElement(body, [firstLine, lastLine])
    mockTextLines(text, [firstLine, firstLine, firstLine, lastLine, lastLine, lastLine])

    expect(findLastVisibleReaderLine(root, {
      left: 0,
      top: 0,
      right: 800,
      bottom: 240,
    })).toEqual({
      chapterIndex: 4,
      chapterPos: 0,
      content: '页末行',
      startOffset: 3,
      endOffset: 6,
    })
  })

  it('ReaderView 打开书签管理时读取页末行，抽屉内再执行增删', () => {
    const content = readFileSync(resolve(__dirname, '../views/ReaderView.vue'), 'utf-8')
    expect(content).toContain('@open-bookmarks-drawer="openBookmarksDrawer"')
    expect(content).toContain('@toggle-current="toggleDrawerBookmark"')
    expect(content).toContain('findLastVisibleReaderLine')
    expect(content).toContain('const position = findPageEndReadingPosition()')
  })
})
