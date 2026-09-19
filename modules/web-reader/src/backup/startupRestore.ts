import type { RestoreMode } from './types'

export const STARTUP_RESTORE_GUIDE_VERSION = 1
export const STARTUP_RESTORE_GUIDE_KEY = 'legado_startup_restore_guide_version'

/**
 * 首次恢复入口只在支持本地备份、书架加载完成、没有书籍且用户未关闭时展示。
 * 保持此判断独立，避免加载中的短暂空数组误触发引导。
 */
export function shouldShowStartupRestoreGuide(
  supportsLocalBackup: boolean,
  isLoading: boolean,
  bookCount: number,
  dismissedVersion: string | null,
): boolean {
  const version = Number.parseInt(dismissedVersion ?? '0', 10)
  const dismissed = Number.isFinite(version) && version >= STARTUP_RESTORE_GUIDE_VERSION
  return supportsLocalBackup && !isLoading && bookCount === 0 && !dismissed
}

// 首次引导绝不覆盖现有数据；即使状态在选择文件期间变化，也只执行合并恢复。
export const STARTUP_RESTORE_MODE: RestoreMode = 'merge'
