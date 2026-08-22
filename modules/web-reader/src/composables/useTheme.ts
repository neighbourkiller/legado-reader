import { ref, computed, watchEffect } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'

const THEME_STORAGE_KEY = 'legado_theme'

// Default to 'dark' to match the screenshot theme
const themeMode = ref<ThemeMode>(
  (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'dark'
)

const systemPrefersDark = ref(
  window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
)

if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', e => {
    systemPrefersDark.value = e.matches
  })
}

const isDark = computed(() => {
  if (themeMode.value === 'auto') {
    return systemPrefersDark.value
  }
  return themeMode.value === 'dark'
})

// Sync with document element class
watchEffect(() => {
  if (typeof document !== 'undefined') {
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.setAttribute('data-theme', 'light')
    }
  }
})

export function useTheme() {
  const setTheme = (mode: ThemeMode) => {
    themeMode.value = mode
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  }

  return {
    themeMode,
    isDark,
    setTheme,
  }
}
