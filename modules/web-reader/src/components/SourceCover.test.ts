// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import SourceCover from './SourceCover.vue'
import defaultCover from '@/assets/imgs/default_novel_cover.png'

const mocks = vi.hoisted(() => ({ load: vi.fn(), verify: vi.fn() }))
vi.mock('@/platform/capabilities', () => ({ platform: { isDesktop: true } }))
vi.mock('@/platform/sourceCovers', async importOriginal => ({
  ...await importOriginal<typeof import('@/platform/sourceCovers')>(), loadSourceCover: mocks.load, openCoverVerification: mocks.verify,
}))
const cleanups: Array<() => void> = []
const flush = async () => { for (let n = 0; n < 8; n++) { await Promise.resolve(); await nextTick() } }
function mount() {
  const props = reactive({ src: 'https://twkan.com/1.jpg', sourceUrl: 'https://twkan.com', referer: 'https://twkan.com/book/1', alt: '书名' })
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(SourceCover, props) })
  app.mount(root)
  const dispose = () => { app.unmount(); root.remove() }
  cleanups.push(dispose)
  return { root, props, dispose }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.load.mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }))
  URL.createObjectURL = vi.fn(() => 'blob:cover')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('统一封面展示', () => {
  it('最终失败显示指定默认封面，手动重试成功恢复且不修改原始地址', async () => {
    mocks.load.mockRejectedValue(new Error('failed'))
    const { root, props } = mount()
    await flush()
    expect(root.querySelector('img')!.getAttribute('src')).toBe(defaultCover)
    expect(root.textContent).toContain('暂用默认封面')
    expect(props.src).toBe('https://twkan.com/1.jpg')
    mocks.load.mockResolvedValue(new Blob(['image']))
    root.querySelector('button')!.click()
    await flush()
    expect(root.querySelector('img')!.getAttribute('src')).toBe('blob:cover')
    expect(mocks.load.mock.calls[1]?.[1]).toBe(true)
  })
  it('切换书籍后忽略迟到结果，卸载释放对象 URL', async () => {
    let resolve!: (value: Blob) => void
    mocks.load.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const { root, props, dispose } = mount()
    props.src = 'https://twkan.com/2.jpg'
    await flush()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    resolve(new Blob(['stale']))
    await flush()
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(root.querySelector('img')!.getAttribute('src')).toBe('blob:cover')
    dispose()
    cleanups.pop()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover')
  })
  it('验证操作不触发父卡片导航，完成后可以明确重试', async () => {
    const { CoverLoadError } = await import('@/platform/sourceCovers')
    mocks.load.mockRejectedValue(new CoverLoadError('blocked', true))
    const { root } = mount()
    const navigate = vi.fn()
    root.addEventListener('click', navigate)
    await flush()
    root.querySelector('button')!.click()
    await flush()
    expect(mocks.verify).toHaveBeenCalledWith('https://twkan.com', 'https://twkan.com/book/1')
    expect(navigate).not.toHaveBeenCalled()
    expect(root.textContent).toContain('验证完成，重试')
  })
  it('直连图片错误只自动重试一次，兜底图片错误不循环', async () => {
    vi.useFakeTimers()
    const { props, root } = mount()
    props.sourceUrl = ''
    await flush()
    root.querySelector('img')!.dispatchEvent(new Event('error'))
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    expect(root.querySelector('img')!.getAttribute('src')).toBe(props.src)
    root.querySelector('img')!.dispatchEvent(new Event('error'))
    await flush()
    expect(root.querySelector('img')!.getAttribute('src')).toBe(defaultCover)
    root.querySelector('img')!.dispatchEvent(new Event('error'))
    await vi.runAllTimersAsync()
    expect(root.querySelector('img')!.getAttribute('src')).toBe(defaultCover)
  })
  it('进入可视区域之前不请求封面', async () => {
    let intersect!: (entries: Array<{ isIntersecting: boolean }>) => void
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof intersect) { intersect = callback }
      observe() {}
      disconnect() {}
    })
    mount()
    await flush()
    expect(mocks.load).not.toHaveBeenCalled()
    intersect([{ isIntersecting: true }])
    await flush()
    expect(mocks.load).toHaveBeenCalledTimes(1)
  })
  it('直连请求一直没有结果时也会结束等待并显示默认封面', async () => {
    vi.useFakeTimers()
    const { props, root } = mount()
    props.sourceUrl = ''
    await flush()
    await vi.advanceTimersByTimeAsync(20400)
    await flush()
    expect(root.querySelector('img')!.getAttribute('src')).toBe(defaultCover)
    expect(root.textContent).toContain('暂用默认封面')
  })
})
