<template>
  <div class="book-sources-view">
    <header class="page-header">
      <div class="header-left">
        <el-button text @click="router.push('/')">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="page-title">书源管理</h2>
        <span class="source-count-tag" v-if="bookSourceStore.sources.length > 0">
          共 {{ bookSourceStore.sources.length }} 个 (已启用 {{ enabledCount }} 个)
        </span>
      </div>
      <div class="header-actions">
        <el-button @click="openImportDialog">
          <el-icon><Download /></el-icon>
          导入书源
        </el-button>
        <el-dropdown @command="handleNavigateCommand">
          <el-button>前往<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="bookshelf"><el-icon><Reading /></el-icon>书架</el-dropdown-item>
              <el-dropdown-item command="search"><el-icon><Search /></el-icon>搜索书籍</el-dropdown-item>
              <el-dropdown-item command="settings"><el-icon><Setting /></el-icon>设置</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <div ref="sourceWorkbenchRef" class="source-workbench" v-loading="bookSourceStore.isLoading">
      <div v-if="!isNarrowLayout" class="desktop-sidebar-shell" :style="{ width: `${liveSidebarWidth}px` }">
        <BookSourceSidebar v-bind="sidebarProps" v-on="sidebarListeners" />
      </div>
      <div
        v-if="!isNarrowLayout"
        class="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="liveSidebarWidth"
        :aria-valuemin="MIN_BOOK_SOURCES_SIDEBAR_WIDTH"
        :aria-valuemax="MAX_BOOK_SOURCES_SIDEBAR_WIDTH"
        tabindex="0"
        @pointerdown="startSidebarResize"
        @keydown="handleSidebarResizeKeydown"
      />

      <main class="source-main-content">
        <template v-if="currentActiveSource">
          <div class="content-header-bar">
            <el-button v-if="isNarrowLayout" class="open-sidebar-button" @click="sidebarDrawerOpen = true">
              <el-icon><Menu /></el-icon>
              书源列表
            </el-button>
            <div class="selected-source-meta">
              <div class="meta-title-row">
                <span v-if="isDrafting" class="draft-tag">新建草稿</span>
                <span class="selected-name" :title="currentActiveSource.bookSourceName">
                  {{ currentActiveSource.bookSourceName || (isDrafting ? '未命名新书源' : '未命名') }}
                </span>
                <el-tag v-if="!isDrafting" size="small" :type="selectedRuleStatus.tone" effect="plain">
                  {{ selectedRuleStatus.label }}
                </el-tag>
                <el-tag v-if="!isDrafting && selectedAuditStatus" size="small" :type="selectedAuditStatus.tone" effect="plain">
                  {{ selectedAuditStatus.label }}
                </el-tag>
                <el-tag size="small" type="info" effect="plain">
                  {{ currentActiveSource.webReaderCompatibilityMode || 'legado' }}模式
                </el-tag>
              </div>
              <div class="selected-url" :title="currentActiveSource.bookSourceUrl">
                {{ currentActiveSource.bookSourceUrl || (isDrafting ? '（待填写基础 URL）' : '') }}
              </div>
            </div>

            <div class="content-header-actions">
              <el-dropdown v-if="activeViewMode === 'edit'" @command="handleEditorToolCommand">
                <el-button>工具<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="convert"><el-icon><MagicStick /></el-icon>XPath 转 CSS</el-dropdown-item>
                    <el-dropdown-item command="reset" divided><el-icon><RefreshLeft /></el-icon>重置未保存修改</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button v-if="activeViewMode === 'edit'" type="primary" @click="handleEditorSave">
                <el-icon><Check /></el-icon>
                {{ isDrafting ? '创建书源' : '保存修改' }}
              </el-button>
              <el-radio-group v-model="activeViewMode" size="default">
                <el-radio-button value="edit">
                  <el-icon><Edit /></el-icon>
                  <span>编辑区</span>
                </el-radio-button>
                <el-radio-button value="debug" :disabled="isDrafting">
                  <el-icon><VideoPlay /></el-icon>
                  <span>调试区</span>
                </el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="content-panel-body">
            <SourceEditPanel
              ref="editPanelRef"
              v-show="activeViewMode === 'edit'"
              :source="currentActiveSource"
              :is-new="isDrafting"
              :group-options="sourceGroups"
              @save="handleSaveEditedSource"
            />
            <SourceDebugPanel
              ref="debugPanelRef"
              v-show="activeViewMode === 'debug'"
              :source="currentActiveSource"
            />
          </div>
        </template>

        <div v-else class="empty-selection-placeholder">
          <el-button v-if="isNarrowLayout" class="empty-sidebar-button" @click="sidebarDrawerOpen = true">
            <el-icon><Menu /></el-icon>
            打开书源列表
          </el-button>
          <el-empty description="请在左侧列表中选择一个书源进行编辑或调试" />
        </div>
      </main>
    </div>

    <el-drawer
      v-if="isNarrowLayout"
      v-model="sidebarDrawerOpen"
      title="书源列表"
      direction="ltr"
      :size="isCompactDrawer ? '92vw' : '420px'"
      modal-class="book-source-drawer-overlay"
      append-to-body
    >
      <BookSourceSidebar v-bind="sidebarProps" v-on="sidebarListeners" />
    </el-drawer>

    <!-- 网页验证 / Cookie 注入 Dialog -->
    <SourceAuthDialog
      v-model="showAuthDialog"
      :source="currentAuthSource"
    />

    <SourceBatchAuditDialog
      v-if="showSourceAuditEntry"
      v-model="showBatchAuditDialog"
      :sources="bookSourceStore.sources"
      :latest-run="latestAuditRun"
      @debug="handleAuditDebug"
      @latest-run="applyLatestAuditRun"
    />

    <!-- 导入书源 Dialog -->
    <el-dialog
      v-model="showImportDialog"
      title="导入书源"
      width="580px"
      center
      align-center
      destroy-on-close
      class="sharp-dialog"
    >
      <div class="import-modal-content">
        <el-tabs v-model="activeImportTab" class="import-tabs">
          <!-- 网络链接导入 -->
          <el-tab-pane label="网络链接导入" name="url">
            <div class="tab-pane-content">
              <p class="import-hint">
                输入网络书源 URL，系统将自动通过原生请求拉取并解析（支持 Legado 书源标准 JSON 数组或单对象）：
              </p>
              <el-input
                v-model="importUrl"
                placeholder="https://..."
                clearable
                :prefix-icon="Link"
                @keyup.enter="handleImport"
                class="sharp-input source-code-input"
              />
              <div class="quick-examples">
                <span class="example-label">推荐示例：</span>
                <el-tag
                  size="small"
                  class="example-tag sharp-tag"
                  type="info"
                  effect="plain"
                  @click="fillExampleUrl('https://shuyuan-api.yiove.com/import/book-sources/1-20')"
                >
                  shuyuan-api 20条热门书源
                </el-tag>
              </div>
            </div>
          </el-tab-pane>

          <!-- 本地文件 / JSON 文本导入 -->
          <el-tab-pane label="JSON 文本 / 文件导入" name="text">
            <div class="tab-pane-content">
              <p class="import-hint">
                粘贴书源 JSON 内容，或从本地上传 <code>.json</code> 文件。
              </p>
              <el-input
                v-model="importJson"
                type="textarea"
                :rows="8"
                placeholder="在此粘贴书源 JSON 内容..."
                class="sharp-textarea source-code-input"
              />
              <div class="import-file-bar">
                <el-button @click="triggerFileImport" class="sharp-btn">从本地 JSON 文件导入</el-button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  class="hidden-input"
                  @change="handleFileImport"
                />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
        <el-form label-position="top" class="import-group-form">
          <el-form-item label="导入分组（可选）">
            <el-select
              v-model="importGroup"
              filterable
              allow-create
              clearable
              default-first-option
              placeholder="选择已有分组或输入新分组"
              class="sharp-input"
              style="width: 100%;"
            >
              <el-option v-for="group in sourceGroups" :key="group" :label="group" :value="group" />
            </el-select>
            <div class="field-help">选择或输入的分组会应用到本次导入的全部书源；留空则保留书源原有分组。</div>
          </el-form-item>
        </el-form>
        <el-checkbox v-model="useSourceReplacement">
          导入前应用已启用的“作用于书源”替换规则
        </el-checkbox>
        <el-alert
          v-if="importPreviewSummary"
          class="replacement-summary sharp-card"
          :type="importPreviewSummary.errors ? 'warning' : 'info'"
          :closable="false"
          :title="`替换预览：改变 ${importPreviewSummary.changed} 条，失败 ${importPreviewSummary.errors} 条`"
        />
        <el-alert
          v-if="importCompatibilitySummary"
          class="replacement-summary sharp-card"
          :type="importCompatibilitySummary.unsupported ? 'warning' : 'info'"
          :closable="false"
          :title="`兼容扫描：部分支持 ${importCompatibilitySummary.partial} 条，不支持 ${importCompatibilitySummary.unsupported} 条（仍会保留并导入）`"
        />
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showImportDialog = false" :disabled="isImporting" class="sharp-btn">取消</el-button>
          <el-button
            type="primary"
            :loading="isImporting"
            :disabled="isImportDisabled"
            @click="handleImport"
            class="sharp-btn"
          >
            {{ isImporting ? '正在拉取导入...' : '开始导入' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMediaQuery } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Download,
  Search,
  Link,
  Edit,
  VideoPlay,
  Reading,
  ArrowDown,
  Check,
  MagicStick,
  Menu,
  RefreshLeft,
  Setting,
} from '@element-plus/icons-vue'
import { useBookSourceStore } from '@/stores/bookSource'
import type { SourceImportPreview, SourceImportResult } from '@/stores/bookSource'
import {
  MAX_BOOK_SOURCES_SIDEBAR_WIDTH,
  MIN_BOOK_SOURCES_SIDEBAR_WIDTH,
  clampBookSourcesSidebarWidth,
  useAppSettingsStore,
} from '@/stores/appSettings'
import type { BookSource } from '@/source/types/BookSource'
import SourceEditPanel from '@/components/SourceEditPanel.vue'
import SourceDebugPanel from '@/components/SourceDebugPanel.vue'
import SourceAuthDialog from '@/components/SourceAuthDialog.vue'
import SourceBatchAuditDialog from '@/components/SourceBatchAuditDialog.vue'
import BookSourceSidebar from '@/components/BookSourceSidebar.vue'
import { copyTextToClipboard } from '@/platform/clipboard'
import { openExternalUrl } from '@/platform/externalBrowser'
import { saveJsonFile } from '@/platform/exportFiles'
import { platform } from '@/platform/capabilities'
import { loadSourceAuditHistory } from '@/platform/sourceAuditHistory'
import { createSourceAuditId } from '@/source/audit/SourceAuditRunner'
import { SOURCE_ENGINE_VERSION, type SourceAuditEntry, type SourceAuditRun } from '@/source/audit/SourceAuditTypes'
import { getAuditStatus, getRuleCompatibilityStatus } from '@/source/audit/SourceStatusPresentation'
import {
  createBookSourceJsonFileName,
  serializeLegadoBookSources,
} from '@/source/export/BookSourceExport'

