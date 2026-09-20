import { describe, expect, it } from 'vitest'
import { readerPageScrollDistance, resolveReaderViewport } from './readerViewport'

describe('正文可见区域', () => {
  it('滚动到章节中间后仍按宿主边界扣除上下遮罩', () => {
    const bounds = resolveReaderViewport(
      { top: -1200, bottom: 2400, left: 100, right: 700 },
      { top: 36, bottom: 836, left: 0, right: 800 },
      150, 150, false,
    )
    expect(bounds).toEqual({ top: 186, bottom: 686, left: 100, right: 700 })
    expect(readerPageScrollDistance(bounds, 36)).toBe(464)
  })

  it('分页使用正文视口边界并包含桌面标题栏偏移', () => {
    expect(resolveReaderViewport(
      { top: 36, bottom: 800, left: 100, right: 700 },
      { top: 36, bottom: 800, left: 0, right: 800 },
      200, 72, true,
    )).toEqual({ top: 236, bottom: 728, left: 100, right: 700 })
  })

  it('上下边距占满短视口时不会反向滚动', () => {
    const bounds = resolveReaderViewport(
      { top: 0, bottom: 300, left: 0, right: 800 },
      { top: 0, bottom: 300, left: 0, right: 800 },
      200, 200, false,
    )
    expect(bounds.bottom).toBe(bounds.top)
    expect(readerPageScrollDistance(bounds, 36)).toBe(0)
  })
})
