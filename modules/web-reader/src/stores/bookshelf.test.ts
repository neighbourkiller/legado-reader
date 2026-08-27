import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BookMeta } from '@/parsers/types'

vi.mock('@/storage/db', () => {
  let mockBooks: BookMeta[] = []
  return {
    getAllBookMetas: vi.fn(async () => [...mockBooks]),
    saveBook: vi.fn(async () => {}),
    deleteBookFromDB: vi.fn(async (id: string) => {
      mockBooks = mockBooks.filter(b => b.id !== id)
    }),
    updateBookMeta: vi.fn(async (id: string, updates: Partial<BookMeta>) => {
      const target = mockBooks.find(b => b.id === id)
      if (target) {
        Object.assign(target, updates)
      }
    }),
    __setMockBooks: (books: BookMeta[]) => {
      mockBooks = [...books]
    },
    __getMockBooks: () => mockBooks,
  }
})

import { useBookshelfStore } from './bookshelf'
import * as db from '@/storage/db'

describe('bookshelf store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadBooks 会过滤掉未加入书架（inShelf: false）的书籍', async () => {
    const testBooks: BookMeta[] = [
      {
        id: 'book-in-shelf-1',
        name: '已在书架的书1',
        author: '作者A',
        format: 'online',
        totalChapters: 10,
        currentChapter: 0,
        currentProgress: 0,
        lastReadTime: 1000,
        inShelf: true,
      },
      {
        id: 'book-not-in-shelf',
        name: '试读书籍未入架',
        author: '作者B',
        format: 'online',
        totalChapters: 20,
        currentChapter: 1,
        currentProgress: 5,
        lastReadTime: 2000,
        inShelf: false,
      },
      {
        id: 'local-book',
        name: '本地书籍无inShelf字段',
        author: '作者C',
        format: 'txt',
        totalChapters: 5,
        currentChapter: 0,
        currentProgress: 0,
        lastReadTime: 1500,
      },
    ]

    ;(db as any).__setMockBooks(testBooks)

    const store = useBookshelfStore()
    await store.loadBooks()

    expect(store.books.length).toBe(2)
    expect(store.books.some(b => b.id === 'book-not-in-shelf')).toBe(false)
    expect(store.books.some(b => b.id === 'book-in-shelf-1')).toBe(true)
    expect(store.books.some(b => b.id === 'local-book')).toBe(true)
  })

  it('updateBook 将 inShelf: true 更新时会加载该书籍到书架中', async () => {
    const trialBook: BookMeta = {
      id: 'trial-book',
      name: '试读书籍',
      author: '作者D',
      format: 'online',
      totalChapters: 10,
      currentChapter: 0,
      currentProgress: 0,
      lastReadTime: 3000,
      inShelf: false,
    }

    ;(db as any).__setMockBooks([trialBook])

    const store = useBookshelfStore()
    await store.loadBooks()
    expect(store.books.length).toBe(0)

    await store.updateBook('trial-book', { inShelf: true })
    expect(store.books.length).toBe(1)
    expect(store.books[0]?.id).toBe('trial-book')
  })

  it('updateBook 将已在书架的书籍更新为 inShelf: false 时会从书架列表中移除', async () => {
    const shelfBook: BookMeta = {
      id: 'shelf-book',
      name: '在书架的书',
      author: '作者E',
      format: 'online',
      totalChapters: 10,
      currentChapter: 0,
      currentProgress: 0,
      lastReadTime: 4000,
      inShelf: true,
    }

    ;(db as any).__setMockBooks([shelfBook])

    const store = useBookshelfStore()
    await store.loadBooks()
    expect(store.books.length).toBe(1)

    await store.updateBook('shelf-book', { inShelf: false })
    expect(store.books.length).toBe(0)
  })
})
