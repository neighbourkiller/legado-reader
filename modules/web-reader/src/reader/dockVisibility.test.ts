import { describe, expect, it } from 'vitest'
import {
  READER_DOCK_REVEAL_HEIGHT,
  READER_DOCK_REVEAL_MAX_WIDTH,
  isPointerNearReaderDock,
} from './dockVisibility'

describe('阅读页 Dock 邻近热区', () => {
  const viewport = { viewportWidth: 1280, viewportHeight: 800 }

  it('仅在窗口底部中央的 Dock 邻近区域显示', () => {
    expect(isPointerNearReaderDock({ clientX: 640, clientY: 799, ...viewport })).toBe(true)
    expect(isPointerNearReaderDock({
      clientX: 640,
      clientY: 800 - READER_DOCK_REVEAL_HEIGHT - 1,
      ...viewport,
    })).toBe(false)
    expect(isPointerNearReaderDock({
      clientX: (1280 - READER_DOCK_REVEAL_MAX_WIDTH) / 2 - 1,
      clientY: 799,
      ...viewport,
    })).toBe(false)
  })

  it('窄窗口保留两侧安全边距并拒绝无效视口', () => {
    expect(isPointerNearReaderDock({
      clientX: 12,
      clientY: 600,
      viewportWidth: 360,
      viewportHeight: 640,
    })).toBe(true)
    expect(isPointerNearReaderDock({
      clientX: 0,
      clientY: 600,
      viewportWidth: 360,
      viewportHeight: 640,
    })).toBe(false)
    expect(isPointerNearReaderDock({
      clientX: 0,
      clientY: 0,
      viewportWidth: 0,
      viewportHeight: 0,
    })).toBe(false)
  })
})
