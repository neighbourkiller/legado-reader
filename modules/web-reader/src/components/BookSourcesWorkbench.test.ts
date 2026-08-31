import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf8')

describe('书源管理工作台布局', () => {
  const manager = source('../views/BookSourcesView.vue')
  const sidebar = source('./BookSourceSidebar.vue')
  const typography = source('../assets/styles/typography.css')

  it('页面操作、侧栏操作与编辑操作分层', () => {
    expect(manager).toContain('command="bookshelf"')
    expect(manager).toContain('command="settings"')
    expect(manager).toContain('handleEditorSave')
    expect(manager).toContain('handleEditorToolCommand')
    const headerActions = manager.slice(
      manager.indexOf('<div class="header-actions">'),
      manager.indexOf('</div>', manager.indexOf('<div class="header-actions">')),
    )
    expect(headerActions).toContain('批量测试')
    expect(headerActions.indexOf('批量测试')).toBeLessThan(headerActions.indexOf('class="navigate-menu-button"'))
    expect(sidebar).not.toContain('>批量测试</el-button>')
    expect(sidebar).toContain('command="exportJson"')
    expect(sidebar).toContain('导出JSON')
    expect(manager).toContain('serializeLegadoBookSources([source])')
    expect(sidebar).toContain('>全选</el-button>')
    expect(sidebar).toContain('>反选</el-button>')
    expect(sidebar).toContain('>完成</el-button>')
    expect(sidebar).toContain('aria-label="所选书源的更多操作"')
    expect(manager).not.toContain('handleEnableAll')
    expect(manager).not.toContain('handleClearAll')
  })

  it('选择态把 Android 书源批量操作收纳进更多菜单', () => {
    for (const action of [
      '启用所选', '禁用所选', '添加分组', '移除分组', '启用发现', '禁用发现',
      '置顶所选', '置底所选', '导出所选', '分享选中源', '校验所选', '选中所选区间', '删除所选',
    ]) {
      expect(sidebar).toContain(action)
    }
    expect(manager).toContain("'invert-selection': invertFilteredSourcesSelection")
    expect(manager).toContain("'selection-command': handleSelectionCommand")
    expect(manager).toContain(':sources="auditSources"')
  })

  it('编辑与调试切换固定在编辑专属操作之后', () => {
    const actions = manager.slice(
      manager.indexOf('<div class="content-header-actions">'),
      manager.indexOf('</div>', manager.indexOf('<div class="content-header-actions">')),
    )

    expect(actions.indexOf('handleEditorToolCommand')).toBeLessThan(actions.indexOf('v-model="activeViewMode"'))
    expect(actions.indexOf('handleEditorSave')).toBeLessThan(actions.indexOf('v-model="activeViewMode"'))
  })

  it('宽屏侧栏可调节并在窄屏复用为抽屉', () => {
    expect(manager).toContain('role="separator"')
    expect(manager).toContain('startSidebarResize')
    expect(manager).toContain("useMediaQuery('(max-width: 1179px)')")
    expect(manager).toContain('<el-drawer')
    expect(manager.match(/<BookSourceSidebar/g)?.length).toBe(2)
  })

  it('列表把规则兼容与实测状态分开显示', () => {
    expect(sidebar).toContain('ruleStatus(source)')
    expect(sidebar).toContain('auditStatus(source)')
    expect(sidebar).toContain('source-meta-row')
  })

  it('统计数字稳定对齐，并弱化列表 URL 的代码排版', () => {
    expect(manager).toContain('font-variant-numeric: tabular-nums')
    expect(sidebar).toContain('font-variant-numeric: tabular-nums')
    expect(sidebar).toContain('var(--legado-text-muted, var(--el-text-color-secondary))')
    expect(typography).toContain('--legado-text-muted: #686d75')
    expect(typography).toMatch(/html\.dark\s*\{[^}]*--legado-text-muted: var\(--el-text-color-secondary\)/s)
    expect(sidebar).toContain("font-feature-settings: 'calt' 0, 'liga' 0")
    expect(sidebar).toContain('font-variant-ligatures: none')
    expect(sidebar).toContain("'is-placeholder': !draftSource?.bookSourceUrl")
  })
})
