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

  it('批量启用只修改显式选择的书源', async () => {
    mockSources.push({
      bookSourceName: '第二书源',
      bookSourceUrl: 'https://second.example.com',
      bookSourceType: 0,
      enabled: false,
    })
    const store = useBookSourceStore()
    await store.loadSources()

    await store.setSourcesEnabled(['https://second.example.com'], true)

    expect(store.sources.find(item => item.bookSourceUrl === 'https://second.example.com')?.enabled).toBe(true)
    expect(store.sources.find(item => item.bookSourceUrl === 'https://old.example.com')?.enabled).toBe(true)
    expect(db.saveBookSource).toHaveBeenCalledTimes(1)
  })

  it('批量删除只移除显式选择的书源', async () => {
    mockSources.push(
      {
        bookSourceName: '第二书源',
        bookSourceUrl: 'https://second.example.com',
        bookSourceType: 0,
        enabled: true,
      },
      {
        bookSourceName: '保留书源',
        bookSourceUrl: 'https://keep.example.com',
        bookSourceType: 0,
        enabled: true,
      },
    )
    const store = useBookSourceStore()
    await store.loadSources()

    await store.deleteSources([
      'https://old.example.com',
      'https://second.example.com',
    ])

    expect(store.sources.map(item => item.bookSourceUrl)).toEqual(['https://keep.example.com'])
    expect(db.deleteBookSource).not.toHaveBeenCalledWith('https://keep.example.com')
  })

  it('批量更新发现开关和多分组时只修改所选书源', async () => {
    mockSources.push(
      {
        bookSourceName: '第二书源',
        bookSourceUrl: 'https://second.example.com',
        bookSourceType: 0,
        enabled: true,
        enabledExplore: false,
        bookSourceGroup: '原分组,保留分组',
      },
      {
        bookSourceName: '保留书源',
        bookSourceUrl: 'https://keep.example.com',
        bookSourceType: 0,
        enabled: true,
        enabledExplore: false,
        bookSourceGroup: '原分组',
      },
    )
    const store = useBookSourceStore()
    await store.loadSources()

    await store.setSourcesExploreEnabled(['https://second.example.com'], true)
    await store.updateSourcesGroup(['https://second.example.com'], '新增分组；保留分组', 'add')
    await store.updateSourcesGroup(['https://second.example.com'], '原分组', 'remove')

    const selected = store.sources.find(item => item.bookSourceUrl === 'https://second.example.com')
    const untouched = store.sources.find(item => item.bookSourceUrl === 'https://keep.example.com')
    expect(selected).toMatchObject({
      enabledExplore: true,
      bookSourceGroup: '保留分组,新增分组',
    })
    expect(untouched).toMatchObject({
      enabledExplore: false,
      bookSourceGroup: '原分组',
    })
  })

  it('批量置顶和置底保持所选书源的相对顺序', async () => {
    mockSources.push(
      {
        bookSourceName: '第二书源',
        bookSourceUrl: 'https://second.example.com',
        bookSourceType: 0,
        enabled: true,
        customOrder: 2,
      },
      {
        bookSourceName: '第三书源',
        bookSourceUrl: 'https://third.example.com',
        bookSourceType: 0,
        enabled: true,
        customOrder: 1,
      },
    )
    const store = useBookSourceStore()
    await store.loadSources()
    const selection = ['https://second.example.com', 'https://old.example.com']

    await store.moveSources(selection, 'top')
    expect(store.sources.slice(0, 2).map(item => item.bookSourceUrl)).toEqual(selection)
    expect(store.sources.slice(0, 2).every(item => item.isTop)).toBe(true)

    await store.moveSources(selection, 'bottom')
    expect(store.sources.slice(-2).map(item => item.bookSourceUrl)).toEqual(selection)
    expect(store.sources.slice(-2).every(item => !item.isTop)).toBe(true)
  })
})
