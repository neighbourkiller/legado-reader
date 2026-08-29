<template>
  <el-dialog
    :model-value="modelValue"
    title="Tauri 书源批量测试"
    fullscreen
    destroy-on-close
    class="source-audit-dialog"
    modal-class="source-audit-overlay"
    @update:model-value="emit('update:modelValue', $event)"
    @open="handleOpen"
  >
    <el-tabs v-model="activeTab" class="audit-tabs">
      <el-tab-pane label="在线书源" name="online">
        <div class="audit-toolbar">
          <el-segmented v-model="mode" :options="modeOptions" :disabled="running" />
          <el-select v-model="scope" class="scope-select" :disabled="running">
            <el-option label="全部已导入（0/2 在线，其余静态）" value="all" />
            <el-option label="仅已启用" value="enabled" />
            <el-option label="仅文本类型 0" value="text" />
            <el-option label="仅图片类型 2" value="image" />
          </el-select>
          <span class="toolbar-label">并发</span>
          <el-input-number v-model="concurrency" :min="1" :max="3" :disabled="running" />
          <el-button type="primary" :loading="running" @click="startAudit()">开始</el-button>
          <el-button type="danger" plain :disabled="!running" @click="stopAudit">停止</el-button>
          <el-button :disabled="running || !currentRun" @click="rerunByStatus('failed')">重跑失败</el-button>
          <el-button :disabled="running || !currentRun" @click="rerunByStatus('needs-action')">重跑待登录</el-button>
          <el-button :disabled="!currentRun" @click="exportRun(currentRun)">导出脱敏 JSON</el-button>
        </div>

        <div class="audit-filters">
          <el-select v-model="statusFilter" placeholder="状态" clearable>
            <el-option label="全部状态" value="all" />
            <el-option label="失败" value="failed" />
            <el-option label="待处理" value="needs-action" />
            <el-option label="不支持" value="unsupported" />
            <el-option label="在线通过" value="live-passed" />
          </el-select>
          <el-select v-model="groupFilter" placeholder="分组" clearable>
            <el-option label="全部分组" value="all" />
            <el-option v-for="group in groups" :key="group" :label="group" :value="group" />
          </el-select>
          <el-select v-model="capabilityFilter" placeholder="能力" clearable>
            <el-option label="全部能力" value="all" />
            <el-option v-for="capability in capabilities" :key="capability" :label="capability" :value="capability" />
          </el-select>
          <el-tag v-if="currentRun" effect="plain">
            {{ currentRun.status }} · {{ currentRun.entries.length }} 源 · 引擎 v{{ currentRun.engineVersion }}
          </el-tag>
        </div>

        <div ref="auditMatrixHost" class="audit-matrix">
          <el-table-v2
            v-if="auditMatrixWidth > 0 && auditMatrixHeight > 0"
            class="audit-matrix-table"
            :columns="auditColumns"
            :data="filteredEntries"
            :width="auditMatrixWidth"
            :height="auditMatrixHeight"
            :row-height="54"
            :header-height="44"
            row-key="sourceId"
            :row-class="auditRowClass"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="共享夹具" name="fixtures" lazy>
        <div v-loading="fixtureLoading" class="fixture-panel">
          <div class="fixture-summary">
            <el-tag :type="fixtureResults.every(item => item.passed) ? 'success' : 'danger'">
              {{ fixtureResults.filter(item => item.passed).length }} / {{ fixtureResults.length }} 通过
            </el-tag>
            <span>Android 期望来自共享夹具；Tauri 运行时不会改写期望。</span>
          </div>
          <el-table :data="fixtureResults" height="calc(100vh - 220px)" border stripe>
            <el-table-column prop="id" label="夹具 ID" min-width="220" />
            <el-table-column prop="capability" label="能力" width="120" />
            <el-table-column prop="execution" label="执行类型" width="110" />
            <el-table-column label="Android 期望" min-width="240">
              <template #default="{ row }"><code>{{ JSON.stringify(row.androidExpected) }}</code></template>
            </el-table-column>
            <el-table-column label="Tauri 结果" min-width="240">
              <template #default="{ row }"><code>{{ JSON.stringify(row.tauriActual) }}</code></template>
            </el-table-column>
            <el-table-column label="差异" width="100">
              <template #default="{ row }"><el-tag :type="row.passed ? 'success' : 'danger'">{{ row.passed ? '一致' : row.code || '不一致' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="历史对比" name="history" lazy>
        <div class="audit-toolbar">
          <el-button :disabled="history.length === 0" @click="exportRun(history[selectedHistoryIndex])">导出所选</el-button>
          <el-button type="danger" plain :disabled="history.length === 0" @click="clearHistory">清空历史</el-button>
          <el-tag effect="plain">仅保留最近 {{ history.length }} / 20 次</el-tag>
        </div>
        <div class="history-layout">
          <el-table :data="history" highlight-current-row height="calc(100vh - 220px)" @current-change="selectHistory">
            <el-table-column label="开始时间" min-width="170">
              <template #default="{ row }">{{ formatTime(row.startedAt) }}</template>
            </el-table-column>
            <el-table-column prop="mode" label="模式" width="90" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="引擎" width="80"><template #default="{ row }">v{{ row.engineVersion }}</template></el-table-column>
            <el-table-column label="书源" width="80"><template #default="{ row }">{{ row.entries.length }}</template></el-table-column>
          </el-table>
          <div class="history-diff">
            <h3>与上一批次对比</h3>
            <div class="diff-counts">
              <el-tag type="danger">新增失败 {{ diffChanges.filter(item => item.kind === 'new-failure').length }}</el-tag>
              <el-tag type="success">已修复 {{ diffChanges.filter(item => item.kind === 'fixed').length }}</el-tag>
              <el-tag type="warning">状态变化 {{ diffChanges.filter(item => item.kind === 'changed').length }}</el-tag>
            </div>
            <el-table :data="diffChanges" height="calc(100vh - 330px)" empty-text="相邻批次无状态变化">
              <el-table-column prop="sourceName" label="书源" min-width="150" />
              <el-table-column prop="kind" label="变化" width="110" />
              <el-table-column prop="stage" label="阶段" width="90" />
              <el-table-column label="状态" min-width="140">
                <template #default="{ row }">{{ row.from || '-' }} → {{ row.to || '-' }}</template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElTableV2, TableV2FixedDir, type Column } from 'element-plus'
