// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import themeConfig from '@/config/themeConfig'
import {
  DEFAULT_READER_SURFACE_BACKGROUND,
  READER_SURFACE_BACKGROUND_PROPERTY,
  READER_SURFACE_CLASS,
  resolveReaderSurfaceBackground,
  syncReaderSurfaceDocument,
} from './readerSurface'

describe('阅读页滚动承载层背景', () => {
  beforeEach(() => {
    document.documentElement.classList.remove(READER_SURFACE_CLASS)
    document.documentElement.style.removeProperty(READER_SURFACE_BACKGROUND_PROPERTY)
  })

  it('使用当前阅读主题的正文框外背景并为越界主题提供兜底', () => {
    expect(resolveReaderSurfaceBackground(0)).toBe(themeConfig.themes[0]?.body)
    expect(resolveReaderSurfaceBackground(999)).toBe(DEFAULT_READER_SURFACE_BACKGROUND)
  })

  it('进入阅读页时同步根画布，离开时清理，避免主题泄漏到其他路由', () => {
    const background = resolveReaderSurfaceBackground(1)

    syncReaderSurfaceDocument(true, background)

    expect(document.documentElement.classList.contains(READER_SURFACE_CLASS)).toBe(true)
    expect(
      document.documentElement.style.getPropertyValue(READER_SURFACE_BACKGROUND_PROPERTY),
    ).toBe(background)

    syncReaderSurfaceDocument(false, background)

    expect(document.documentElement.classList.contains(READER_SURFACE_CLASS)).toBe(false)
    expect(
      document.documentElement.style.getPropertyValue(READER_SURFACE_BACKGROUND_PROPERTY),
    ).toBe('')
  })
})
