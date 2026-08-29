import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SourceImportPreview } from './bookSource'

let storedSources: Record<string, unknown>[] = []

vi.mock('@/storage/db', () => ({
  getAllBookSources: vi.fn(async () => [...storedSources]),
  saveBookSource: vi.fn(async (source: Record<string, unknown>) => {
    const index = storedSources.findIndex(item => item.bookSourceUrl === source.bookSourceUrl)
    if (index >= 0) storedSources[index] = { ...source }
    else storedSources.push({ ...source })
  }),
  deleteBookSource: vi.fn(),
  importBookSources: vi.fn(async (sources: Record<string, unknown>[]) => {
    storedSources = sources.map(source => ({ ...source }))
    return sources.length
  }),
  getAllReplaceRules: vi.fn(async () => []),
  saveReplaceRule: vi.fn(),
}))

import { useBookSourceStore } from './bookSource'
import * as db from '@/storage/db'

describe('bookSource store - 分组', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storedSources = []
    vi.clearAllMocks()
  })

  it('导入时将选择或新建的分组批量应用到书源', async () => {
    const store = useBookSourceStore()
    const preview: SourceImportPreview = {
      original: [{ bookSourceName: '原始书源', bookSourceUrl: 'https://example.com', enabled: true }],
      replaced: [{ bookSourceName: '替换后书源', bookSourceUrl: 'https://example.com', enabled: true }],
      changed: 1,
      errors: [],
      originalCompatibility: [],
      replacedCompatibility: [],
    }

    await store.importPreparedSources(preview, true, '  新建分组  ')

    expect(db.importBookSources).toHaveBeenCalledWith([
      expect.objectContaining({ bookSourceName: '替换后书源', bookSourceGroup: '新建分组' }),
    ])
    expect(store.sources[0]?.bookSourceGroup).toBe('新建分组')
  })

  it('手动保存的分组会去除首尾空格并成为可用分组', async () => {
    const store = useBookSourceStore()

    await store.addSource({
      bookSourceName: '手动分组书源',
      bookSourceUrl: 'https://manual.example.com',
      bookSourceGroup: '  精选  ',
      bookSourceType: 0,
      enabled: true,
    })

    expect(db.saveBookSource).toHaveBeenCalledWith(expect.objectContaining({ bookSourceGroup: '精选' }))
    expect(store.sources[0]?.bookSourceGroup).toBe('精选')
  })
})
