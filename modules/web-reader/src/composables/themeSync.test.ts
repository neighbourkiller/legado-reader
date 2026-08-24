import { describe, expect, it } from 'vitest'
import { resolveSyncedReaderTheme } from '@/stores/reading'
import { resolveEffectiveDark } from './useTheme'
import { resolveThemeChangeDisposition } from './useThemeController'

describe('全局主题同步决策', () => {
  it('只有实际明暗变化且偏好为 none 时询问', () => {
    expect(resolveThemeChangeDisposition('none', false, true)).toBe('prompt')
    expect(resolveThemeChangeDisposition('none', true, true)).toBe('apply')
    expect(resolveThemeChangeDisposition('independent', false, true)).toBe('apply')
    expect(resolveThemeChangeDisposition('sync', false, true)).toBe('sync')
  })

  it('正确计算跟随系统模式的实际明暗状态', () => {
    expect(resolveEffectiveDark('auto', true)).toBe(true)
    expect(resolveEffectiveDark('auto', false)).toBe(false)
    expect(resolveEffectiveDark('light', true)).toBe(false)
    expect(resolveEffectiveDark('dark', false)).toBe(true)
  })

  it('同步到浅色时只替换夜间主题', () => {
    expect(resolveSyncedReaderTheme(1, true)).toBe(6)
    expect(resolveSyncedReaderTheme(6, false)).toBe(1)
    expect(resolveSyncedReaderTheme(3, false)).toBe(3)
  })
})
