import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { compileString } from 'sass-embedded'
import { describe, expect, it } from 'vitest'

describe('ReadSettings 阅读主题滚动条样式', () => {
  it('让滚动轨道透出主题背景，并为浅色与夜间主题提供对应滑块颜色', () => {
    const filename = resolve(__dirname, 'ReadSettings.vue')
    const { descriptor } = parse(readFileSync(filename, 'utf-8'), { filename })
    const scopedStyle = descriptor.styles.find(style => style.scoped)

    expect(scopedStyle).toBeDefined()

    const css = compileString(scopedStyle!.content).css
    const result = compileStyle({
      source: css,
      filename,
      id: 'data-v-read-settings-theme',
      scoped: true,
    })

    expect(result.errors).toEqual([])
    expect(css).toContain(
      'scrollbar-color: var(--reader-settings-scrollbar-thumb) var(--reader-settings-scrollbar-track);',
    )
    expect(css).toContain(
      '.settings-wrapper .setting-list::-webkit-scrollbar-track',
    )
    expect(css).toContain(
      '--reader-settings-scrollbar-thumb: rgba(51, 51, 51, 0.26);',
    )
    expect(css).toContain(
      '--reader-settings-scrollbar-thumb: rgba(200, 200, 200, 0.32);',
    )
  })
})
