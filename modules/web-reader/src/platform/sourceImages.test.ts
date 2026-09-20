import { beforeEach, expect, it, vi } from 'vitest'
import type { SourceEngine } from '@/source/engine/SourceEngine'
import type { BookSource, ImageChapterPayload } from '@/source/types/BookSource'
const invoke = vi.hoisted(() => vi.fn())
vi.mock('./capabilities', () => ({ platform: { isDesktop: true } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
import { downloadAndCacheChapterImages } from './sourceImages'

beforeEach(() => { vi.clearAllMocks() })
const source = { bookSourceUrl: 'https://source.test' } as BookSource
const payload: ImageChapterPayload = { type: 'images', sourceUrl: 'https://source.test/chapter', images: Array.from({ length: 8 }, (_, index) => ({ index, url: `https://image.test/${index}` })) }

it('图片下载中失效后不再启动后续下载或提交缓存', async () => {
  const controller = new AbortController()
  let finish!: (value: { body: Uint8Array; mime: string }) => void
  const pending = new Promise<{ body: Uint8Array; mime: string }>(resolve => { finish = resolve })
  const fetchSourceAsset = vi.fn(() => pending)
  const engine = { fetchSourceAsset } as unknown as SourceEngine
  const task = downloadAndCacheChapterImages(engine, source, 'A', 0, payload, controller.signal)
  expect(fetchSourceAsset).toHaveBeenCalledTimes(4)
  controller.abort()
  finish({ body: new Uint8Array([1]), mime: 'image/png' })
  await expect(task).rejects.toThrow()
  expect(fetchSourceAsset).toHaveBeenCalledTimes(4)
  expect(invoke).not.toHaveBeenCalled()
})

it('提交中的原书缓存可以完成，但失效后不创建 Blob URL', async () => {
  const controller = new AbortController()
  const engine = { fetchSourceAsset: vi.fn(async () => ({ body: new Uint8Array([1]), mime: 'image/png' })) } as unknown as SourceEngine
  invoke.mockImplementationOnce(async () => { controller.abort() })
  const create = vi.spyOn(URL, 'createObjectURL')
  await expect(downloadAndCacheChapterImages(engine, source, 'A', 0, { ...payload, images: payload.images.slice(0, 1) }, controller.signal)).rejects.toThrow()
  expect(invoke).toHaveBeenCalledWith('storage_replace_chapter_images', expect.objectContaining({ images: [expect.objectContaining({ bookId: 'A' })] }))
  expect(create).not.toHaveBeenCalled()
  create.mockRestore()
})