import { useElementSize } from '@vueuse/core'
import 'element-plus/es/components/table-v2/style/css'
import type { BookSource } from '@/source/types/BookSource'
import { SourceAuditRunner, createSourceAuditId } from '@/source/audit/SourceAuditRunner'
import { compareSourceAuditRuns } from '@/source/audit/SourceAuditDiff'
import { runSharedQuickJsFixtures, runSharedSourceFixtures, type SourceFixtureResult } from '@/source/audit/SourceFixtureRunner'
import {
  SOURCE_AUDIT_STAGES,
  type SourceAuditEntry,
  type SourceAuditMode,
  type SourceAuditRun,
  type SourceAuditStage,
  type SourceAuditStageResult,
  type SourceAuditStageStatus,
} from '@/source/audit/SourceAuditTypes'
import { clearSourceAuditHistory, loadSourceAuditHistory, saveSourceAuditRun } from '@/platform/sourceAuditHistory'
import { saveJsonFile } from '@/platform/exportFiles'

const props = defineProps<{
  modelValue: boolean
  sources: BookSource[]
  latestRun?: SourceAuditRun
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  debug: [payload: { source: BookSource; input: string }]
  'latest-run': [run: SourceAuditRun | undefined]
}>()

const activeTab = ref('online')
const mode = ref<SourceAuditMode>('quick')
const modeOptions = [{ label: '快速', value: 'quick' }, { label: '完整', value: 'full' }]
const scope = ref<'all' | 'enabled' | 'text' | 'image'>('all')
const concurrency = ref(1)
const running = ref(false)
const currentRun = ref<SourceAuditRun>()
const history = ref<SourceAuditRun[]>([])
const selectedHistoryIndex = ref(0)
const fixtureResults = ref<SourceFixtureResult[]>([])
const fixtureLoading = ref(false)
const sourceById = ref(new Map<string, BookSource>())
const statusFilter = ref('all')
const groupFilter = ref('all')
const capabilityFilter = ref('all')
let runner: SourceAuditRunner | undefined
let fixtureLoadPromise: Promise<void> | undefined
const auditMatrixHost = ref<HTMLElement | null>(null)
const { width: auditMatrixWidth, height: auditMatrixHeight } = useElementSize(auditMatrixHost)

