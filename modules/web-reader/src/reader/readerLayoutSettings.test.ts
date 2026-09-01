import { describe, expect, it } from 'vitest'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'
import {
  READER_CONTENT_PADDING_MAX,
  READER_DOCK_HEIGHT_MAX,
  READER_DOCK_HEIGHT_MIN,
  normalizeReaderLayoutSettings,
} from './readerLayoutSettings'

describe('阅读页布局设置归一化', () => {
  it('旧设置缺少布局字段时补齐当前视觉默认值', () => {
    expect(normalizeReaderLayoutSettings({})).toEqual({
      contentPaddingTop: DEFAULT_READ_SETTINGS.contentPaddingTop,
      contentPaddingBottom: DEFAULT_READ_SETTINGS.contentPaddingBottom,
      dockHeight: DEFAULT_READ_SETTINGS.dockHeight,
    })
  })

  it('限制正文边距和 Dock 高度，避免无效持久化值破坏布局', () => {
    expect(normalizeReaderLayoutSettings({
      contentPaddingTop: -12,
      contentPaddingBottom: 999,
      dockHeight: 20,
    })).toEqual({
      contentPaddingTop: 0,
      contentPaddingBottom: READER_CONTENT_PADDING_MAX,
      dockHeight: READER_DOCK_HEIGHT_MIN,
    })

    expect(normalizeReaderLayoutSettings({ dockHeight: 999 }).dockHeight)
      .toBe(READER_DOCK_HEIGHT_MAX)
  })
})
