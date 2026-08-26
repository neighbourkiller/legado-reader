import { platform } from '@/platform/capabilities'
import { initDesktopPreferences, getPreference, setPreference } from './preferences'
import { setCachedDeviceId } from './sqliteBackend'

export async function initializeStorage(): Promise<void> {
  if (!platform.isDesktop) {
    return
  }

  const { invoke } = await import('@tauri-apps/api/core')

  // 1. 验证 SQLite 数据库完整性与迁移版本
  const ok = await invoke<boolean>('storage_init_check')
  if (!ok) {
    throw new Error('SQLite 数据库初始化校验未通过')
  }

  // 2. 加载所有桌面端偏好设置到同步内存缓存
  await initDesktopPreferences()

  // 3. 预载阅读设置到同步内存缓存
  const { loadSettings } = await import('./db')
  const { setCachedDesktopReadSettings } = await import('@/stores/reading')
  const readSettings = await loadSettings()
  setCachedDesktopReadSettings(readSettings)

  // 4. 显式水合主题与强调色状态，避免 ES 模块加载时的初始默认值残留
  const { hydrateTheme } = await import('@/composables/useTheme')
  hydrateTheme()

  // 5. 初始化并缓存设备 ID
  let deviceId = getPreference('legado_tauri_device_id')
  if (!deviceId) {
    const suffix = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    deviceId = `tauri-${suffix}`
    await setPreference('legado_tauri_device_id', deviceId)
  }
  setCachedDeviceId(deviceId)
}