const auditStages = SOURCE_AUDIT_STAGES
const stageLabels: Record<SourceAuditStage, string> = {
  static: '静态', login: '登录', search: '搜索', explore: '发现', bookInfo: '详情', toc: '目录', content: '正文', image: '图片',
}

const scopedSources = computed(() => props.sources.filter(source => {
  if (scope.value === 'enabled') return source.enabled
  if (scope.value === 'text') return source.bookSourceType === 0
  if (scope.value === 'image') return source.bookSourceType === 2
  return true
}))

const groups = computed(() => [...new Set(props.sources.map(source => source.bookSourceGroup || '未分组'))].sort())
const capabilities = computed(() => [...new Set((currentRun.value?.entries || []).flatMap(entry => entry.capabilities))].sort())

function entryMatchesStatus(entry: SourceAuditEntry) {
  if (statusFilter.value === 'all') return true
  if (statusFilter.value === 'live-passed') return entry.verificationStatus === 'live-passed'
  return Object.values(entry.stages).some(stage => stage?.status === statusFilter.value)
}

const filteredEntries = computed(() => (currentRun.value?.entries || []).filter(entry => {
  const source = sourceById.value.get(entry.sourceId)
  const group = source?.bookSourceGroup || '未分组'
  return entryMatchesStatus(entry)
    && (groupFilter.value === 'all' || group === groupFilter.value)
    && (capabilityFilter.value === 'all' || entry.capabilities.includes(capabilityFilter.value))
}))

function auditRowClass({ rowIndex }: { rowIndex: number }) {
  return rowIndex % 2 === 1 ? 'audit-matrix-row--striped' : ''
}

function stageBadgeClass(status?: SourceAuditStageStatus) {
  if (status === 'passed') return 'audit-stage-badge--passed'
  if (status === 'failed' || status === 'unsupported') return 'audit-stage-badge--failed'
  if (status === 'needs-action' || status === 'running') return 'audit-stage-badge--warning'
  if (status === 'skipped') return 'audit-stage-badge--skipped'
  return 'audit-stage-badge--neutral'
}

function renderStageCell(entry: SourceAuditEntry, stage: SourceAuditStage) {
  const result = entry.stages[stage]
  const label = stageStatusLabel(result)
  const code = stageCodeLabel(result?.code)
  const debuggable = isDebuggable(result?.status)
  return h(debuggable ? 'button' : 'span', {
    class: ['audit-stage-badge', stageBadgeClass(result?.status), {
      'is-debuggable': debuggable,
      'is-single-line': !code,
    }],
    title: label,
    'aria-label': label,
    type: debuggable ? 'button' : undefined,
    onClick: debuggable ? () => openStageDebug(entry, stage) : undefined,
  }, [
    h('span', { class: 'audit-stage-badge__status' }, stageStatusName(result)),
    code ? h('span', { class: 'audit-stage-badge__code' }, code) : undefined,
  ])
}

