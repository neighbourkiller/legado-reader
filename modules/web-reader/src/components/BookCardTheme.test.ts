import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

describe('BookCard 浅色主题样式', () => {
  it('将浅色覆盖编译到卡片文字，而不是仅作用于 html', () => {
    const filename = resolve(__dirname, 'BookCard.vue')
    const { descriptor } = parse(readFileSync(filename, 'utf-8'), { filename })
    const scopedStyle = descriptor.styles.find(style => style.scoped)

    expect(scopedStyle).toBeDefined()

    const result = compileStyle({
      source: scopedStyle!.content,
      filename,
      id: 'data-v-book-card-theme',
      scoped: true,
    })

    expect(result.errors).toEqual([])
    expect(result.code).toContain(
      'html:not(.dark) .book-title[data-v-book-card-theme]',
    )
    expect(result.code).toContain(
      'html:not(.dark) .sub-info[data-v-book-card-theme]',
    )
    expect(result.code).toContain(
      'html:not(.dark) .dur-chapter[data-v-book-card-theme]',
    )
  })
})
