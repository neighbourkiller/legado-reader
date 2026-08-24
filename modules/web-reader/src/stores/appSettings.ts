import { defineStore } from 'pinia'
import { ref } from 'vue'

export type BookshelfClickAction = 'detail' | 'reader'
export type ReaderThemeSyncPreference = 'none' | 'sync' | 'independent'

const STORAGE_KEY = 'legado_app_settings'

interface StoredAppSettings {
  bookshelfClickAction?: BookshelfClickAction
  readerThemeSyncPreference?: ReaderThemeSyncPreference
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

  const persistSettings = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bookshelfClickAction: bookshelfClickAction.value,
        readerThemeSyncPreference: readerThemeSyncPreference.value,
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

  return {
    bookshelfClickAction,
    readerThemeSyncPreference,
    setBookshelfClickAction,
    setReaderThemeSyncPreference,
  }
})