const auditColumns = computed<Column<SourceAuditEntry>[]>(() => {
  const columns: Column<SourceAuditEntry>[] = [
    {
      key: 'sourceName', dataKey: 'sourceName', title: '书源', width: 245, fixed: TableV2FixedDir.LEFT,
      cellRenderer: ({ rowData }) => h('span', { class: 'audit-source-name', title: rowData.sourceName }, rowData.sourceName),
    },
    { key: 'sourceType', dataKey: 'sourceType', title: '类型', width: 64, align: 'center' },
    {
      key: 'capabilities', dataKey: 'capabilities', title: '能力', width: 260,
      cellRenderer: ({ rowData }) => h('span', { class: 'audit-capabilities', title: rowData.capabilities.join(', ') }, rowData.capabilities.join(', ') || '-'),
    },
  ]
  columns.push(...auditStages.map(stage => ({
    key: stage, dataKey: stage, title: stageLabels[stage], width: 112, align: 'center' as const,
    cellRenderer: ({ rowData }: { rowData: SourceAuditEntry }) => renderStageCell(rowData, stage),
  })))
  columns.push({
    key: 'verificationStatus', dataKey: 'verificationStatus', title: '验证', width: 114, fixed: TableV2FixedDir.RIGHT, align: 'center',
    cellRenderer: ({ rowData }) => h('span', {
      class: ['audit-verification-badge', rowData.verificationStatus === 'live-passed' ? 'is-passed' : ''],
      title: rowData.verificationStatus,
    }, verificationStatusLabel(rowData.verificationStatus)),
  })
  return columns
})

const diffChanges = computed(() => compareSourceAuditRuns(
  history.value[selectedHistoryIndex.value], history.value[selectedHistoryIndex.value + 1],
))

async function rebuildSourceMap() {
  const pairs = await Promise.all(props.sources.map(async source => [await createSourceAuditId(source.bookSourceUrl), source] as const))
  sourceById.value = new Map(pairs)
}

async function refreshHistory() {
  history.value = await loadSourceAuditHistory()
  if (!running.value) currentRun.value = history.value[0]
  selectedHistoryIndex.value = 0
  emit('latest-run', history.value[0])
}

function ensureFixtureResults() {
  if (fixtureLoadPromise) return fixtureLoadPromise
  fixtureLoadPromise = (async () => {
    fixtureLoading.value = true
    try {
      const sourceFixtures = runSharedSourceFixtures()
      fixtureResults.value = sourceFixtures
      fixtureResults.value = [...sourceFixtures, ...await runSharedQuickJsFixtures()]
    } finally {
      fixtureLoading.value = false
    }
  })()
  return fixtureLoadPromise
}