const router = useRouter()
const bookSourceStore = useBookSourceStore()
const appSettingsStore = useAppSettingsStore()
const { bookSourcesSidebarWidth } = storeToRefs(appSettingsStore)
const isNarrowLayout = useMediaQuery('(max-width: 1179px)')
const isCompactDrawer = useMediaQuery('(max-width: 767px)')
const sidebarDrawerOpen = ref(false)
const sourceWorkbenchRef = ref<HTMLElement | null>(null)
const liveSidebarWidth = ref(bookSourcesSidebarWidth.value)

const showImportDialog = ref(false)
const activeImportTab = ref<'url' | 'text'>('url')
const importUrl = ref('')
const importJson = ref('')
const importGroup = ref('')
const isImporting = ref(false)
const useSourceReplacement = ref(true)
const importPreviewSummary = ref<{ changed: number; errors: number } | null>(null)
const importCompatibilitySummary = ref<{ partial: number; unsupported: number } | null>(null)
const searchKeyword = ref('')
const showSourceAuditEntry = platform.isDesktop && import.meta.env.DEV
const showBatchAuditDialog = ref(false)
const latestAuditRun = ref<SourceAuditRun>()
const latestAuditByUrl = ref(new Map<string, SourceAuditEntry>())
const selectionMode = ref(false)
const selectedUrls = ref(new Set<string>())

