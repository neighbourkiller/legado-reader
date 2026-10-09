// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_READ_SETTINGS, type BookMeta } from '@/parsers/types'
const mocks = vi.hoisted(() => ({ push: vi.fn(), error: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'A' }, query: {} }), useRouter: () => ({ push: mocks.push }), onBeforeRouteLeave: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, warning: vi.fn(), success: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }))
vi.mock('@/storage/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/storage/db')>(),
  getAllReplaceRules: vi.fn(async () => []), getHighlightsByBookId: vi.fn(async () => []),
  getBookmarkAt: vi.fn(async () => undefined), addReadingTime: vi.fn(async () => {}), updateBookMeta: vi.fn(async () => {}),
  saveSettings: vi.fn(async () => {}),
}))
vi.mock('@/components/ReaderFloatingDock.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/NovelDownloadDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/ReaderBookmarksDrawer.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/ReplaceRuleDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/HighlightEditDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/ReaderPageTurnGuide.vue', () => ({ default: { render: () => null } }))
import ReaderView from './ReaderView.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import { getHighlightsByBookId, type HighlightRecord } from '@/storage/db'
import { useReadingStore, type ChapterPayload } from '@/stores/reading'
import { useBookshelfStore } from '@/stores/bookshelf'
let app: App | undefined
let host: HTMLDivElement
async function settle() { for (let i = 0; i < 25; i++) await Promise.resolve(); await nextTick() }
function mount() {
  app = createApp(ReaderView).use(createPiniaForTest)
  app.config.warnHandler = () => {}
  app.mount(host)
}
let createPiniaForTest: ReturnType<typeof createPinia>
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.clear()
  localStorage.setItem('legado_web_reader_settings', JSON.stringify({ ...DEFAULT_READ_SETTINGS, readMethod: 'scroll' }))
  createPiniaForTest = createPinia()
  setActivePinia(createPiniaForTest)
  useBookshelfStore().books = [{ id: 'A' } as BookMeta]
  host = document.createElement('div'); host.className = 'app-content'; document.body.append(host)
  host.scrollTo = vi.fn()
})
afterEach(() => { app?.unmount(); app = undefined; host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('加载报错后卸载会取消旧页面的延迟导航', async () => {
  vi.spyOn(useReadingStore(), 'loadBook').mockRejectedValue(new Error('missing book'))
  mount(); await settle()
  expect(mocks.error).toHaveBeenCalled()
  app!.unmount(); app = undefined
  await vi.advanceTimersByTimeAsync(1600)
  expect(mocks.push).not.toHaveBeenCalled()
})

it('仍在当前页面时加载报错正常返回书架', async () => {
  vi.spyOn(useReadingStore(), 'loadBook').mockRejectedValue(new Error('missing book'))
  mount(); await settle()
  await vi.advanceTimersByTimeAsync(1600)
  expect(mocks.push).toHaveBeenCalledWith('/bookshelf')
})

it('书籍加载期间卸载，异步恢复后不能重新注册全局监听', async () => {
  let finish!: (value: boolean) => void
  vi.spyOn(useReadingStore(), 'loadBook').mockReturnValue(new Promise(resolve => { finish = resolve }))
  mount(); await settle()
  app!.unmount(); app = undefined
  const listen = vi.spyOn(window, 'addEventListener')
  const timers = vi.getTimerCount()
  finish(true); await settle()
  expect(listen).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(timers)
})

it('章节加载期间卸载，迟到正文不能启动定时器或键盘监听', async () => {
  const store = useReadingStore()
  store.currentBook = { id: 'A', name: 'A', format: 'txt', currentChapter: 0 } as BookMeta
  store.chapters = [{ index: 0, title: 'A' }]
  vi.spyOn(store, 'loadBook').mockResolvedValue(true)
  let finish!: (value: ChapterPayload) => void
  vi.spyOn(store, 'fetchChapter').mockReturnValue(new Promise(resolve => { finish = resolve }))
  mount(); await settle()
  expect(mocks.error).not.toHaveBeenCalled()
  expect(store.fetchChapter).toHaveBeenCalled()
  app!.unmount(); app = undefined
  const listen = vi.spyOn(window, 'addEventListener')
  const timers = vi.getTimerCount()
  finish({ index: 0, title: 'A', content: ['text'], format: 'txt' }); await settle()
  expect(listen).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(timers)
})

it('点击阅读设置的简繁按钮即刻更新已加载正文，并记住选择', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} })
  const highlight: HighlightRecord = {
    id: 'highlight-1', bookId: 'A', bookName: '阅读', bookAuthor: '', chapterIndex: 0,
    chapterTitle: '第一章 阅读', startOffset: 0, endOffset: 4, startParagraph: 0, endParagraph: 0,
    text: '阅读书籍', style: { kind: 'background', color: '#ff0' }, createdAt: 0,
  }
  vi.mocked(getHighlightsByBookId).mockResolvedValueOnce([highlight])
  const store = useReadingStore()
  store.currentBook = { id: 'A', name: '阅读', format: 'txt', currentChapter: 0 } as BookMeta
  store.chapters = [{ index: 0, title: '第一章 阅读' }]
  const payload: ChapterPayload = { index: 0, title: '第一章 阅读', content: ['阅读书籍，頭髮發展'], format: 'txt' }
  vi.spyOn(store, 'loadBook').mockResolvedValue(true)
  const fetchChapter = vi.spyOn(store, 'fetchChapter').mockResolvedValue(payload)
  app = createApp({ render: () => h('div', [h(ReaderView), h(ReadSettings)]) }).use(createPiniaForTest)
  app.config.warnHandler = () => {}
  app.mount(host)
  await settle()
  const body = () => host.querySelector('[data-reader-body]')!.textContent
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-labelledby="chinese-conversion-label"] button'))
  expect(buttons.map(button => button.textContent?.trim())).toEqual(['原文', '简体', '繁体'])
  expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
  expect(body()).toBe('阅读书籍，頭髮發展')
  expect(host.querySelector('mark[data-reader-highlight]')?.textContent).toBe('阅读书籍')
  buttons[2]!.click(); await settle()
  expect(body()).toBe('閱讀書籍，頭髮發展')
  expect(host.querySelector('mark[data-reader-highlight]')?.textContent).toBe('閱讀書籍')
  expect(host.querySelector('.hud-chapter-title')?.textContent).toBe('第一章 閱讀')
  expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true')
  expect(JSON.parse(localStorage.getItem('legado_web_reader_settings')!).chineseConversion).toBe('traditional')
  buttons[1]!.click(); await settle()
  expect(body()).toBe('阅读书籍，头发发展')
  buttons[0]!.click(); await settle()
  expect(body()).toBe('阅读书籍，頭髮發展')
  expect(fetchChapter).toHaveBeenCalledTimes(1)
  expect(payload.content).toEqual(['阅读书籍，頭髮發展'])
  expect(highlight.text).toBe('阅读书籍')
  expect(mocks.error).not.toHaveBeenCalled()
})
