import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HighlightStyleRecord } from '@/storage/db'

export type BookshelfClickAction = 'detail' | 'reader'
export type ReaderThemeSyncPreference = 'none' | 'sync' | 'independent'
export type SearchEngine = 'bing' | 'baidu' | 'google'

const STORAGE_KEY = 'legado_app_settings'

interface StoredAppSettings {
  bookshelfClickAction?: BookshelfClickAction
  readerThemeSyncPreference?: ReaderThemeSyncPreference
  searchEngine?: SearchEngine
  lastHighlightStyle?: HighlightStyleRecord
}

function loadStoredSettings(): StoredAppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredAppSettings
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const useAppSettingsStore = defineStore('appSettings', () => {
  const stored = loadStoredSettings()
  const bookshelfClickAction = ref<BookshelfClickAction>(
    stored.bookshelfClickAction === 'detail' ? 'detail' : 'reader',
  )
  const readerThemeSyncPreference = ref<ReaderThemeSyncPreference>(
    stored.readerThemeSyncPreference === 'sync' ||
      stored.readerThemeSyncPreference === 'independent'
      ? stored.readerThemeSyncPreference
      : 'none',
  )
  const searchEngine = ref<SearchEngine>(
    stored.searchEngine === 'baidu' || stored.searchEngine === 'google'
      ? stored.searchEngine
      : 'bing',
  )
  const lastHighlightStyle = ref<HighlightStyleRecord>(
    stored.lastHighlightStyle?.kind === 'underline'
      ? {
          kind: 'underline',
          color: stored.lastHighlightStyle.color || '#e53935',
          lineStyle: stored.lastHighlightStyle.lineStyle || 'wavy',
        }
      : {
          kind: 'background',
          color: stored.lastHighlightStyle?.color || 'rgba(255, 241, 118, 0.5)',
        },
  )

  const persistSettings = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bookshelfClickAction: bookshelfClickAction.value,
        readerThemeSyncPreference: readerThemeSyncPreference.value,
        searchEngine: searchEngine.value,
        lastHighlightStyle: { ...lastHighlightStyle.value },
      } satisfies StoredAppSettings),
    )
  }

  const setBookshelfClickAction = (action: BookshelfClickAction) => {
    bookshelfClickAction.value = action
    persistSettings()
  }

  const setReaderThemeSyncPreference = (preference: ReaderThemeSyncPreference) => {
    readerThemeSyncPreference.value = preference
    persistSettings()
  }

  const setSearchEngine = (engine: SearchEngine) => {
    searchEngine.value = engine
    persistSettings()
  }

  const setLastHighlightStyle = (style: HighlightStyleRecord) => {
    lastHighlightStyle.value = { ...style }
    persistSettings()
  }

  return {
    bookshelfClickAction,
    readerThemeSyncPreference,
    searchEngine,
    lastHighlightStyle,
    setBookshelfClickAction,
    setReaderThemeSyncPreference,
    setSearchEngine,
    setLastHighlightStyle,
  }
})
