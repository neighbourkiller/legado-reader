// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, watch, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_READ_SETTINGS, type BookMeta } from '@/parsers/types'
import { READER_PAGE_TURN_GUIDE_KEY, READER_PAGE_TURN_GUIDE_VERSION } from '@/reader/pageTurnGuide'

const mocks = vi.hoisted(() => ({ push: vi.fn(), error: vi.fn(), capture: vi.fn(), toggleFullscreen: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'A' }, query: {} }), useRouter: () => ({ push: mocks.push }), onBeforeRouteLeave: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, warning: vi.fn(), success: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }))
vi.mock('@/composables/useFullscreen', async () => {
  const { ref } = await import('vue')
  return { useFullscreen: () => ({ isFullscreen: ref(false), toggleFullscreen: mocks.toggleFullscreen }) }
})
vi.mock('@/utils/textSelection', async importOriginal => ({
  ...await importOriginal<typeof import('@/utils/textSelection')>(), captureReaderSelection: mocks.capture,
}))
vi.mock('@/storage/db', async importOriginal => ({
  ...await importOriginal<typeof import('@/storage/db')>(),
  getAllReplaceRules: vi.fn(async () => []), getHighlightsByBookId: vi.fn(async () => []),
  getBookmarksByBookId: vi.fn(async () => []), getBookmarkAt: vi.fn(async () => undefined),
  addReadingTime: vi.fn(async () => {}), updateBookMeta: vi.fn(async () => {}),
}))
vi.mock('@/components/ReaderFloatingDock.vue', () => ({ default: defineComponent({
  setup(_, { slots }) { return () => h('div', { role: 'toolbar' }, [slots['catalog-trigger']?.(), slots['settings-trigger']?.()]) },
}) }))
vi.mock('@/components/PopCatalog.vue', () => ({ default: { render: () => h('button', '测试目录项') } }))
vi.mock('@/components/ReadSettings.vue', () => ({ default: { render: () => h('button', '测试设置项') } }))
vi.mock('@/components/ChapterContent.vue', () => ({ default: { render: () => h('p', { 'data-reader-body': '' }, '测试阅读正文') } }))
vi.mock('@/components/ReaderBookmarksDrawer.vue', () => ({ default: defineComponent({
  props: ['modelValue'], setup: props => () => props.modelValue ? h('div', { role: 'dialog' }, '本书书签') : null,
}) }))
vi.mock('@/components/NovelDownloadDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/ReplaceRuleDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/HighlightEditDialog.vue', () => ({ default: { render: () => null } }))
vi.mock('@/components/ReaderPageTurnGuide.vue', () => ({ default: { render: () => null } }))

import ReaderView from './ReaderView.vue'
import { useReadingStore } from '@/stores/reading'
import { useBookshelfStore } from '@/stores/bookshelf'
let app: App | undefined
let host: HTMLDivElement
let reader: HTMLElement
let store: ReturnType<typeof useReadingStore>
const originalElementsFromPoint = document.elementsFromPoint
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); await nextTick() }
const menu = () => document.querySelector('[data-reader-context-menu]')
const open = async () => {
  reader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 400, clientY: 300 }))
  await settle()
  expect(menu()).not.toBeNull()
}
const choose = async (text: string) => {
  await open()
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(el => el.textContent === text)!.click()
  await settle()
}
const pointerUp = (button: number, type = 'mouse') => {
  const event = new MouseEvent('pointerup', { button, bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: type })
  reader.dispatchEvent(event)
}

