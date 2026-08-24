import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { StoredBook } from '@/parsers/types'
import {
  DATABASE_STORE_NAMES,
  clearChapterContents,
  deleteBookChapterContents,
  deleteBookFromDB,
  exportDatabaseSnapshot,
  getChapterCacheSummaries,
  importDatabaseSnapshot,
} from './db'

const books: StoredBook[] = [
  {
    meta: {
      id: 'cache-book-a',
      name: '甲书',
      author: '甲作者',
      format: 'online',
      totalChapters: 2,
      currentChapter: 0,
      currentProgress: 0,
      lastReadTime: 0,
    },
    chapters: [],
  },
  {
    meta: {
      id: 'cache-book-b',
      name: '乙书',
      author: '乙作者',
      format: 'online',
      totalChapters: 1,
      currentChapter: 0,
      currentProgress: 0,
      lastReadTime: 0,
    },
    chapters: [],
  },
]

const chapterContents = [
  {
    key: 'cache-book-a:0',
    bookId: 'cache-book-a',
    chapterIndex: 0,
    title: '第一章',
    content: '第一章正文',
    downloadedAt: 10,
  },
  {
    key: 'cache-book-a:1',
    bookId: 'cache-book-a',
    chapterIndex: 1,
    title: '第二章',
    content: '第二章正文更多内容',
    downloadedAt: 20,
  },
  {
    key: 'cache-book-b:0',
    bookId: 'cache-book-b',
    chapterIndex: 0,
    title: '唯一章',
    content: '乙书正文',
    downloadedAt: 30,
  },
]

async function resetFixture() {
  await importDatabaseSnapshot({ books, chapterContents }, [...DATABASE_STORE_NAMES])
}

describe('离线章节缓存管理', () => {
  it('按书统计缓存章数和近似字节数', async () => {
    await resetFixture()
    const summaries = await getChapterCacheSummaries()

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({
      bookId: 'cache-book-a',
      bookName: '甲书',
      bookAuthor: '甲作者',
      chapterCount: 2,
    })
    expect(summaries[0]!.size).toBeGreaterThan(0)
  })

  it('单书清理和全部清理只删除目标章节缓存', async () => {
    await resetFixture()
    await deleteBookChapterContents('cache-book-a')

    let snapshot = await exportDatabaseSnapshot()
    expect(snapshot.books).toHaveLength(2)
    expect(snapshot.chapterContents).toEqual([expect.objectContaining({ bookId: 'cache-book-b' })])

    await clearChapterContents()
    snapshot = await exportDatabaseSnapshot()
    expect(snapshot.books).toHaveLength(2)
    expect(snapshot.chapterContents).toEqual([])
  })

  it('删除书籍时仍在同一操作中联动清理该书缓存', async () => {
    await resetFixture()
    await deleteBookFromDB('cache-book-a')

    const snapshot = await exportDatabaseSnapshot()
    expect((snapshot.books as StoredBook[]).map(book => book.meta.id)).toEqual(['cache-book-b'])
    expect(snapshot.chapterContents).toEqual([expect.objectContaining({ bookId: 'cache-book-b' })])
  })
})
