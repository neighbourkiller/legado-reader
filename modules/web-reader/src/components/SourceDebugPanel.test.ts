// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import ElementPlus from 'element-plus'
import SourceDebugPanel from './SourceDebugPanel.vue'
import type { BookSource } from '@/source/types/BookSource'
import type { SourceEngineOptions } from '@/source/engine/SourceEngine'

const mocks = vi.hoisted(() => ({ search: vi.fn(), info: vi.fn(), toc: vi.fn(), content: vi.fn(), copy: vi.fn(), options: {} as SourceEngineOptions }))
vi.mock('@/platform/clipboard', () => ({ copyTextToClipboard: mocks.copy }))
vi.mock('./SourceAuthDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/source/engine/SourceEngine', async importOriginal => {
  const original = await importOriginal<typeof import('@/source/engine/SourceEngine')>()
  return { ...original, SourceEngine: class {
    constructor(options: SourceEngineOptions) { mocks.options = options }
    search = mocks.search
    getBookInfo = mocks.info
    getToc = mocks.toc
    getContent = mocks.content
  } }
})

const source: BookSource = { bookSourceUrl: 'https://twkan.com', bookSourceName: 'TWKan', bookSourceType: 0, enabled: true, searchUrl: '/search/{{key}}', ruleSearch: { bookList: 'li', name: 'h3@text', bookUrl: 'a@href', coverUrl: 'img@src' } }
const flush = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick() } }
const cleanups: Array<() => void> = []

function mountPanel() {
  const selected = shallowRef(source)
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(SourceDebugPanel, { source: selected.value }) })
  app.use(ElementPlus)
  app.mount(root)
  cleanups.push(() => { app.unmount(); root.remove() })
  const click = (text: string) => {
    const button = [...root.querySelectorAll('button')].find(b => b.textContent?.includes(text))
    expect(button, text).toBeTruthy()
    button!.click()
  }
  const log = () => root.querySelector('.console-box')?.textContent || ''
  return { root, selected, click, log }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.search.mockResolvedValue([{ name: '租借男友', author: '作者', bookUrl: 'https://twkan.com/book/1.html', coverUrl: 'https://twkan.com/cover.jpg?token=secret' }])
  mocks.info.mockResolvedValue({ name: '租借男友', author: '作者', tocUrl: 'https://twkan.com/toc/1', coverUrl: 'https://twkan.com/cover.jpg' })
  mocks.toc.mockResolvedValue([{ name: '第一章', url: 'https://twkan.com/txt/1' }])
  mocks.content.mockResolvedValue({ type: 'text', title: '第一章', text: '可阅读的正文' })
  mocks.copy.mockResolvedValue(undefined)
})
afterEach(() => cleanups.splice(0).forEach(fn => fn()))

describe('书源调试页日志行为', () => {
  it('补齐封面字段，复制和显示同一脱敏日志，成功总结仅一次', async () => {
    const panel = mountPanel()
    panel.click('开始调试')
    await flush()
    expect(panel.log()).toContain('封面地址 (coverUrl)')
    expect(panel.log()).toContain('当前样本流程完成')
    expect(panel.log().match(/当前样本流程完成/g)).toHaveLength(1)
    expect(panel.log()).not.toContain('token=secret')
    panel.click('复制日志')
    await flush()
    const copied = mocks.copy.mock.calls[0]![0] as string
    const displayed = [...panel.root.querySelectorAll('.log-line')].map(line =>
      `${line.querySelector('.log-time')!.textContent} [${line.querySelector('.log-tag')!.textContent}] ${line.querySelector('.log-msg')!.textContent}`
    ).join('\n')
    expect(copied).toBe(displayed)
    expect(copied).toContain('封面地址 (coverUrl): https://twkan.com/cover.jpg?token=[已脱敏]')
    expect(copied).not.toContain('secret')
    expect(copied.match(/\[DONE\]/g)).toHaveLength(1)
  })
  it('搜索为空提前返回也有总结，其余阶段未执行', async () => {
    mocks.search.mockResolvedValue([])
    const panel = mountPanel()
    panel.click('开始调试')
    await flush()
    expect(panel.log()).toContain('搜索=失败；详情=未执行')
    expect(panel.log().match(/当前样本调试未完成/g)).toHaveLength(1)
    expect(mocks.info).not.toHaveBeenCalled()
  })
  it('停止后迟到结果不产生新日志或第二次总结', async () => {
    let resolve!: (value: unknown[]) => void
    mocks.search.mockReturnValue(new Promise(r => { resolve = r }))
    const panel = mountPanel()
    panel.click('开始调试')
    await flush()
    panel.click('停止调试')
    await flush()
    expect(mocks.options.signal?.aborted).toBe(true)
    const stopped = panel.log()
    expect(stopped).toContain('用户主动停止')
    mocks.options.onStageDiagnostic?.({ stage: 'toc', pages: 999, reason: 'limit' })
    mocks.options.onChallengeRecovery?.({ sourceId: source.bookSourceUrl, url: 'https://twkan.com/search', phase: 'manual', message: '迟到的认证事件' })
    mocks.options.onRequestTrace?.({ sourceId: source.bookSourceUrl, stage: 'search', request: { sourceId: source.bookSourceUrl, method: 'GET', url: 'https://late.test' } })
    resolve([{ name: '迟到结果', bookUrl: 'https://twkan.com/book/2' }])
    await flush()
    expect(panel.log()).toBe(stopped)
    expect(mocks.info).not.toHaveBeenCalled()
  })
  it('切换书源缓存中止总结，不污染新书源日志', async () => {
    let resolve!: (value: unknown[]) => void
    mocks.search.mockReturnValue(new Promise(r => { resolve = r }))
    const panel = mountPanel()
    panel.click('开始调试')
    await flush()
    panel.selected.value = { ...source, bookSourceUrl: 'https://another.test', bookSourceName: '另一个书源' }
    await flush()
    resolve([])
    await flush()
    expect(panel.log()).not.toContain('DONE')
    panel.selected.value = source
    await flush()
    expect(panel.log()).toContain('切换书源，调试已中止')
  })
})
