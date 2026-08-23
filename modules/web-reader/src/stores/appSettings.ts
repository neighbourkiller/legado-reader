import { defineStore } from 'pinia'
import { ref } from 'vue'

export type BookshelfClickAction = 'detail' | 'reader'

const STORAGE_KEY = 'legado_app_settings'

interface StoredAppSettings {
  bookshelfClickAction?: BookshelfClickAction
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

  const setBookshelfClickAction = (action: BookshelfClickAction) => {
    bookshelfClickAction.value = action
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bookshelfClickAction: action } satisfies StoredAppSettings),
    )
  }

  return {
    bookshelfClickAction,
    setBookshelfClickAction,
  }
})