async function handleOpen() {
  // 书源管理页已经读取过最近一次记录；先同步展示它，避免被夹具校验阻塞首屏。
  if (!running.value && props.latestRun) currentRun.value = props.latestRun
  // ID 映射只服务于筛选与调试；共享夹具只在切换到对应标签页时加载。
  void rebuildSourceMap().catch(error => {
    ElMessage.error(`准备批测书源映射失败：${error instanceof Error ? error.message : String(error)}`)
  })
  try {
    await refreshHistory()
  } catch (error) {
    ElMessage.error(`读取批测历史失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function startAudit(targets = scopedSources.value) {
  if (running.value || targets.length === 0) return
  running.value = true
  await rebuildSourceMap()
  runner = new SourceAuditRunner({
    mode: mode.value,
    concurrency: concurrency.value,
    onUpdate: run => { currentRun.value = run },
  })
  try {
    const run = await runner.run(targets)
    currentRun.value = run
    history.value = await saveSourceAuditRun(run)
    selectedHistoryIndex.value = 0
    emit('latest-run', history.value[0])
    ElMessage.success(run.status === 'cancelled' ? '批测已停止并保存' : '批测完成')
  } catch (error) {
    ElMessage.error(`批测执行失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    running.value = false
  }
}

function stopAudit() {
  runner?.stop()
}

async function rerunByStatus(status: 'failed' | 'needs-action') {
  if (!currentRun.value) return
  const ids = new Set(currentRun.value.entries
    .filter(entry => Object.values(entry.stages).some(stage => stage?.status === status))
    .map(entry => entry.sourceId))
  const targets = [...ids].map(id => sourceById.value.get(id)).filter((source): source is BookSource => Boolean(source))
  if (targets.length === 0) {
    ElMessage.info(status === 'failed' ? '没有可重跑的失败源' : '没有可重跑的待登录源')
    return
  }
  await startAudit(targets)
}

function isDebuggable(status?: SourceAuditStageStatus) {
  return status === 'failed' || status === 'needs-action' || status === 'unsupported'
}

function openStageDebug(entry: SourceAuditEntry, stage: SourceAuditStage) {
  if (!isDebuggable(entry.stages[stage]?.status)) return
  const source = sourceById.value.get(entry.sourceId)
  if (!source) {
    ElMessage.warning('历史中的书源已不在当前导入列表中')
    return
  }
  emit('debug', { source, input: runner?.getDebugInput(entry.sourceId, stage) || source.ruleSearch?.checkKeyWord || '系统' })
}

function stageTagType(status?: SourceAuditStageStatus) {
  if (status === 'passed') return 'success'
  if (status === 'failed' || status === 'unsupported') return 'danger'
  if (status === 'needs-action' || status === 'running') return 'warning'
  return 'info'
}

function stageStatusLabel(result?: SourceAuditStageResult) {
  if (!result) return '未测试'
  return result.code ? `${stageStatusName(result)} · ${result.code}` : stageStatusName(result)
}

function stageStatusName(result?: SourceAuditStageResult) {
  if (!result) return '未测试'
  const labels: Record<SourceAuditStageStatus, string> = {
    untested: '未测试', running: '运行中', passed: '通过', failed: '失败', unsupported: '不支持',
    'needs-action': '待处理', skipped: '跳过',
  }
  return labels[result.status]
}

function stageCodeLabel(code?: string) {
  if (!code) return ''
  const labels: Record<string, string> = {
    QUICK_MODE: '快速模式',
    NOT_CONFIGURED: '未配置',
    DEPENDENCY_SEARCH: '依赖搜索',
    DEPENDENCY_NEEDS_LOGIN: '需先登录',
    DEPENDENCY_UNSUPPORTED: '前置不支持',
    DEPENDENCY_FAILED: '前置失败',
    HTTP_ERROR: 'HTTP 错误',
    EMPTY_RESULT: '无结果',
    TIMEOUT: '超时',
    NETWORK_ERROR: '网络错误',
    DNS_ERROR: 'DNS 错误',
    WEBVIEW_ERROR: '网页视图错误',
    JS_EXECUTION_ERROR: '脚本执行错误',
    RULE_SYNTAX_ERROR: '规则语法错误',
    SECURITY_CHALLENGE: '需要验证',
    NEEDS_LOGIN: '需要登录',
    UNSUPPORTED_ANDROID_API: 'Android 限制',
    UNSUPPORTED_SOURCE_TYPE: '书源类型不支持',
    CANCELLED: '已取消',
  }
  return labels[code] || code.replace(/_/g, ' ')
}

function verificationStatusLabel(status: SourceAuditEntry['verificationStatus']) {
  if (status === 'live-passed') return '在线通过'
  if (status === 'untested') return '未测试'
  return status
}

async function exportRun(run?: SourceAuditRun) {
  if (!run) return
  const name = `source-audit-${new Date(run.startedAt).toISOString().replace(/[:.]/g, '-')}.json`
  const path = await saveJsonFile(JSON.stringify(run, null, 2), name)
  if (path) ElMessage.success('脱敏批测报告已导出')
}

function selectHistory(run?: SourceAuditRun) {
  if (!run) return
  selectedHistoryIndex.value = Math.max(0, history.value.indexOf(run))
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm('仅清空批测历史文件，不影响书源、Cookie 和业务数据库。', '清空批测历史', { type: 'warning' })
    await clearSourceAuditHistory()
    history.value = []
    currentRun.value = undefined
    emit('latest-run', undefined)
    ElMessage.success('批测历史已清空')
  } catch {
    // 用户取消
  }
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN')
}

