import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'
import { useReadingStore } from './reading'

class TestStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new TestStorage(),
    configurable: true,
  })
  setActivePinia(createPinia())
})

describe('阅读页主题同步持久化', () => {
  it('同步明暗主题并写入阅读设置存储', async () => {
    localStorage.setItem(
      'legado_web_reader_settings',
      JSON.stringify({ ...DEFAULT_READ_SETTINGS, theme: 3 }),
    )
    const store = useReadingStore()

    await store.syncThemeWithGlobal(true)
    expect(store.settings.theme).toBe(6)
    expect(JSON.parse(localStorage.getItem('legado_web_reader_settings')!).theme).toBe(6)

    await store.syncThemeWithGlobal(false)
    expect(store.settings.theme).toBe(1)
    expect(JSON.parse(localStorage.getItem('legado_web_reader_settings')!).theme).toBe(1)
  })

  it('同步浅色时保留已有的非夜间阅读配色', async () => {
    localStorage.setItem(
      'legado_web_reader_settings',
      JSON.stringify({ ...DEFAULT_READ_SETTINGS, theme: 4 }),
    )
    const store = useReadingStore()

    await store.syncThemeWithGlobal(false)
    expect(store.settings.theme).toBe(4)
  })
})