beforeEach(async () => {
  vi.clearAllMocks(); vi.useFakeTimers()
  mocks.capture.mockReturnValue(null)
  window.getSelection()?.removeAllRanges()
  localStorage.clear()
  localStorage.setItem(READER_PAGE_TURN_GUIDE_KEY, String(READER_PAGE_TURN_GUIDE_VERSION))
  localStorage.setItem('legado_web_reader_settings', JSON.stringify({ ...DEFAULT_READ_SETTINGS, readMethod: 'scroll' }))
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} })
  document.elementsFromPoint = vi.fn(() => [])
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1024, 768))
  const pinia = createPinia(); setActivePinia(pinia)
  store = useReadingStore()
  store.currentBook = { id: 'A', name: 'A', format: 'txt', currentChapter: 0, currentChapterPos: 0 } as BookMeta
  store.chapters = [{ index: 0, title: '第一章' }, { index: 1, title: '第二章' }]
  useBookshelfStore().books = [store.currentBook]
  vi.spyOn(store, 'loadBook').mockResolvedValue(true)
  vi.spyOn(store, 'fetchChapter').mockImplementation(async index => ({ index, title: '章节', content: ['测试阅读正文'], format: 'txt' }))
  vi.spyOn(store, 'saveProgress').mockResolvedValue(undefined)
  vi.spyOn(store, 'flushProgress').mockResolvedValue(undefined)
  host = document.createElement('div'); host.className = 'app-content'; host.scrollTo = vi.fn()
  document.body.append(host)
  app = createApp(ReaderView).use(pinia)
  app.config.warnHandler = () => {}
  app.component('ElIcon', { render() { return null } })
  app.component('ElPopover', defineComponent({
    props: ['visible', 'popperClass'], emits: ['after-enter'],
    setup(props, { slots, emit }) {
      watch(() => props.visible, async visible => { if (visible) { await nextTick(); emit('after-enter') } })
      return () => h('div', [slots.reference?.(), props.visible ? h('div', { class: props.popperClass }, slots.default?.()) : null])
    },
  }))
  app.mount(host)
  await settle()
  reader = host.querySelector<HTMLElement>('[aria-label="阅读正文"]')!
  expect(reader.textContent).toContain('测试阅读正文')
  expect(mocks.error).not.toHaveBeenCalled()
  reader.focus()
})
afterEach(() => {
  app?.unmount(); app = undefined
  host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalElementsFromPoint) document.elementsFromPoint = originalElementsFromPoint
  else Reflect.deleteProperty(document, 'elementsFromPoint')
})

it.each([['目录', '.pop-cata', '测试目录项'], ['阅读设置', '.pop-setting', '测试设置项']])('复用 %s 弹层并交接焦点', async (label, selector, text) => {
  await choose(label!)
  expect(menu()).toBeNull()
  expect(document.querySelector(selector!)?.textContent).toContain(text)
  expect(document.activeElement?.textContent).toBe(text)
})
it('书签与划线打开已有书签抽屉', async () => {
  await choose('书签与划线')
  expect(document.querySelector('[role="dialog"]')?.textContent).toBe('本书书签')
  expect(menu()).toBeNull()
})
it('全屏与书架调用已有入口', async () => {
  await choose('进入全屏')
  expect(mocks.toggleFullscreen).toHaveBeenCalledTimes(1)
  await choose('返回书架')
  expect(mocks.push).toHaveBeenCalledWith('/bookshelf')
})
it('右键释放不捕获选区，打开菜单取消待执行的选区显示', async () => {
  pointerUp(2)
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.capture).not.toHaveBeenCalled()
  pointerUp(0)
  await open()
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.capture).not.toHaveBeenCalled()
  expect(document.querySelector('.reader-selection-menu')).toBeNull()
})
it('触屏选字仍捕获选区，卸载取消延迟捕获', async () => {
  pointerUp(0, 'touch')
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.capture).toHaveBeenCalledTimes(1)
  pointerUp(0)
  app!.unmount(); app = undefined
  await vi.advanceTimersByTimeAsync(0)
  expect(mocks.capture).toHaveBeenCalledTimes(1)
})
it('菜单方向键不翻章，章节变化自动关闭菜单', async () => {
  await open()
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  document.activeElement!.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
  await settle()
  expect(store.fetchChapter).toHaveBeenCalledTimes(1)
  store.currentBook!.currentChapter = 1
  await settle()
  expect(menu()).toBeNull()
})
