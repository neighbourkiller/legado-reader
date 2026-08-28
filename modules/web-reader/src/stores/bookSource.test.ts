import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { BookSource } from '@/source/types/BookSource'

let mockSources: Record<string, unknown>[] = []

vi.mock('@/storage/db', () => ({
  getAllBookSources: vi.fn(async () => [...mockSources]),
  saveBookSource: vi.fn(async (source: Record<string, unknown>) => {
    const idx = mockSources.findIndex(s => s.bookSourceUrl === source.bookSourceUrl)
    if (idx >= 0) {
      mockSources[idx] = { ...source }
    } else {
      mockSources.push({ ...source })
    }
  }),
  deleteBookSource: vi.fn(async (url: string) => {
    mockSources = mockSources.filter(s => s.bookSourceUrl !== url)
  }),
}))

import { useBookSourceStore } from './bookSource'
import * as db from '@/storage/db'

describe('bookSource store - updateSource 主键重命名原子操作', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockSources = [
      {
        bookSourceName: '原始书源',
        bookSourceUrl: 'https://old.example.com',
        bookSourceType: 0,
        enabled: true,
      },
    ]
  })

  it('修改 bookSourceUrl 时，应当先删除旧 URL 记录再保存新记录', async () => {
    const store = useBookSourceStore()
    await store.loadSources()
    expect(store.sources.length).toBe(1)
    expect(store.sources[0].bookSourceUrl).toBe('https://old.example.com')

    const updatedSource: BookSource = {
      ...store.sources[0],
      bookSourceName: '重命名书源',
      bookSourceUrl: 'https://new.example.com',
    }

    await store.updateSource(updatedSource, 'https://old.example.com')

    expect(db.deleteBookSource).toHaveBeenCalledWith('https://old.example.com')
    expect(db.saveBookSource).toHaveBeenCalledWith(expect.objectContaining({
      bookSourceUrl: 'https://new.example.com',
      bookSourceName: '重命名书源',
    }))

    // 检查 store 中旧记录已被替代，无重复记录
    expect(store.sources.length).toBe(1)
    expect(store.sources[0].bookSourceUrl).toBe('https://new.example.com')
    expect(store.sources[0].bookSourceName).toBe('重命名书源')
  })

  it('未修改 bookSourceUrl 时，不触发旧记录删除', async () => {
    const store = useBookSourceStore()
    await store.loadSources()

    const updatedSource: BookSource = {
      ...store.sources[0],
      bookSourceName: '更新名称',
    }

    await store.updateSource(updatedSource, 'https://old.example.com')

    expect(db.deleteBookSource).not.toHaveBeenCalled()
    expect(db.saveBookSource).toHaveBeenCalled()
    expect(store.sources.length).toBe(1)
    expect(store.sources[0].bookSourceName).toBe('更新名称')
  })
})