type SourceSort = 'default' | 'name' | 'group' | 'enabled'
const sourceSort = ref<SourceSort>('default')
const sourceSortLabels: Record<SourceSort, string> = {
  default: '默认顺序',
  name: '名称',
  group: '分组',
  enabled: '启用优先',
}
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedSourceGroup = ref<string | null>(null)

const sourceGroups = computed(() => Array.from(new Set(
  bookSourceStore.sources
    .map(source => source.bookSourceGroup?.trim())
    .filter((group): group is string => Boolean(group)),
)).sort((a, b) => a.localeCompare(b, 'zh-CN')))

// 选中书源与右侧展示模式
const selectedSourceUrl = ref<string>('')
const activeViewMode = ref<'edit' | 'debug'>('edit')

const editPanelRef = ref<any>(null)
const debugPanelRef = ref<any>(null)
const isDrafting = ref(false)
const draftSource = ref<BookSource | null>(null)

function createEmptySourceTemplate(): BookSource {
  return {
    bookSourceName: '',
    bookSourceUrl: '',
    bookSourceType: 0,
    bookSourceGroup: '',
    enabled: true,
    webReaderCompatibilityMode: 'legado',
    ruleSearch: {},
    ruleBookInfo: {},
    ruleToc: {},
    ruleContent: {},
  }
}

const showAuthDialog = ref(false)
const currentAuthSource = ref<BookSource | null>(null)

onMounted(async () => {
  await bookSourceStore.loadSources()
  if (showSourceAuditEntry) {
    try {
      const history = await loadSourceAuditHistory()
      await applyLatestAuditRun(history[0])
    } catch {
      // 批测历史损坏或暂时不可用不阻塞书源管理页。
    }
  }
})

const enabledCount = computed(() => bookSourceStore.getEnabledSources().length)

