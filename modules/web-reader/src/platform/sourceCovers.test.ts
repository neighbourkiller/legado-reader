// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), open: vi.fn(), sources: vi.fn(), badImage: false }))
vi.mock('./capabilities', () => ({ platform: { isDesktop: true } }))
import * as db from '@/storage/db'
import * as transport from '@/source/transport'
import { SourceEngine, SecurityChallengeError } from '@/source/engine/SourceEngine'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(db, 'getAllBookSources').mockImplementation(mocks.sources)
  vi.spyOn(SourceEngine.prototype, 'fetchSourceAsset').mockImplementation(mocks.fetch)
  vi.spyOn(transport, 'getTransport').mockResolvedValue({ request: vi.fn(), openAuthWindow: mocks.open })
  request.url = `https://twkan.com/cover-${++sequence}.jpg`
  mocks.badImage = false
  mocks.sources.mockResolvedValue([{ bookSourceUrl: 'https://twkan.com', useWebView: true, enabledCookieJar: true }])
  mocks.fetch.mockResolvedValue({ body: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' })
  vi.stubGlobal('Image', class {
    onload?: () => void
    onerror?: () => void
    naturalWidth = 100
    naturalHeight = 140
    set src(value: string) {
      if (value) Promise.resolve().then(() => mocks.badImage ? this.onerror?.() : this.onload?.())
    }
  })
  URL.createObjectURL = vi.fn(() => 'blob:decode')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
let sequence = 0
const request = { url: 'https://twkan.com/cover.jpg', sourceUrl: 'https://twkan.com', referer: 'https://twkan.com/book/1.html' }

describe('书源封面加载', () => {
  it('合并并发请求，缓存可解码的图片并释放验证 URL', async () => {
    const { loadSourceCover } = await import('./sourceCovers')
    const [first, second] = await Promise.all([loadSourceCover(request), loadSourceCover(request)])
    expect(first).toBe(second)
    expect(await loadSourceCover(request)).toBe(first)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch.mock.calls[0]?.[3]).toEqual({ cover: true, retry: 0, timeout: 10000 })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:decode')
  })
  it('最多请求两次，失败缓存避免滚动反复请求，手动重试可恢复', async () => {
    const { loadSourceCover } = await import('./sourceCovers')
    mocks.fetch.mockRejectedValue(new SecurityChallengeError('blocked', { isChallenge: true }))
    const result = loadSourceCover(request).catch(error => error)
    await vi.runAllTimersAsync()
    expect(await result).toMatchObject({ needsVerification: true })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    await expect(loadSourceCover(request)).rejects.toMatchObject({ needsVerification: true })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    mocks.fetch.mockResolvedValue({ body: new Uint8Array([1]), mime: 'image/jpeg' })
    await expect(loadSourceCover(request, true)).resolves.toBeInstanceOf(Blob)
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
  })
  it('拒绝 HTML 和无法解码的伪图片，不缓存成成功封面', async () => {
    const { loadSourceCover } = await import('./sourceCovers')
    mocks.fetch.mockResolvedValue({ body: new Uint8Array([1]), mime: 'text/html' })
    const first = loadSourceCover(request).catch(error => error)
    await vi.runAllTimersAsync()
    expect(await first).toBeInstanceOf(Error)
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    mocks.badImage = true
    mocks.fetch.mockResolvedValue({ body: new Uint8Array([1]), mime: 'image/jpeg' })
    const second = loadSourceCover(request, true).catch(error => error)
    await vi.runAllTimersAsync()
    expect(await second).toBeInstanceOf(Error)
    expect(mocks.fetch).toHaveBeenCalledTimes(4)
  })
  it('跨封面并发最多三个，并通过书籍页面打开验证窗口', async () => {
    const { loadSourceCover, openCoverVerification } = await import('./sourceCovers')
    let active = 0, peak = 0
    mocks.fetch.mockImplementation(async () => {
      peak = Math.max(peak, ++active)
      await new Promise(resolve => setTimeout(resolve, 100))
      active--
      return { body: new Uint8Array([1]), mime: 'image/jpeg' }
    })
    const jobs = Promise.all(Array.from({ length: 8 }, (_, n) => loadSourceCover({ ...request, url: `https://twkan.com/${n}.jpg` })))
    await vi.runAllTimersAsync()
    await jobs
    expect(peak).toBe(3)
    await openCoverVerification(request.sourceUrl, request.referer)
    expect(mocks.open).toHaveBeenCalledWith(request.sourceUrl, request.referer, expect.any(String))
  })
})
