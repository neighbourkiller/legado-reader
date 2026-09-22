import { describe, expect, it } from 'vitest'
import type { BookMeta } from '@/parsers/types'
import {
  clampBookProgress,
  selectMostRecentBook,
} from './mobileHome'

function book(overrides: Partial<BookMeta> = {}): BookMeta {
  return {
    id: 'book-1',
    name: '山海经',
    author: '佚名',
    format: 'txt',
    totalChapters: 10,
    currentChapter: 0,
    currentProgress: 0,
    lastReadTime: 0,
    ...overrides,
  }
}

describe('手机首页最近阅读派生数据', () => {
  it('将异常进度限制在 0 到 100', () => {
    expect(clampBookProgress(-12)).toBe(0)
    expect(clampBookProgress(37.6)).toBe(38)
    expect(clampBookProgress(120)).toBe(100)
    expect(clampBookProgress(Number.NaN)).toBe(0)
  })

  it('选择最后阅读时间最大的书籍', () => {
    const books = [
      book({ id: 'older', lastReadTime: 100 }),
      book({ id: 'newer', lastReadTime: 300 }),
    ]

    expect(selectMostRecentBook(books)?.id).toBe('newer')
    expect(selectMostRecentBook([])).toBeNull()
  })
})