async function applyLatestAuditRun(run?: SourceAuditRun) {
  latestAuditRun.value = run
  if (!run) {
    latestAuditByUrl.value = new Map()
    return
  }
  const entries = new Map(run.entries.map(entry => [entry.sourceId, entry]))
  const pairs = await Promise.all(bookSourceStore.sources.map(async source => [
    source.bookSourceUrl,
    entries.get(await createSourceAuditId(source.bookSourceUrl)),
  ] as const))
  latestAuditByUrl.value = new Map(pairs.filter((pair): pair is readonly [string, SourceAuditEntry] => Boolean(pair[1])))
}

async function handleAuditDebug(payload: { source: BookSource; input: string }) {
  showBatchAuditDialog.value = false
  const selected = await selectSource(payload.source)
  if (!selected) return
  activeViewMode.value = 'debug'
  await nextTick()
  await debugPanelRef.value?.runDebugInput?.(payload.input)
}

watch(
  () => bookSourceStore.sources.map(source => source.bookSourceUrl),
  () => { if (latestAuditRun.value) void applyLatestAuditRun(latestAuditRun.value) },
)

const filteredSources = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const keywordFilteredSources = kw ? bookSourceStore.sources.filter(s => {
    const name = s.bookSourceName?.toLowerCase() || ''
    const url = s.bookSourceUrl?.toLowerCase() || ''
    const group = s.bookSourceGroup?.toLowerCase() || ''
    return name.includes(kw) || url.includes(kw) || group.includes(kw)
  }) : bookSourceStore.sources
  const sources = selectedSourceGroup.value === null
    ? keywordFilteredSources
    : keywordFilteredSources.filter(source => (source.bookSourceGroup?.trim() || '') === selectedSourceGroup.value)

  if (sourceSort.value === 'default') return sources

  return [...sources].sort((a, b) => {
    if (Boolean(a.isTop) !== Boolean(b.isTop)) return a.isTop ? -1 : 1
    if (sourceSort.value === 'enabled' && a.enabled !== b.enabled) return a.enabled ? -1 : 1
    if (sourceSort.value === 'group') {
      const groupA = a.bookSourceGroup || '未分组'
      const groupB = b.bookSourceGroup || '未分组'
      return groupA.localeCompare(groupB, 'zh-CN')
        || a.bookSourceName.localeCompare(b.bookSourceName, 'zh-CN')
    }
    return a.bookSourceName.localeCompare(b.bookSourceName, 'zh-CN')
  })
})

// 当前选中的书源对象（优先由 selectedSourceUrl 确定，缺省选中过滤列表第一项）
const selectedSource = computed(() => {
  if (selectedSourceUrl.value) {
    const found = bookSourceStore.sources.find(s => s.bookSourceUrl === selectedSourceUrl.value)
    if (found) return found
  }
  return filteredSources.value[0] || null
})

// 当前工作区所关联的书源对象（草稿模式下为 draftSource，否则为 selectedSource）
const currentActiveSource = computed(() => {
  if (isDrafting.value) {
    return draftSource.value
  }
  return selectedSource.value
})

const auditEngineCurrent = computed(
  () => latestAuditRun.value?.engineVersion === SOURCE_ENGINE_VERSION,
)
const selectedRuleStatus = computed(() => currentActiveSource.value
  ? getRuleCompatibilityStatus(currentActiveSource.value)
  : { label: '规则兼容', tone: 'info' as const })
const selectedAuditStatus = computed(() => currentActiveSource.value
  ? getAuditStatus(
      latestAuditByUrl.value.get(currentActiveSource.value.bookSourceUrl),
      auditEngineCurrent.value,
    )
  : undefined)

watch(bookSourcesSidebarWidth, width => {
  liveSidebarWidth.value = clampBookSourcesSidebarWidth(width)
})

watch(isNarrowLayout, narrow => {
  if (!narrow) sidebarDrawerOpen.value = false
})

function handleNavigateCommand(command: string) {
  if (command === 'bookshelf') router.push('/bookshelf')
  else if (command === 'search') goToSearch()
  else if (command === 'settings') router.push('/settings')
}

function handleEditorSave() {
  editPanelRef.value?.save?.()
}

function handleEditorToolCommand(command: string) {
  if (command === 'convert') editPanelRef.value?.convertToCss?.()
  else if (command === 'reset') editPanelRef.value?.reset?.()
}

function startSidebarResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  window.addEventListener('pointermove', handleSidebarResizeMove)
  window.addEventListener('pointerup', finishSidebarResize, { once: true })
}

function handleSidebarResizeMove(event: PointerEvent) {
  const rect = sourceWorkbenchRef.value?.getBoundingClientRect()
  if (!rect) return
  liveSidebarWidth.value = clampBookSourcesSidebarWidth(event.clientX - rect.left)
}

function finishSidebarResize() {
  window.removeEventListener('pointermove', handleSidebarResizeMove)
  appSettingsStore.setBookSourcesSidebarWidth(liveSidebarWidth.value)
}

