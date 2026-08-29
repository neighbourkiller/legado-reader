import { describe, expect, it } from 'vitest'
import { shouldShowStartupRestoreGuide, STARTUP_RESTORE_MODE } from './startupRestore'

describe('首次启动恢复引导', () => {
  it('在支持本地备份、书架加载完成且为空时显示', () => {
    expect(shouldShowStartupRestoreGuide(true, false, 0)).toBe(true)
    expect(shouldShowStartupRestoreGuide(false, false, 0)).toBe(false)
    expect(shouldShowStartupRestoreGuide(true, true, 0)).toBe(false)
    expect(shouldShowStartupRestoreGuide(true, false, 1)).toBe(false)
  })

  it('固定使用合并恢复，避免首次引导删除数据', () => {
    expect(STARTUP_RESTORE_MODE).toBe('merge')
  })
})
