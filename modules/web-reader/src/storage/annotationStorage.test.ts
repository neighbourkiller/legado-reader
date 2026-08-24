import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  deleteHighlight,
  getBookmarksByBookId,
  getHighlightsByBookId,
  saveBookmark,
  saveHighlight,
} from './db'

describe('精确书签与标注持久化', () => {
  it('同一段落可保存多个不同字符位置的书签', async () => {
    const bookId = `bookmark-multiple-${Date.now()}`
    const base = {
      bookId,
      bookName: '测试书',
      bookAuthor: '作者',
      chapterIndex: 0,
      chapterPos: 1,
      chapterTitle: '第一章',
      createdAt: Date.now(),
    }
    await saveBookmark({ ...base, id: `${bookId}:2`, startOffset: 2, endOffset: 4, content: '甲乙' })
    await saveBookmark({ ...base, id: `${bookId}:8`, startOffset: 8, endOffset: 10, content: '丙丁' })
    expect((await getBookmarksByBookId(bookId)).map(item => item.startOffset)).toEqual([2, 8])
  })

  it('高亮可保存、更新样式与删除', async () => {
    const bookId = `highlight-crud-${Date.now()}`
    const highlight = {
      id: `${bookId}:1`,
      bookId,
      bookName: '测试书',
      bookAuthor: '作者',
      chapterIndex: 0,
      chapterTitle: '第一章',
      startOffset: 1,
      endOffset: 3,
      startParagraph: 0,
      endParagraph: 0,
      text: '正文',
      style: { kind: 'background' as const, color: 'rgba(255, 241, 118, 0.5)' },
      createdAt: Date.now(),
    }
    await saveHighlight(highlight)
    await saveHighlight({ ...highlight, style: { kind: 'underline', color: '#e53935', lineStyle: 'wavy' } })
    expect((await getHighlightsByBookId(bookId))[0]?.style.kind).toBe('underline')
    await deleteHighlight(highlight.id)
    expect(await getHighlightsByBookId(bookId)).toEqual([])
  })
})
