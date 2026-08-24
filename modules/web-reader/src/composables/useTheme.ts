import { ref, computed, watchEffect } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ThemeAccent = 'blue' | 'purple' | 'cyan' | 'green' | 'orange' | 'rose'

export interface ThemeAccentOption {
  value: ThemeAccent
  label: string
  color: string
}

const THEME_STORAGE_KEY = 'legado_theme'
const THEME_ACCENT_STORAGE_KEY = 'legado_theme_accent'

export const DEFAULT_THEME_MODE: ThemeMode = 'dark'
export const DEFAULT_THEME_ACCENT: ThemeAccent = 'blue'
export const THEME_ACCENT_OPTIONS: ThemeAccentOption[] = [
  { value: 'blue', label: '蓝色', color: '#409EFF' },
  { value: 'purple', label: '紫色', color: '#7C3AED' },
  { value: 'cyan', label: '青色', color: '#0891B2' },
  { value: 'green', label: '绿色', color: '#16A34A' },
  { value: 'orange', label: '橙色', color: '#EA580C' },
  { value: 'rose', label: '玫红', color: '#E11D48' },
]

const validThemeModes = new Set<ThemeMode>(['auto', 'light', 'dark'])
const validThemeAccents = new Set<ThemeAccent>(THEME_ACCENT_OPTIONS.map(option => option.value))

function readStorage(key: string): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
}

function getStoredThemeMode(): ThemeMode {
  const stored = readStorage(THEME_STORAGE_KEY) as ThemeMode | null
  return stored && validThemeModes.has(stored) ? stored : DEFAULT_THEME_MODE
}

function getStoredThemeAccent(): ThemeAccent {
  const stored = readStorage(THEME_ACCENT_STORAGE_KEY) as ThemeAccent | null
  return stored && validThemeAccents.has(stored) ? stored : DEFAULT_THEME_ACCENT
}

const themeMode = ref<ThemeMode>(getStoredThemeMode())
const themeAccent = ref<ThemeAccent>(getStoredThemeAccent())

const systemPrefersDark = ref(
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false,
)

if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', e => {
    systemPrefersDark.value = e.matches
  })
}

const isDark = computed(() => {
  return resolveEffectiveDark(themeMode.value, systemPrefersDark.value)
})

export function resolveEffectiveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  return mode === 'auto' ? prefersDark : mode === 'dark'
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function mixColor(source: string, target: string, targetWeight: number): string {
  const sourceRgb = hexToRgb(source)
  const targetRgb = hexToRgb(target)
  const channels = sourceRgb.map((channel, index) =>
    Math.round(channel * (1 - targetWeight) + targetRgb[index]! * targetWeight),
  )
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

function applyAccentVariables(dark: boolean): void {
  if (typeof document === 'undefined') return
  const accent = THEME_ACCENT_OPTIONS.find(option => option.value === themeAccent.value)
    ?? THEME_ACCENT_OPTIONS[0]!
  const root = document.documentElement
  const mixTarget = dark ? '#141414' : '#ffffff'
  root.style.setProperty('--el-color-primary', accent.color)
  root.style.setProperty('--legado-primary-rgb', hexToRgb(accent.color).join(', '))
  for (const level of [3, 5, 7, 8, 9]) {
    root.style.setProperty(
      `--el-color-primary-light-${level}`,
      mixColor(accent.color, mixTarget, level / 10),
    )
  }
  root.style.setProperty(
    '--el-color-primary-dark-2',
    mixColor(accent.color, dark ? '#ffffff' : '#000000', 0.2),
  )
}

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
    applyAccentVariables(isDark.value)
  }
})

export function useTheme() {
  const applyTheme = (mode: ThemeMode) => {
    themeMode.value = mode
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, mode)
  }

  const setAccent = (accent: ThemeAccent) => {
    themeAccent.value = accent
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_ACCENT_STORAGE_KEY, accent)
  }

  return {
    themeMode,
    themeAccent,
    systemPrefersDark,
    isDark,
    applyTheme,
    setAccent,
  }
}
