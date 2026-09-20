// @vitest-environment jsdom
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
const mocks = vi.hoisted(() => ({ search: vi.fn(), message: { info: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('@/source/engine/SourceEngine', () => ({ SourceEngine: class { search = mocks.search }, getDefaultUserAgent: () => '' }))
vi.mock('element-plus', () => ({ ElMessage: mocks.message }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { sourceUrl: 'https://source.test' } }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
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
