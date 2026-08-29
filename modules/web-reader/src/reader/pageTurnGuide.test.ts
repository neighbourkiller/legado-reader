import { describe, expect, it } from 'vitest'
import { shouldShowReaderPageTurnGuide } from './pageTurnGuide'

describe('阅读翻页引导', () => {
  it('首次进入或旧版本时展示', () => {
    expect(shouldShowReaderPageTurnGuide(null)).toBe(true)
    expect(shouldShowReaderPageTurnGuide('0')).toBe(true)
    expect(shouldShowReaderPageTurnGuide('not-a-version')).toBe(true)
  })

  it('已展示当前版本后不再重复展示', () => {
    expect(shouldShowReaderPageTurnGuide('1')).toBe(false)
    expect(shouldShowReaderPageTurnGuide('2')).toBe(false)
  })
})
