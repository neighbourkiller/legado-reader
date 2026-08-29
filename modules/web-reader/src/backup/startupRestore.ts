import type { RestoreMode } from './types'

/**
 * 首次恢复入口只在支持本地备份、书架加载完成且没有书籍时展示。
 * 保持此判断独立，避免加载中的短暂空数组误触发引导。
 */
export function shouldShowStartupRestoreGuide(
  supportsLocalBackup: boolean,
  isLoading: boolean,
  bookCount: number,
): boolean {
  return supportsLocalBackup && !isLoading && bookCount === 0
}

// 首次引导绝不覆盖现有数据；即使状态在选择文件期间变化，也只执行合并恢复。
export const STARTUP_RESTORE_MODE: RestoreMode = 'merge'
