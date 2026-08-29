import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('SourceBatchAuditDialog.vue 开发批测界面', () => {
  const dialog = readFileSync(resolve(__dirname, './SourceBatchAuditDialog.vue'), 'utf8')
  const manager = readFileSync(resolve(__dirname, '../views/BookSourcesView.vue'), 'utf8')
  const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf8')

  it('入口只在 Tauri 开发构建显示', () => {
    expect(manager).toContain('platform.isDesktop && import.meta.env.DEV')
    expect(manager).toContain('v-if="showSourceAuditEntry"')
  })

  it('提供在线、共享夹具、历史对比与停止重跑操作', () => {
    expect(dialog).toContain('label="在线书源"')
    expect(dialog).toContain('label="共享夹具"')
    expect(dialog).toContain('label="历史对比"')
    expect(dialog).toContain('stopAudit')
    expect(dialog).toContain("rerunByStatus('failed')")
    expect(dialog).toContain("rerunByStatus('needs-action')")
  })

  it('包含八阶段矩阵、脱敏导出和单源调试联动', () => {
    expect(dialog).toContain('SOURCE_AUDIT_STAGES')
    expect(dialog).toContain('导出脱敏 JSON')
    expect(dialog).toContain("emit('debug'")
    expect(manager).toContain('runDebugInput')
  })

  it('桌面非全屏时为 Teleport 全屏对话框预留标题栏安全区', () => {
    expect(dialog).toContain('modal-class="source-audit-overlay"')
    expect(app).toContain('html.desktop-with-titlebar .source-audit-overlay .el-overlay-dialog')
    expect(app).toContain('top: 36px;')
  })

  it('打开批测页面时把最近一次历史恢复到在线结果矩阵', () => {
    expect(dialog).toContain('@open="handleOpen"')
    expect(dialog).toContain('if (!running.value) currentRun.value = history.value[0]')
    expect(dialog).toContain('currentRun.value = undefined')
  })

  it('优先恢复最近一次结果，并把共享夹具推迟到对应标签页', () => {
    expect(manager).toContain(':latest-run="latestAuditRun"')
    expect(dialog).toContain('if (!running.value && props.latestRun) currentRun.value = props.latestRun')
    expect(dialog).toContain('await rebuildSourceMap()')
    expect(dialog).toContain('if (tab === \'fixtures\') void ensureFixtureResults()')
    expect(dialog).toContain('await runSharedQuickJsFixtures()')
  })

  it('在线阶段矩阵使用虚拟表格与轻量状态徽标', () => {
    expect(dialog).toContain('<el-table-v2')
    expect(dialog).toContain('const auditColumns = computed<Column<SourceAuditEntry>[]>')
    expect(dialog).toContain("h(debuggable ? 'button' : 'span'")
    expect(dialog).toContain('label="共享夹具" name="fixtures" lazy')
    expect(dialog).toContain('label="历史对比" name="history" lazy')
  })

  it('把阶段状态和原因限制在单元格内，并为动态渲染节点应用样式', () => {
    expect(dialog).toContain("h('span', { class: 'audit-stage-badge__status' }")
    expect(dialog).toContain("h('span', { class: 'audit-stage-badge__code' }")
    expect(dialog).toContain('function stageCodeLabel(code?: string)')
    expect(dialog).toContain('.audit-matrix :deep(.audit-stage-badge)')
    expect(dialog).toContain('inline-size: 100%')
    expect(dialog).toContain("if (status === 'live-passed') return '在线通过'")
  })
})
