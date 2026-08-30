const MODULE_RELOAD_KEY = 'legado:dev-module-reload-at'
const MODULE_RELOAD_WINDOW_MS = 15_000

function isModuleImportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Importing a module script failed|Failed to fetch dynamically imported module/i.test(message)
}

/**
 * Vite 首次发现新的预构建依赖时会刷新页面，刷新前尚未完成的动态 import
 * 在 WebKitGTK 中表现为 module script failed。开发模式只允许主动恢复一次，
 * 第二次失败继续走正常错误报告，避免真实模块错误形成刷新循环。
 */
export function recoverTransientDevModuleFailure(
  error: unknown,
  dependencies: {
    dev?: boolean
    now?: number
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
    reload?: () => void
  } = {},
): boolean {
  const dev = dependencies.dev ?? import.meta.env.DEV
  if (!dev || !isModuleImportFailure(error)) return false

  const storage = dependencies.storage ?? window.sessionStorage
  const now = dependencies.now ?? Date.now()
  const previousValue = storage.getItem(MODULE_RELOAD_KEY)
  const previous = previousValue === null ? Number.NaN : Number(previousValue)
  if (Number.isFinite(previous) && now - previous < MODULE_RELOAD_WINDOW_MS) {
    storage.removeItem(MODULE_RELOAD_KEY)
    return false
  }

  storage.setItem(MODULE_RELOAD_KEY, String(now))
  ;(dependencies.reload ?? (() => window.location.reload()))()
  return true
}

export function clearDevModuleRecovery(storage: Pick<Storage, 'removeItem'> = window.sessionStorage) {
  storage.removeItem(MODULE_RELOAD_KEY)
}
