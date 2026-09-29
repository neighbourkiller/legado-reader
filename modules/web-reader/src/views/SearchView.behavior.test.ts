// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
const mocks = vi.hoisted(() => ({
  search: vi.fn(), back: vi.fn(), replace: vi.fn(), push: vi.fn(),
  history: { back: '/bookshelf' as string | null },
  message: { info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))
vi.mock('@/source/engine/SourceEngine', () => ({ SourceEngine: class { search = mocks.search }, getDefaultUserAgent: () => '' }))
vi.mock('element-plus', () => ({ ElMessage: mocks.message }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { sourceUrl: 'https://source.test' } }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push, back: mocks.back, options: { history: { state: mocks.history } } }),
}))
// 用菜单事件边界驱动页面，避免依赖 Element Plus 浮层的定位与动画。
vi.mock('@/components/search/SearchOptionsMenu.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return { default: defineComponent({
    emits: ['toggle-exact', 'manage-sources', 'select-groups', 'all-sources'],
    setup: (_, { emit }) => () => h('div', [
      h('button', { onClick: () => emit('toggle-exact') }, '精准搜索'),
      h('button', { onClick: () => emit('manage-sources') }, '书源管理'),
      h('button', { onClick: () => emit('select-groups', ['科幻', '小说']) }, '选择分组'),
      h('button', { onClick: () => emit('select-groups', []) }, '清空分组'),
      h('button', { onClick: () => emit('all-sources') }, '全部书源'),
    ]),
  }) }
})
import SearchView from './SearchView.vue'
import { useSearchStore } from '@/stores/search'
import { useBookSourceStore } from '@/stores/bookSource'

let app: App | undefined
let host: HTMLDivElement
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); await nextTick() }
function deferred() {
  let resolve!: (results: SearchResult[]) => void
  let reject!: (error: Error) => void
  const promise = new Promise<SearchResult[]>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function search(keyword: string) {
  const input = host.querySelector('input')!
  input.value = keyword
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  await settle()
}
const result = (name: string) => ({ name, author: '', bookUrl: `https://source.test/${name}`, sourceUrl: 'https://source.test' }) as SearchResult
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.history.back = '/bookshelf'
  const pinia = createPinia()
  setActivePinia(pinia)
  useBookSourceStore().sources = [{ bookSourceUrl: 'https://source.test', bookSourceName: 'test', enabled: true } as BookSource]
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(SearchView).use(pinia)
  app.component('el-input', defineComponent({
    props: ['modelValue'], emits: ['update:modelValue'],
    setup: (props, { emit, slots }) => () => h('div', [h('input', {
      value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
    }), slots.append?.()]),
  }))
  app.component('el-button', defineComponent({ props: ['loading'], setup: (props, { slots }) => () => h('button', { 'data-loading': String(!!props.loading) }, slots.default?.()) }))
  for (const name of ['el-icon', 'el-tag', 'el-empty']) app.component(name, defineComponent({ setup: (_, { slots }) => () => h('span', slots.default?.()) }))
  app.directive('loading', {})
  app.mount(host)
  await settle()
})
afterEach(() => { app?.unmount(); app = undefined; host.remove(); vi.restoreAllMocks() })

it('切换范围后旧搜索不能恢复指定书源或结果', async () => {
  const pending = deferred()
  mocks.search.mockReturnValueOnce(pending.promise)
  await search('old')
  const clear = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('切回全部'))!
  clear.click()
  await settle()
  expect(host.querySelector('button[data-loading="true"]')).toBeNull()
  pending.resolve([result('old')])
  await settle()
  expect(useSearchStore().targetSourceUrl).toBe('')
  expect(useSearchStore().results).toEqual([])
})

it('乱序返回时只有最新请求更新结果及加载状态', async () => {
  const old = deferred(), latest = deferred()
  mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  await search('old')
  await search('new')
  old.resolve([result('old')])
  await settle()
  expect(host.querySelector('button[data-loading="true"]')).not.toBeNull()
  expect(useSearchStore().results).toEqual([])
  latest.resolve([result('new')])
  await settle()
  expect(host.textContent).toContain('new')
  expect(useSearchStore().keyword).toBe('new')
})

it('卸载后旧搜索失败不更新状态或弹提示', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const pending = deferred()
  mocks.search.mockReturnValueOnce(pending.promise)
  await search('old')
  app!.unmount(); app = undefined
  pending.reject(new Error('offline'))
  await settle()
  expect(useSearchStore().results).toEqual([])
  expect(mocks.message.info).not.toHaveBeenCalled()
  expect(mocks.message.error).not.toHaveBeenCalled()
})

async function clickButton(text: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === text)!
  button.click()
  await settle()
}

it('返回实际上一页，没有历史时回到书架', async () => {
  host.querySelector<HTMLButtonElement>('[aria-label="返回"]')!.click()
  expect(mocks.back).toHaveBeenCalledOnce()
  expect(mocks.push).not.toHaveBeenCalled()
  mocks.history.back = null
  host.querySelector<HTMLButtonElement>('[aria-label="返回"]')!.click()
  expect(mocks.replace).toHaveBeenCalledWith('/bookshelf')
})

it('精准搜索匹配完整书名或作者，关闭后恢复模糊结果', async () => {
  const books = [result('三体'), result('三体前传'), { ...result('其他作品'), author: '三体' }]
  mocks.search.mockResolvedValue(books)
  await clickButton('精准搜索')
  await search('三体')
  expect(useSearchStore().results.map(book => book.name)).toEqual(['三体', '其他作品'])
  await clickButton('精准搜索')
  await search('三体')
  expect(useSearchStore().results).toEqual(books)
})

it('分组搜索取已启用书源的并集且不重复，全书源清除范围限制', async () => {
  const sources = [
    { bookSourceUrl: 'a', bookSourceGroup: '科幻；小说', enabled: true },
    { bookSourceUrl: 'b', bookSourceGroup: '小说,文学', enabled: true },
    { bookSourceUrl: 'c', bookSourceGroup: '科幻', enabled: false },
    { bookSourceUrl: 'd', enabled: true },
  ] as BookSource[]
  useBookSourceStore().sources = sources
  mocks.search.mockResolvedValue([])
  await clickButton('选择分组')
  await search('书')
  expect(mocks.search.mock.calls.map(call => call[0].bookSourceUrl)).toEqual(['a', 'b'])
  expect(useSearchStore().targetSourceUrl).toBe('')
  mocks.search.mockClear()
  await clickButton('全部书源')
  await search('书')
  expect(mocks.search.mock.calls.map(call => call[0].bookSourceUrl)).toEqual(['a', 'b', 'd'])
  expect(useSearchStore().selectedGroups).toBeNull()
})

it('未选择分组时不回退到全书源', async () => {
  await clickButton('清空分组')
  await search('书')
  expect(mocks.search).not.toHaveBeenCalled()
  expect(mocks.message.warning).toHaveBeenCalled()
})

it('切换精准选项使正在执行的旧请求失效', async () => {
  const pending = deferred()
  mocks.search.mockReturnValueOnce(pending.promise)
  await search('三体')
  await clickButton('精准搜索')
  pending.resolve([result('三体前传')])
  await settle()
  expect(useSearchStore().results).toEqual([])
  expect(host.querySelector('button[data-loading="true"]')).toBeNull()
})

it('菜单书源管理跳转到管理页', async () => {
  await clickButton('书源管理')
  expect(mocks.push).toHaveBeenCalledWith('/book-sources')
})
