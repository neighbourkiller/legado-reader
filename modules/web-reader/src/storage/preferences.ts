import { platform } from '@/platform/capabilities'

const desktopPrefCache = new Map<string, string>()

export async function initDesktopPreferences(): Promise<void> {
  if (!platform.isDesktop) return
  const { invoke } = await import('@tauri-apps/api/core')
  const prefs = await invoke<Record<string, string>>('storage_get_all_preferences')
  desktopPrefCache.clear()
  for (const [k, v] of Object.entries(prefs)) {
    desktopPrefCache.set(k, v)
  }
}

export function getPreference(key: string): string | null {
  if (platform.isDesktop) {
    return desktopPrefCache.get(key) ?? null
  }
  return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
}

export async function setPreference(key: string, value: string): Promise<void> {
  if (platform.isDesktop) {
    desktopPrefCache.set(key, value)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('storage_save_preference', { key, value })
  } else {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
    }
  }
}

export async function removePreference(key: string): Promise<void> {
  if (platform.isDesktop) {
    desktopPrefCache.delete(key)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('storage_delete_preference', { key })
  } else {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key)
    }
  }
}
