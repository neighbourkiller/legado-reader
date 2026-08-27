import { describe, expect, it } from 'vitest'
import type { StoredBook } from '@/parsers/types'
import type { ReadingRecord, StoredChapterContent } from '@/storage/db'
import {
  characterOffsetToParagraphIndex,
  fromAndroidBook,
  fromAndroidHighlight,
  fromAndroidReadRecords,
  paragraphIndexToCharacterOffset,
  toAndroidBook,
  toAndroidHighlight,
  toAndroidReadRecords,
} from './compat'

const onlineBook: StoredBook = {
  meta: {
    id: 'online-1',
    name: '互通测试书',
    author: '作者',
    format: 'online',
    totalChapters: 2,
    currentChapter: 1,
    currentProgress: 100,
    currentChapterPos: 1,
    lastReadTime: 123456,
    sourceUrl: 'https://source.example.com',
    sourceName: '测试书源',
    bookUrl: 'https://book.example.com/1',
    tocUrl: 'https://book.example.com/1/toc',
  },
  chapters: [
    { index: 0, title: '第一章', href: 'https://book.example.com/1/1' },
    { index: 1, title: '第二章', href: 'https://book.example.com/1/2' },
  ],
}

const cache: StoredChapterContent = {
  key: 'online-1:1',
  bookId: 'online-1',
  chapterIndex: 1,
  title: '第二章',
  content: '第一段正文\n第二段正文\n第三段正文',
  downloadedAt: 1,
}

describe('Android 字段与位置互通', () => {
  it('把网络书进度映射为 Android 章节索引和字符位置', () => {
    const result = toAndroidBook(onlineBook, [cache])
    expect(result?.book.bookUrl).toBe(onlineBook.meta.bookUrl)
    expect(result?.book.origin).toBe(onlineBook.meta.sourceUrl)
    expect(result?.book.durChapterIndex).toBe(1)
    expect(result?.book.durChapterPos).toBe('第一段正文\n'.length)
    expect(result?.positionFallback).toBe(false)
  })

  it('缺少正文缓存时降级到章首并给出标记', () => {
    const result = toAndroidBook(onlineBook, [])
    expect(result?.book.durChapterPos).toBe(0)
    expect(result?.positionFallback).toBe(true)
  })

  it('本地书不写入 Android 书架', () => {
    const localBook: StoredBook = {
      ...onlineBook,
      meta: { ...onlineBook.meta, id: 'local-1', format: 'txt', bookUrl: undefined },
    }
    expect(toAndroidBook(localBook, [])).toBeNull()
  })

  it('未入架在线书籍 (inShelf: false) 不写入 Android 书架', () => {
    const trialBook: StoredBook = {
      ...onlineBook,
      meta: { ...onlineBook.meta, inShelf: false },
    }
    expect(toAndroidBook(trialBook, [])).toBeNull()
  })

  it('从 Android 网络书恢复稳定标识和待换算字符位置', () => {
    const android = toAndroidBook(onlineBook, [cache])!.book
    const restored = fromAndroidBook(android)
    expect(restored?.meta.bookUrl).toBe(onlineBook.meta.bookUrl)
    expect(restored?.meta.sourceUrl).toBe(onlineBook.meta.sourceUrl)
    expect(restored?.meta.legacyChapterCharPos).toBe(android.durChapterPos)
    expect(restored?.chapters).toEqual([])
  })

  it('用摘录锚点修正字符位置到段落位置的偏差', () => {
    const content = '开头段落\n这是目标摘录所在段落\n结尾段落'
    expect(characterOffsetToParagraphIndex(content, 0, '目标摘录')).toBe(1)
    const offset = paragraphIndexToCharacterOffset(content, 2)
    expect(characterOffsetToParagraphIndex(content, offset)).toBe(2)
  })

  it('高亮样式和精确位置可按 Android BookHighlight 往返', () => {
    const android = toAndroidHighlight({
      id: 'highlight-1',
      bookId: onlineBook.meta.id,
      bookName: onlineBook.meta.name,
      bookAuthor: onlineBook.meta.author,
      bookUrl: onlineBook.meta.bookUrl,
      chapterUrl: onlineBook.chapters[1]?.href,
      chapterIndex: 1,
      chapterTitle: '第二章',
      startOffset: 6,
      endOffset: 10,
      startParagraph: 1,
      endParagraph: 1,
      text: '第二段正',
      style: { kind: 'underline', color: '#e53935', lineStyle: 'wavy' },
      note: '备注',
      createdAt: 99,
    })
    expect(JSON.parse(android.style)).toMatchObject({ underline: { kind: 'WAVY' } })
    const restored = fromAndroidHighlight(android, [onlineBook], [cache])
    expect(restored).toMatchObject({
      startOffset: 6,
      endOffset: 10,
      startParagraph: 1,
      style: { kind: 'underline', lineStyle: 'wavy' },
      note: '备注',
    })
  })
})

describe('阅读时长按设备幂等合并', () => {
  const record: ReadingRecord = {
    bookId: onlineBook.meta.id,
    bookName: onlineBook.meta.name,
    bookAuthor: onlineBook.meta.author,
    readTime: 150,
    lastRead: 20,
    devices: {
      androidA: { readTime: 100, lastRead: 10, author: '作者' },
      tauriA: { readTime: 50, lastRead: 20, author: '作者' },
    },
  }

  it('双向转换保留设备贡献', () => {
    const android = toAndroidReadRecords([record])
    expect(android).toHaveLength(2)
    const restored = fromAndroidReadRecords(android, [onlineBook])
    expect(restored[0]?.readTime).toBe(150)
    expect(restored[0]?.devices?.androidA.readTime).toBe(100)
  })

  it('相同备份重复导入不重复累加', () => {
    const android = toAndroidReadRecords([record])
    const first = fromAndroidReadRecords(android, [onlineBook])
    const second = fromAndroidReadRecords(android, [onlineBook], first)
    expect(second[0]?.readTime).toBe(150)
    expect(Object.keys(second[0]?.devices || {})).toHaveLength(2)
  })

  it('Android 相同设备同书名只生成一条记录并保留作者集合', () => {
    const sameName = {
      ...record,
      bookId: 'online-2',
      bookAuthor: '另一作者',
      devices: { androidA: { readTime: 25, lastRead: 30, author: '另一作者' } },
    }
    const android = toAndroidReadRecords([record, sameName])
    const merged = android.find(item => item.deviceId === 'androidA')
    expect(android.filter(item => item.deviceId === 'androidA')).toHaveLength(1)
    expect(merged?.readTime).toBe(125)
    expect(merged?.author).toContain('\u001Eauthors:')
  })
})