watch(() => props.sources, () => {
  if (props.modelValue) void rebuildSourceMap()
}, { deep: false })

watch(activeTab, tab => {
  if (tab === 'fixtures') void ensureFixtureResults()
})
</script>

<style scoped>
.audit-tabs { height: calc(100vh - 80px); }
.audit-toolbar, .audit-filters, .fixture-summary, .diff-counts {
  display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
}
.scope-select { width: 260px; }
.toolbar-label, .fixture-summary span { color: var(--el-text-color-secondary); font-size: 13px; }
.audit-filters .el-select { width: 160px; }
.audit-matrix {
  height: calc(100vh - 285px);
  min-height: 280px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}
.audit-matrix-table { --el-table-v2-row-height: 54px; }
.audit-matrix :deep(.el-table-v2__header-cell), .audit-matrix :deep(.el-table-v2__row-cell) {
  border-right: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.audit-matrix :deep(.el-table-v2__header-cell) {
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}
.audit-matrix :deep(.el-table-v2__row-cell) { padding: 0 6px; }
.audit-matrix :deep(.audit-matrix-row--striped .el-table-v2__row-cell) { background: var(--el-fill-color-lighter); }
.audit-matrix :deep(.audit-source-name), .audit-matrix :deep(.audit-capabilities) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-matrix :deep(.audit-stage-badge) {
  display: flex;
  inline-size: 100%;
  min-inline-size: 0;
  min-block-size: 38px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 4px 5px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  color: var(--el-text-color-secondary);
  font-family: inherit;
  line-height: 15px;
  text-align: center;
  white-space: nowrap;
}
.audit-matrix :deep(.audit-stage-badge:not(.is-single-line)) { flex-direction: column; }
.audit-matrix :deep(.audit-stage-badge__status) { font-size: 12px; font-weight: 600; }
.audit-matrix :deep(.audit-stage-badge__code) {
  max-inline-size: 100%;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-family: var(--el-font-family);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-matrix :deep(button.audit-stage-badge) {
  appearance: none;
  background: var(--el-bg-color);
}
.audit-matrix :deep(.audit-stage-badge--passed) {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.audit-matrix :deep(.audit-stage-badge--failed) {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
.audit-matrix :deep(.audit-stage-badge--warning) {
  border-color: var(--el-color-warning-light-5);
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}
.audit-matrix :deep(.audit-stage-badge--skipped) {
  border-color: var(--el-border-color);
  background: var(--el-fill-color-light);
}
.audit-matrix :deep(.audit-stage-badge--passed .audit-stage-badge__code),
.audit-matrix :deep(.audit-stage-badge--failed .audit-stage-badge__code),
.audit-matrix :deep(.audit-stage-badge--warning .audit-stage-badge__code) { color: currentcolor; opacity: 0.78; }
.audit-matrix :deep(.audit-stage-badge.is-debuggable) { cursor: pointer; }
.audit-matrix :deep(.audit-stage-badge.is-debuggable:hover), .audit-matrix :deep(.audit-stage-badge.is-debuggable:focus-visible) {
  border-color: currentcolor;
  box-shadow: 0 0 0 2px var(--el-color-danger-light-8);
  outline: none;
}
.audit-matrix :deep(.audit-verification-badge) {
  display: inline-block;
  max-inline-size: 100%;
  overflow: hidden;
  padding: 4px 7px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}
.audit-matrix :deep(.audit-verification-badge.is-passed) {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}
.fixture-panel { min-height: calc(100vh - 220px); }
.history-layout { display: grid; grid-template-columns: minmax(420px, 0.8fr) minmax(520px, 1.2fr); gap: 18px; }
.history-diff h3 { margin: 0 0 12px; }
code { white-space: pre-wrap; word-break: break-all; }
</style>