function handleSidebarResizeKeydown(event: KeyboardEvent) {
  let width = liveSidebarWidth.value
  if (event.key === 'ArrowLeft') width -= 16
  else if (event.key === 'ArrowRight') width += 16
  else if (event.key === 'Home') width = MIN_BOOK_SOURCES_SIDEBAR_WIDTH
  else if (event.key === 'End') width = MAX_BOOK_SOURCES_SIDEBAR_WIDTH
  else return
  event.preventDefault()
  liveSidebarWidth.value = clampBookSourcesSidebarWidth(width)
  appSettingsStore.setBookSourcesSidebarWidth(liveSidebarWidth.value)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', handleSidebarResizeMove)
})

const hasDraftContent = () => {
  const data = editPanelRef.value?.getFormData?.()
  if (!data) return false
  return Boolean(
    data.bookSourceName?.trim() ||
    data.bookSourceUrl?.trim() ||
    data.searchUrl?.trim() ||
    data.bookSourceGroup?.trim()
  )
}

const handleCreateDraft = () => {
  if (isDrafting.value) {
    activeViewMode.value = 'edit'
    return
  }
  draftSource.value = createEmptySourceTemplate()
  isDrafting.value = true
  activeViewMode.value = 'edit'
  if (isNarrowLayout.value) sidebarDrawerOpen.value = false
}

