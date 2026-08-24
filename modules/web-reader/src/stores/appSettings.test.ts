import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppSettingsStore } from './appSettings'

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

describe('应用偏好持久化', () => {
  it('旧版本和非法主题同步值默认使用每次询问', () => {
    localStorage.setItem(
      'legado_app_settings',
      JSON.stringify({ bookshelfClickAction: 'detail', readerThemeSyncPreference: 'invalid' }),
    )

    const store = useAppSettingsStore()
    expect(store.bookshelfClickAction).toBe('detail')
    expect(store.readerThemeSyncPreference).toBe('none')
  })

  it('修改任一偏好时保留完整设置记录', () => {
    localStorage.setItem(
      'legado_app_settings',
      JSON.stringify({ bookshelfClickAction: 'detail' }),
    )
    const store = useAppSettingsStore()

    store.setReaderThemeSyncPreference('sync')
    expect(JSON.parse(localStorage.getItem('legado_app_settings')!)).toEqual({
      bookshelfClickAction: 'detail',
      readerThemeSyncPreference: 'sync',
      searchEngine: 'bing',
      lastHighlightStyle: {
        kind: 'background',
        color: 'rgba(255, 241, 118, 0.5)',
      },
    })

    store.setBookshelfClickAction('reader')
    expect(JSON.parse(localStorage.getItem('legado_app_settings')!)).toEqual({
      bookshelfClickAction: 'reader',
      readerThemeSyncPreference: 'sync',
      searchEngine: 'bing',
      lastHighlightStyle: {
        kind: 'background',
        color: 'rgba(255, 241, 118, 0.5)',
      },
    })
  })
})
