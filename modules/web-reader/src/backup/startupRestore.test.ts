import { describe, expect, it } from 'vitest'
import {
  shouldShowStartupRestoreGuide,
  STARTUP_RESTORE_GUIDE_VERSION,
  STARTUP_RESTORE_MODE,
} from './startupRestore'

describe('首次启动恢复引导', () => {
  it('在支持本地备份、书架加载完成、为空且未关闭时显示', () => {
    expect(shouldShowStartupRestoreGuide(true, false, 0, null)).toBe(true)
    expect(shouldShowStartupRestoreGuide(false, false, 0, null)).toBe(false)
    expect(shouldShowStartupRestoreGuide(true, true, 0, null)).toBe(false)
    expect(shouldShowStartupRestoreGuide(true, false, 1, null)).toBe(false)
  })

  it('关闭后不再显示，无法识别的旧值不影响引导', () => {
    expect(shouldShowStartupRestoreGuide(
      true,
      false,
      0,
      String(STARTUP_RESTORE_GUIDE_VERSION),
    )).toBe(false)
    expect(shouldShowStartupRestoreGuide(true, false, 0, 'invalid')).toBe(true)
  })

  it('固定使用合并恢复，避免首次引导删除数据', () => {
    expect(STARTUP_RESTORE_MODE).toBe('merge')
  })
})
