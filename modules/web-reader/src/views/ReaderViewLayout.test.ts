import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('阅读页正文边距布局', () => {
  it('将上下边距独立应用到同一个正文视口', () => {
    const content = readFileSync(resolve(__dirname, 'ReaderView.vue'), 'utf-8')

    expect(content).toContain(`padding-block: var(--reader-content-padding-top, 38px)
        var(--reader-content-padding-bottom, 72px);`)
    expect(content).toContain('padding: 0 65px;')
    expect(content).not.toContain(
      'padding-bottom: var(--reader-content-padding-bottom, 72px);',
    )
    expect(content).toContain('box-sizing: border-box;')
  })

  it('让翻页过渡层沿用相同的上下边距边界', () => {
    const content = readFileSync(resolve(__dirname, 'ReaderView.vue'), 'utf-8')

    expect(content).toContain('top: var(--reader-content-padding-top, 38px);')
    expect(content).toContain('bottom: var(--reader-content-padding-bottom, 72px);')
    expect(content).toContain('height: auto;')
  })

  it('在连续滚动时用独立的视口安全区即时呈现上下边距', () => {
    const content = readFileSync(resolve(__dirname, 'ReaderView.vue'), 'utf-8')

    expect(content).toContain('&:not(.pagination-chapter)::before')
    expect(content).toContain('&:not(.pagination-chapter)::after')
    expect(content).toContain('height: var(--reader-content-padding-top, 38px);')
    expect(content).toContain('height: var(--reader-content-padding-bottom, 72px);')
  })

  it('在空间足够时将设置面板停靠到正文框左侧', () => {
    const reader = readFileSync(resolve(__dirname, 'ReaderView.vue'), 'utf-8')
    const settings = readFileSync(resolve(__dirname, '../components/ReadSettings.vue'), 'utf-8')

    expect(reader).toContain(':reference-el="settingsPopoverReference"')
    expect(reader).toContain("canDockSettingsPanel.value ? 'left' : 'top'")
    expect(reader).toContain('reader-side-settings-popover')
    expect(reader).toContain('settingsPanelAnchorLeft.value = chapterRect?.left')
    expect(settings).toContain('.reader-side-settings-popover')
    expect(settings).toContain('grid-template-columns: 58px repeat(4, 32px);')
  })
})
