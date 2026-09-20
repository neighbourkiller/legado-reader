// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_READ_SETTINGS, type StoredBook } from '@/parsers/types'
import type { BookSource, OnlineChapterPayload } from '@/source/types/BookSource'

const mocks = vi.hoisted(() => ({
  getBook: vi.fn(), getContent: vi.fn(), updateBookMeta: vi.fn(),
  saveChapterContent: vi.fn(), saveBookmark: vi.fn(), images: vi.fn(),
}))
vi.mock('@/storage/db', () => ({
  getBook: mocks.getBook, updateBookMeta: mocks.updateBookMeta,
  saveChapterContent: mocks.saveChapterContent, saveBookmark: mocks.saveBookmark,
  getChapterContent: vi.fn(async () => null), getBookmarksByBookId: vi.fn(async () => []),
  loadSettings: vi.fn(async () => ({})), saveSettings: vi.fn(async () => {}), saveBook: vi.fn(async () => {}),
}))
vi.mock('@/source/engine/SourceEngine', () => ({
  SourceEngine: class { getContent = mocks.getContent }, getDefaultUserAgent: () => '',
}))
vi.mock('@/platform/sourceImages', () => ({
  downloadAndCacheChapterImages: mocks.images, loadCachedChapterImages: vi.fn(),
}))
import { useReadingStore } from './reading'
import { useBookSourceStore } from './bookSource'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function book(id: string): StoredBook {
  return {
    meta: { id, name: id, author: '', format: 'online', sourceUrl: 'https://source.test',
      totalChapters: 2, currentChapter: 0, currentProgress: 0, lastReadTime: 0 },
    chapters: [0, 1].map(index => ({ index, title: `${id}-${index}`, href: `https://source.test/${id}/${index}` })),
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
  localStorage.setItem('legado_web_reader_settings', JSON.stringify(DEFAULT_READ_SETTINGS))
  setActivePinia(createPinia())
  mocks.getBook.mockImplementation(async id => book(id))
  mocks.updateBookMeta.mockResolvedValue(undefined)
  useBookSourceStore().sources = [{ bookSourceUrl: 'https://source.test' } as BookSource]
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('阅读会话与退出进度', () => {
  it('旧进度刷新期间退出仍按顺序保存最新章节到原书', async () => {
    const store = useReadingStore()
    await store.loadBook('A')
    await store.saveProgress(0, 5)
    const pending = deferred<void>()
    mocks.updateBookMeta.mockImplementationOnce(() => pending.promise)
    const save = store.saveProgress(1, 0, true)
    await Promise.resolve()
    store.cleanup()
    await store.loadBook('B')
    pending.resolve()
    await save
    expect(mocks.updateBookMeta.mock.calls.map(([id, value]) => [id, value.currentChapter, value.currentChapterPos]))
      .toEqual([['A', 0, 5], ['A', 0, 5], ['A', 1, 0]])
    expect(store.currentBook?.id).toBe('B')
  })

  it('一次落盘失败不阻塞后续进度', async () => {
    const store = useReadingStore()
    await store.loadBook('A')
    mocks.updateBookMeta.mockRejectedValueOnce(new Error('disk error'))
    await expect(store.saveProgress(1, 0, true)).rejects.toThrow('disk error')
    await store.saveProgress(0, 2, true)
    expect(mocks.updateBookMeta).toHaveBeenLastCalledWith('A', expect.objectContaining({ currentChapterPos: 2 }))
  })

  it.each(['B', 'A'])('失效的 A 正文不能写入重新打开的 %s 会话', async nextId => {
    const store = useReadingStore()
    await store.loadBook('A')
    const pending = deferred<OnlineChapterPayload>()
    mocks.getContent.mockReturnValueOnce(pending.promise)
    const fetch = store.fetchChapter(0, { forceRefresh: true })
    store.cleanup()
    await store.loadBook(nextId)
    pending.resolve({ type: 'text', text: 'old text' })
    expect(await fetch).toBeNull()
    expect(mocks.saveChapterContent).not.toHaveBeenCalled()
    expect(mocks.saveBookmark).not.toHaveBeenCalled()
  })

  it('较慢的旧书加载不能覆盖新书', async () => {
    const store = useReadingStore()
    const oldBook = deferred<StoredBook>()
    mocks.getBook.mockReturnValueOnce(oldBook.promise)
    const oldLoad = store.loadBook('A')
    await store.loadBook('B')
    oldBook.resolve(book('A'))
    expect(await oldLoad).toBe(false)
    expect(store.currentBook?.id).toBe('B')
    expect(store.isLoading).toBe(false)
  })

  it('退出会中止图片任务并释放迟到的图片资源', async () => {
    const store = useReadingStore()
    await store.loadBook('A')
    mocks.getContent.mockResolvedValueOnce({ type: 'images', images: [{ url: 'https://image.test/a', index: 0 }] })
    const pending = deferred<{ images: never[]; blobUrls: string[]; cached: boolean }>()
    mocks.images.mockReturnValueOnce(pending.promise)
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static revokeObjectURL = revoke })
    const fetch = store.fetchChapter(0, { forceRefresh: true })
    await Promise.resolve()
    const signal = mocks.images.mock.calls[0]?.[5] as AbortSignal
    expect(signal.aborted).toBe(false)
    store.cleanup()
    expect(signal.aborted).toBe(true)
    pending.resolve({ images: [], blobUrls: ['blob:old'], cached: true })
    expect(await fetch).toBeNull()
    expect(revoke).toHaveBeenCalledWith('blob:old')
    expect(mocks.saveChapterContent).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