const handleCancelDraft = async () => {
  if (hasDraftContent()) {
    try {
      await ElMessageBox.confirm('确定放弃当前新建的书源草稿吗？未保存的内容将丢失。', '放弃新建草稿', {
        confirmButtonText: '放弃草稿',
        cancelButtonText: '继续编辑',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  isDrafting.value = false
  draftSource.value = null
}

const selectSource = async (source: BookSource): Promise<boolean> => {
  if (isDrafting.value) {
    if (hasDraftContent()) {
      try {
        await ElMessageBox.confirm('当前新建书源尚未保存，切换将放弃未保存内容，是否继续？', '放弃草稿确认', {
          confirmButtonText: '放弃并切换',
          cancelButtonText: '继续编辑',
          type: 'warning',
        })
      } catch {
        return false
      }
    }
    isDrafting.value = false
    draftSource.value = null
  }
  selectedSourceUrl.value = source.bookSourceUrl
  if (isNarrowLayout.value) sidebarDrawerOpen.value = false
  return true
}

async function handleSidebarSelect(url: string) {
  const source = bookSourceStore.sources.find(item => item.bookSourceUrl === url)
  if (source) await selectSource(source)
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedUrls.value = new Set()
}

function toggleSelected(url: string) {
  const next = new Set(selectedUrls.value)
  if (next.has(url)) next.delete(url)
  else next.add(url)
  selectedUrls.value = next
}

function selectAllFilteredSources() {
  selectedUrls.value = new Set(filteredSources.value.map(source => source.bookSourceUrl))
}

function clearSelectedSources() {
  selectedUrls.value = new Set()
}

async function setSelectedSourcesEnabled(enabled: boolean) {
  const urls = [...selectedUrls.value]
  if (urls.length === 0) return
  await bookSourceStore.setSourcesEnabled(urls, enabled)
  ElMessage.success(`已${enabled ? '启用' : '禁用'} ${urls.length} 个书源`)
}

async function deleteSelectedSources() {
  const urls = [...selectedUrls.value]
  if (urls.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定删除所选的 ${urls.length} 个书源吗？此操作不可恢复。`,
      '删除所选书源',
      {
        confirmButtonText: `删除 ${urls.length} 个书源`,
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await bookSourceStore.deleteSources(urls)
    selectedUrls.value = new Set()
    selectionMode.value = false
    ElMessage.success(`已删除 ${urls.length} 个书源`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error ? error.message : '删除所选书源失败')
    }
    // 取消或删除失败时保留当前选择，便于重试。
  }
}

const handleSourceSortCommand = (command: string) => {
  if (command in sourceSortLabels) {
    sourceSort.value = command as SourceSort
  }
}

const handleSourceGroupFilter = (group: string | null) => {
  selectedSourceGroup.value = group
  const visibleSources = filteredSources.value
  if (!visibleSources.some(source => source.bookSourceUrl === selectedSourceUrl.value)) {
    selectedSourceUrl.value = visibleSources[0]?.bookSourceUrl || ''
  }
}

const isImportDisabled = computed(() => {
  if (activeImportTab.value === 'url') {
    return !importUrl.value.trim()
  }
  return !importJson.value.trim()
})

const openImportDialog = () => {
  showImportDialog.value = true
  importGroup.value = ''
  if (!importUrl.value) {
    importUrl.value = 'https://shuyuan-api.yiove.com/import/book-sources/1-20'
  }
}

const fillExampleUrl = (url: string) => {
  importUrl.value = url
}

const goToSearch = () => {
  if (bookSourceStore.getEnabledSources().length === 0) {
    ElMessage.warning('请先导入并启用至少一个书源')
    return
  }
  router.push('/search')
}

// 统一处理菜单命令
const handleCommand = async (command: string, source: BookSource) => {
  switch (command) {
    case 'toggleTop':
      await bookSourceStore.toggleTopSource(source.bookSourceUrl)
      ElMessage.success(source.isTop ? '已置顶书源' : '已取消置顶')
      break

    case 'edit': {
      const ok = await selectSource(source)
      if (ok) activeViewMode.value = 'edit'
      break
    }

    case 'search':
      router.push({
        path: '/search',
        query: {
          sourceUrl: source.bookSourceUrl,
          sourceName: source.bookSourceName,
        },
      })
      break

    case 'debug': {
      const ok = await selectSource(source)
      if (ok) activeViewMode.value = 'debug'
      break
    }

    case 'toggleCompatibility': {
      const mode = source.webReaderCompatibilityMode === 'standard' ? 'legado' : 'standard'
      await bookSourceStore.setCompatibilityMode(source.bookSourceUrl, mode)
      ElMessage.success(`已切换为 ${mode} 规则语义`)
      break
    }

    case 'auth':
      currentAuthSource.value = source
      showAuthDialog.value = true
      break

    case 'copy':
      try {
        const jsonStr = JSON.stringify(source, null, 2)
        await copyTextToClipboard(jsonStr)
        ElMessage.success('书源规则 JSON 已复制到剪贴板')
      } catch {
        ElMessage.error('复制失败，请重试')
      }
      break

    case 'exportJson':
      try {
        const path = await saveJsonFile(
          serializeLegadoBookSources([source]),
          createBookSourceJsonFileName(source),
        )
        if (path) ElMessage.success('书源 JSON 已导出')
      } catch {
        ElMessage.error('导出失败，请重试')
      }
      break

    case 'openWebsite': {
      let target = source.bookSourceUrl?.trim() || ''
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target
      }
      try {
        await openExternalUrl(target)
      } catch (err: any) {
        ElMessage.error(err?.message || '打开源网站失败')
      }
      break
    }

    case 'delete':
      handleDelete(source.bookSourceUrl)
      break
  }
}

const sidebarProps = computed(() => ({
  sources: filteredSources.value,
  totalSources: bookSourceStore.sources.length,
  searchKeyword: searchKeyword.value,
  sourceSort: sourceSort.value,
  sourceSortLabels,
  sourceGroups: sourceGroups.value,
  selectedSourceUrl: selectedSource.value?.bookSourceUrl,
  isDrafting: isDrafting.value,
  draftSource: draftSource.value,
  selectionMode: selectionMode.value,
  selectedUrls: [...selectedUrls.value],
  showAuditEntry: showSourceAuditEntry,
  latestAuditByUrl: latestAuditByUrl.value,
  auditEngineCurrent: auditEngineCurrent.value,
}))

const sidebarListeners = {
  'update:searchKeyword': (value: string) => { searchKeyword.value = value },
  create: handleCreateDraft,
  'cancel-draft': handleCancelDraft,
  'select-draft': () => {
    activeViewMode.value = 'edit'
    if (isNarrowLayout.value) sidebarDrawerOpen.value = false
  },
  audit: () => { showBatchAuditDialog.value = true },
  'toggle-selection-mode': toggleSelectionMode,
  'select-all': selectAllFilteredSources,
  'clear-selection': clearSelectedSources,
  'enable-selected': () => setSelectedSourcesEnabled(true),
  'disable-selected': () => setSelectedSourcesEnabled(false),
  'delete-selected': deleteSelectedSources,
  sort: handleSourceSortCommand,
  'group-filter': handleSourceGroupFilter,
  select: handleSidebarSelect,
  'toggle-selected': toggleSelected,
  'toggle-source': (url: string) => bookSourceStore.toggleSource(url),
  command: handleCommand,
}

const handleSaveEditedSource = async (updated: BookSource) => {
  if (isDrafting.value) {
    await bookSourceStore.addSource(updated)
    isDrafting.value = false
    draftSource.value = null
    selectedSourceUrl.value = updated.bookSourceUrl
    ElMessage.success('成功创建并保存新书源')
  } else {
    const oldUrl = selectedSourceUrl.value
    await bookSourceStore.updateSource(updated, oldUrl)
    selectedSourceUrl.value = updated.bookSourceUrl
    ElMessage.success('书源已成功更新')
  }
}

const handleImport = async () => {
  if (isImporting.value) return
  isImporting.value = true

  try {
    let preview: SourceImportPreview
    if (activeImportTab.value === 'url') {
      preview = await bookSourceStore.previewSourceImportFromUrl(importUrl.value)
    } else {
      preview = await bookSourceStore.previewSourceImport(importJson.value)
    }
    importPreviewSummary.value = { changed: preview.changed, errors: preview.errors.length }
    const reports = useSourceReplacement.value ? preview.replacedCompatibility : preview.originalCompatibility
    importCompatibilitySummary.value = {
      partial: reports.filter(report => report.status === 'partial').length,
      unsupported: reports.filter(report => report.status === 'unsupported').length,
    }

    if (useSourceReplacement.value && preview.errors.length > 0) {
      ElMessage.warning(`有 ${preview.errors.length} 条书源替换失败；可取消勾选后导入原始书源`)
      return
    }
    if (useSourceReplacement.value && preview.changed > 0) {
      await ElMessageBox.confirm(
        `${preview.changed} 条书源将使用替换后的结果，是否继续导入？`,
        '确认书源替换结果',
        { confirmButtonText: '使用替换结果', cancelButtonText: '取消', type: 'warning' },
      )
    }
    const result: SourceImportResult = await bookSourceStore.importPreparedSources(
      preview,
      useSourceReplacement.value,
      importGroup.value,
    )

    if (result.duplicates > 0) {
      ElMessage.success(
        `共读取 ${result.total} 条书源，成功生效 ${result.unique} 个（自动合并 ${result.duplicates} 个同 URL 记录）`
      )
    } else {
      ElMessage.success(
        `成功导入 ${result.unique} 个书源${result.changed ? `，其中 ${result.changed} 条使用了替换结果` : ''}`,
      )
    }
    showImportDialog.value = false
    importJson.value = ''
    importGroup.value = ''
    importPreviewSummary.value = null
    importCompatibilitySummary.value = null
  } catch (err: any) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error(err?.message || '导入失败，请检查链接或格式')
    }
  } finally {
    isImporting.value = false
  }
}

const triggerFileImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    importJson.value = text
    ElMessage.info(`已读取文件内容 (${(file.size / 1024).toFixed(1)} KB)`)
  } catch {
    ElMessage.error('读取本地文件失败')
  } finally {
    target.value = ''
  }
}

const handleDelete = async (bookSourceUrl: string) => {
  try {
    await ElMessageBox.confirm('确定要删除该书源吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await bookSourceStore.deleteSource(bookSourceUrl)
    ElMessage.success('已删除')
  } catch {
    // 用户取消
  }
}

</script>

<style scoped>
.book-sources-view {
  height: 100%;
  min-height: 100vh;
  background-color: var(--el-bg-color);
  padding: 24px 32px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-synthesis: none;
  font-variant-numeric: tabular-nums;
}

/* 原始 page-header (保持完全一致) */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.source-count-tag {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 3px 10px;
  border-radius: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 双栏工作台架构 */
.source-workbench {
  flex: 1;
  display: flex;
  min-height: 0;
  gap: 16px;
  overflow: hidden;
}

/* ================= 左侧单列列表侧栏 ================= */
.legacy-source-sidebar {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.sidebar-toolbar {
  padding: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  background: var(--el-fill-color-light);
}

.sidebar-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-search-row .search-input {
  flex: 1;
}

.create-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.draft-item {
  border-style: dashed !important;
  border-color: var(--el-color-primary) !important;
  background: var(--el-color-primary-light-9) !important;
  margin-bottom: 8px;
}

.draft-badge {
  font-size: 11px;
  color: #fff;
  background-color: var(--el-color-warning);
  padding: 1px 6px;
  flex-shrink: 0;
}

.draft-tag {
  font-size: 11px;
  color: #fff;
  background-color: var(--el-color-primary);
  padding: 1px 8px;
  flex-shrink: 0;
}

.cancel-draft-btn {
  font-size: 11px;
  padding: 0 4px;
}

.toolbar-batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.batch-left {
  display: flex;
  gap: 6px;
}

.sidebar-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.source-items-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.source-item:hover {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.source-item.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: inset 3px 0 0 var(--el-color-primary);
}

.source-item.is-top {
  border-color: var(--el-color-primary-light-3);
}

.source-item.disabled {
  opacity: 0.55;
}

.source-info {
  flex: 1;
  min-width: 0;
}

.source-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.source-top-badge {
  font-size: 13px;
  line-height: 1;
}

.source-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-item.is-active .source-name {
  color: var(--el-color-primary);
}

.source-group {
  font-size: 11px;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 1px 6px;
  flex-shrink: 0;
}

.source-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--legado-font-code);
  font-feature-settings: 'calt' 0, 'liga' 0;
  font-variant-ligatures: none;
  font-weight: 400;
  letter-spacing: 0.01em;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 10px;
}

/* 更多操作三点按钮 */
.more-btn {
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.source-item:hover .more-btn {
  opacity: 0.85;
}

.more-btn:hover {
  opacity: 1 !important;
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}

.more-icon {
  width: 16px;
  height: 16px;
}

/* ================= 右侧主工作区 ================= */
.source-main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.content-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  gap: 16px;
}

.selected-source-meta {
  flex: 1;
  min-width: 0;
}

.meta-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.selected-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-group {
  font-size: 11px;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 1px 6px;
  flex-shrink: 0;
}

.selected-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: var(--legado-font-code);
  font-feature-settings: 'calt' 0, 'liga' 0;
  font-variant-ligatures: none;
  font-weight: 400;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-mode-switcher {
  flex-shrink: 0;
}

.content-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 20px;
}

.empty-selection-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
}

/* 导入 Dialog 内部样式 */
.import-modal-content {
  margin: -10px 0;
}

.import-group-form { margin: 16px 0 4px; }
.import-group-form :deep(.el-form-item) { margin-bottom: 0; }

.tab-pane-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 6px;
}

.source-code-input :deep(.el-input__inner),
.source-code-input :deep(.el-textarea__inner),
.import-hint code {
  font-family: var(--legado-font-code);
  font-feature-settings: 'calt' 0, 'liga' 0;
  font-variant-ligatures: none;
  font-weight: 400;
  letter-spacing: 0.01em;
}

.import-hint {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin: 0;
}

.quick-examples {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.example-label {
  color: var(--el-text-color-secondary);
}

.example-tag {
  cursor: pointer;
  transition: all 0.2s ease;
}

.example-tag:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.import-file-bar {
  display: flex;
  align-items: center;
}

.hidden-input {
  display: none;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.replacement-summary {
  margin-top: 12px;
}

.book-sources-view {
  padding: 16px 24px 20px;
  background: var(--el-bg-color-page);
}

.page-header {
  min-height: 48px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-color: var(--el-border-color);
}

.header-actions { gap: 8px; }
.source-workbench { gap: 0; }

.desktop-sidebar-shell {
  height: 100%;
  flex-shrink: 0;
  min-width: 0;
}

.desktop-sidebar-shell :deep(.source-sidebar) { width: 100%; }

.sidebar-resizer {
  position: relative;
  width: 16px;
  flex-shrink: 0;
  cursor: col-resize;
  touch-action: none;
}

.sidebar-resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 7px;
  width: 2px;
  content: '';
  background: var(--el-border-color-lighter);
  transition: background-color .15s ease, width .15s ease;
}

.sidebar-resizer:hover::after,
.sidebar-resizer:focus-visible::after {
  width: 3px;
  background: var(--el-color-primary);
}

.sidebar-resizer:focus-visible { outline: 2px solid var(--el-color-primary-light-5); outline-offset: -2px; }

.source-main-content { border-color: var(--el-border-color); }
.content-header-bar { min-height: 66px; padding: 10px 16px; border-color: var(--el-border-color); }
.content-header-actions { display: flex; flex-shrink: 0; align-items: center; gap: 8px; }
.content-header-actions :deep(.el-button) { margin-left: 0; }
.content-header-actions :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  box-shadow: -1px 0 0 0 var(--el-color-primary-light-5);
}
.open-sidebar-button { flex-shrink: 0; }
.meta-title-row { flex-wrap: wrap; }
.meta-title-row :deep(.el-tag) { height: 20px; font-size: 11px; }
.draft-tag { flex-shrink: 0; padding: 1px 7px; color: #fff; background: var(--el-color-primary); font-size: 11px; }
.content-panel-body { padding: 12px 16px 16px; }

:global(.book-source-drawer-overlay .el-drawer__header) {
  margin-bottom: 0;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--el-border-color);
}

:global(.book-source-drawer-overlay .el-drawer__body) { min-height: 0; padding: 0; }
:global(.book-source-drawer-overlay .source-sidebar) { width: 100%; height: 100%; border: 0; }

@media screen and (max-width: 1179px) {
  .source-workbench { flex-direction: row; }
  .content-header-bar { gap: 10px; }
}

@media screen and (max-width: 767px) {
  .book-sources-view { padding: 10px 12px 12px; }
  .page-header { min-height: 44px; margin-bottom: 10px; padding-bottom: 10px; }
  .header-left { gap: 6px; }
  .page-title { font-size: 1.15rem; }
  .source-count-tag { display: none; }
  .header-actions :deep(.el-button) { padding-inline: 9px; }
  .content-header-bar { align-items: flex-start; flex-wrap: wrap; padding: 10px 12px; }
  .selected-source-meta { order: 1; min-width: calc(100% - 112px); }
  .open-sidebar-button { order: 0; }
  .content-header-actions { order: 2; width: 100%; justify-content: flex-end; }
  .content-panel-body { padding: 10px 10px 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-resizer::after { transition: none; }
}
</style>

<style>
/* 下拉菜单项删除红色高亮 */
.source-action-menu .delete-action-item {
  color: #f56c6c !important;
}

.source-action-menu .delete-action-item:hover {
  background-color: rgba(245, 108, 108, 0.12) !important;
  color: #f56c6c !important;
}

html.desktop-with-titlebar .book-source-drawer-overlay {
  top: 36px;
  height: auto;
}
</style>
