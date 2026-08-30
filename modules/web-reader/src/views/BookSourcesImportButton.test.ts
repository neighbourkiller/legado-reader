import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bookSourcesView = readFileSync(resolve(__dirname, './BookSourcesView.vue'), 'utf-8')

describe('书源导入入口', () => {
  it('把导入书源放入前往菜单并复用原有导入弹窗', () => {
    expect(bookSourcesView).toContain('<el-dropdown-item command="import"><el-icon><Download /></el-icon>导入书源</el-dropdown-item>')
    expect(bookSourcesView).toContain("if (command === 'import') openImportDialog()")
    expect(bookSourcesView).toContain('  Download,')
    expect(bookSourcesView).not.toContain('<el-button @click="openImportDialog">')
  })

  it('使用四条横线的图标按钮打开前往菜单', () => {
    expect(bookSourcesView).toContain('<button\n            type="button"\n            class="navigate-menu-button"')
    expect(bookSourcesView).toContain('class="navigate-menu-button"')
    expect(bookSourcesView).toContain('aria-label="前往"')
    expect(bookSourcesView).toContain('<path d="M5 6h14M5 10h14M5 14h14M5 18h14" />')
    expect(bookSourcesView).not.toContain('<el-button>前往')
    expect(bookSourcesView).toContain('background: transparent;')
    expect(bookSourcesView).toContain('.navigate-menu-button:focus-visible')
  })
})
