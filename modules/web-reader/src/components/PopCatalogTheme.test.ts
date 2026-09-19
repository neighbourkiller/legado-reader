import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { compileString } from 'sass-embedded'
import { describe, expect, it } from 'vitest'

describe('PopCatalog 阅读主题文字样式', () => {
  it('为浅色与夜间目录提供独立文字色，不继承全局主题颜色', () => {
    const filename = resolve(__dirname, 'PopCatalog.vue')
    const { descriptor } = parse(readFileSync(filename, 'utf-8'), { filename })
    const scopedStyle = descriptor.styles.find(style => style.scoped)

    expect(scopedStyle).toBeDefined()

    const css = compileString(scopedStyle!.content).css
    const result = compileStyle({
      source: css,
      filename,
      id: 'data-v-pop-catalog-theme',
      scoped: true,
    })

    expect(result.errors).toEqual([])
    expect(result.code).toMatch(
      /\.catalog-scroll-container\.day\[data-v-pop-catalog-theme\]\s*\{\s*color:\s*#333;/,
    )
    expect(result.code).toMatch(
      /\.catalog-scroll-container\.night\[data-v-pop-catalog-theme\]\s*\{\s*color:\s*#c8c8c8;/,
    )
  })
})
