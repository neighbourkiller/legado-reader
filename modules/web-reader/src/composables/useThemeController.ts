import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAppSettingsStore, type ReaderThemeSyncPreference } from '@/stores/appSettings'
import { useReadingStore } from '@/stores/reading'
import {
  resolveEffectiveDark,
  useTheme,
  type ThemeMode,
} from '@/composables/useTheme'

export type ThemeChangeDisposition = 'apply' | 'sync' | 'prompt'

export function resolveThemeChangeDisposition(
  preference: ReaderThemeSyncPreference,
  currentDark: boolean,
  targetDark: boolean,
): ThemeChangeDisposition {
  if (currentDark === targetDark || preference === 'independent') return 'apply'
  return preference === 'sync' ? 'sync' : 'prompt'
}

interface PendingThemeChange {
  mode: ThemeMode
  targetDark: boolean
}

const prompt = reactive({
  visible: false,
  dontAskAgain: false,
})

let pendingChange: PendingThemeChange | null = null
let systemWatcherInitialized = false

export function useThemeController() {
  const appSettings = useAppSettingsStore()
  const readingStore = useReadingStore()
  const { themeMode, systemPrefersDark, isDark, applyTheme } = useTheme()

  const syncReadingTheme = async (dark: boolean) => {
    try {
      await readingStore.syncThemeWithGlobal(dark)
    } catch (error) {
      console.error('Failed to sync reader theme', error)
      ElMessage.error('全局主题已切换，阅读页主题保存失败')
    }
  }

  const applyPendingTheme = () => {
    if (!pendingChange) return null
    const change = pendingChange
    pendingChange = null
    applyTheme(change.mode)
    prompt.visible = false
    prompt.dontAskAgain = false
    return change
  }

  const requestTheme = async (mode: ThemeMode) => {
    const targetDark = resolveEffectiveDark(mode, systemPrefersDark.value)
    const disposition = resolveThemeChangeDisposition(
      appSettings.readerThemeSyncPreference,
      isDark.value,
      targetDark,
    )

    if (disposition === 'prompt') {
      pendingChange = { mode, targetDark }
      prompt.dontAskAgain = false
      prompt.visible = true
      return
    }

    applyTheme(mode)
    if (disposition === 'sync') await syncReadingTheme(targetDark)
  }

  const chooseSync = async () => {
    const rememberChoice = prompt.dontAskAgain
    const change = applyPendingTheme()
    if (!change) return
    if (rememberChoice) appSettings.setReaderThemeSyncPreference('sync')
    await syncReadingTheme(change.targetDark)
  }

  const chooseIndependent = () => {
    const rememberChoice = prompt.dontAskAgain
    const change = applyPendingTheme()
    if (!change) return
    if (rememberChoice) appSettings.setReaderThemeSyncPreference('independent')
  }

  const closePrompt = () => {
    pendingChange = null
    prompt.visible = false
    prompt.dontAskAgain = false
  }

  if (!systemWatcherInitialized) {
    systemWatcherInitialized = true
    if (
      themeMode.value === 'auto' &&
      appSettings.readerThemeSyncPreference === 'sync'
    ) {
      void syncReadingTheme(systemPrefersDark.value)
    }
    watch(systemPrefersDark, async (dark, previousDark) => {
      if (
        dark !== previousDark &&
        themeMode.value === 'auto' &&
        appSettings.readerThemeSyncPreference === 'sync'
      ) {
        await syncReadingTheme(dark)
      }
    })
  }

  return {
    prompt,
    requestTheme,
    chooseSync,
    chooseIndependent,
    closePrompt,
  }
}
