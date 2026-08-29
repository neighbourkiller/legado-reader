import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8')

describe('书源分组下拉框开关', () => {
  it('再次点击顶部筛选框时关闭自动完成下拉层', () => {
    const sidebar = source('./BookSourceSidebar.vue')
    expect(sidebar).toContain('ref="sourceGroupAutocompleteRef"')
    expect(sidebar).toContain('@mousedown.capture="handleGroupAutocompleteMouseDown"')
    expect(sidebar).toContain('autocomplete.close()')
    expect(sidebar).toContain('event.stopImmediatePropagation()')
    expect(sidebar).toContain('autocomplete.handleKeyEnter()')
  })

  it('再次点击编辑区书源分组输入框时关闭下拉层', () => {
    const editor = source('./SourceEditPanel.vue')
    expect(editor).toContain('ref="bookSourceGroupSelectRef"')
    expect(editor).toContain('@mousedown.capture="handleBookSourceGroupSelectMouseDown"')
    expect(editor).toContain('bookSourceGroupSelectRef.value.blur()')
    expect(editor).toContain('event.stopImmediatePropagation()')
  })
})
