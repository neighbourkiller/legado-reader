import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HighlightStyleRecord } from '@/storage/db'
import { getPreference, setPreference } from '@/storage/preferences'

export type BookshelfClickAction = 'detail' | 'reader'
export type ReaderThemeSyncPreference = 'none' | 'sync' | 'independent'
export type SearchEngine = 'bing' | 'baidu' | 'google'
export type UiFontPreference = 'bundled' | 'system'
export type CodeFontPreference = 'bundled' | 'system'

export const DEFAULT_UI_FONT: UiFontPreference = 'bundled'
export const DEFAULT_CODE_FONT: CodeFontPreference = 'bundled'

export const DEFAULT_BOOK_SOURCES_SIDEBAR_WIDTH = 400
export const MIN_BOOK_SOURCES_SIDEBAR_WIDTH = 340
export const MAX_BOOK_SOURCES_SIDEBAR_WIDTH = 480

export function clampBookSourcesSidebarWidth(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_BOOK_SOURCES_SIDEBAR_WIDTH
  return Math.min(MAX_BOOK_SOURCES_SIDEBAR_WIDTH, Math.max(MIN_BOOK_SOURCES_SIDEBAR_WIDTH, Math.round(numeric)))
}

const STORAGE_KEY = 'legado_app_settings'

interface StoredAppSettings {
  bookshelfClickAction?: BookshelfClickAction
  readerThemeSyncPreference?: ReaderThemeSyncPreference
  readerScrollInfiniteLoading?: boolean
  searchEngine?: SearchEngine
  lastHighlightStyle?: HighlightStyleRecord
  bookSourcesSidebarWidth?: number
  uiFont?: UiFontPreference
  codeFont?: CodeFontPreference
}

function applyFontPreferences(uiFont: UiFontPreference, codeFont: CodeFontPreference) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.uiFont = uiFont
  document.documentElement.dataset.codeFont = codeFont
}

function loadStoredSettings(): StoredAppSettings {
  try {
    const raw = getPreference(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredAppSettings
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const useAppSettingsStore = defineStore('appSettings', () => {
  const stored = loadStoredSettings()
  const saveError = ref<string | null>(null)

  const bookshelfClickAction = ref<BookshelfClickAction>(
    stored.bookshelfClickAction === 'detail' ? 'detail' : 'reader',
  )
  const readerThemeSyncPreference = ref<ReaderThemeSyncPreference>(
    stored.readerThemeSyncPreference === 'sync' ||
      stored.readerThemeSyncPreference === 'independent'
      ? stored.readerThemeSyncPreference
      : 'none',
  )
  const readerScrollInfiniteLoading = ref(stored.readerScrollInfiniteLoading !== false)
  const searchEngine = ref<SearchEngine>(
    stored.searchEngine === 'baidu' || stored.searchEngine === 'google'
      ? stored.searchEngine
      : 'bing',
  )
  const bookSourcesSidebarWidth = ref(
    clampBookSourcesSidebarWidth(stored.bookSourcesSidebarWidth),
  )
  const uiFont = ref<UiFontPreference>(stored.uiFont === 'system' ? 'system' : DEFAULT_UI_FONT)
  const codeFont = ref<CodeFontPreference>(stored.codeFont === 'system' ? 'system' : DEFAULT_CODE_FONT)
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

  applyFontPreferences(uiFont.value, codeFont.value)

  const persistSettings = () => {
    saveError.value = null
    const payload = JSON.stringify({
      bookshelfClickAction: bookshelfClickAction.value,
      readerThemeSyncPreference: readerThemeSyncPreference.value,
      readerScrollInfiniteLoading: readerScrollInfiniteLoading.value,
      searchEngine: searchEngine.value,
      lastHighlightStyle: { ...lastHighlightStyle.value },
      bookSourcesSidebarWidth: bookSourcesSidebarWidth.value,
      uiFont: uiFont.value,
      codeFont: codeFont.value,
    } satisfies StoredAppSettings)

    setPreference(STORAGE_KEY, payload).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('持久化应用设置失败:', err)
      saveError.value = msg
    })
  }

  const setBookshelfClickAction = (action: BookshelfClickAction) => {
    bookshelfClickAction.value = action
    persistSettings()
  }

  const setReaderThemeSyncPreference = (preference: ReaderThemeSyncPreference) => {
    readerThemeSyncPreference.value = preference
    persistSettings()
  }

  const setReaderScrollInfiniteLoading = (enabled: boolean) => {
    readerScrollInfiniteLoading.value = enabled
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

  const setBookSourcesSidebarWidth = (width: number) => {
    bookSourcesSidebarWidth.value = clampBookSourcesSidebarWidth(width)
    persistSettings()
  }

  const setUiFont = (font: UiFontPreference) => {
    uiFont.value = font
    applyFontPreferences(uiFont.value, codeFont.value)
    persistSettings()
  }

  const setCodeFont = (font: CodeFontPreference) => {
    codeFont.value = font
    applyFontPreferences(uiFont.value, codeFont.value)
    persistSettings()
  }

  const setFonts = (ui: UiFontPreference, code: CodeFontPreference) => {
    uiFont.value = ui
    codeFont.value = code
    applyFontPreferences(uiFont.value, codeFont.value)
    persistSettings()
  }

  return {
    bookshelfClickAction,
    readerThemeSyncPreference,
    readerScrollInfiniteLoading,
    searchEngine,
    lastHighlightStyle,
    bookSourcesSidebarWidth,
    uiFont,
    codeFont,
    saveError,
    setBookshelfClickAction,
    setReaderThemeSyncPreference,
    setReaderScrollInfiniteLoading,
    setSearchEngine,
    setLastHighlightStyle,
    setBookSourcesSidebarWidth,
    setUiFont,
    setCodeFont,
    setFonts,
  }
})
