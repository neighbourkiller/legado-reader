<template>
  <div class="book-sources-view">
    <!-- 原始页面标题栏（保持完全不变） -->
    <div class="page-header">
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
        <el-dropdown @command="handleSourceSortCommand">
          <el-button :icon="SortIcon">
            排序：{{ sourceSortLabels[sourceSort] }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="default">默认顺序</el-dropdown-item>
              <el-dropdown-item command="name">名称</el-dropdown-item>
              <el-dropdown-item command="group">分组</el-dropdown-item>
              <el-dropdown-item command="enabled">启用优先</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button @click="router.push('/bookshelf')">
          <el-icon><Reading /></el-icon>
          返回书架
        </el-button>
        <el-button type="primary" @click="openImportDialog">
          <el-icon><Upload /></el-icon>
          导入书源
        </el-button>
        <el-button type="success" @click="goToSearch">
          <el-icon><Search /></el-icon>
          搜索书籍
        </el-button>
      </div>
    </div>

    <!-- 双栏工作台：左侧单列纵向书源列表 + 右侧工作区（编辑区/调试区切换） -->
    <div class="source-workbench" v-loading="bookSourceStore.isLoading">
      <!-- 左侧：单列纵向书源列表区 -->
      <aside class="source-sidebar sharp-container">
        <!-- 侧边栏顶部搜索与批量操作 -->
        <div class="sidebar-toolbar">
          <div class="sidebar-search-row">
            <el-input
              v-model="searchKeyword"
              placeholder="按书源名称、分组或网址筛选..."
              clearable
              class="search-input sharp-input"
              :prefix-icon="Search"
            />
            <el-button type="primary" class="sharp-btn create-btn" @click="handleCreateDraft">
              <el-icon><Plus /></el-icon>
              <span>新建</span>
            </el-button>
          </div>
          <div class="toolbar-batch-actions">
            <div class="batch-left">
              <el-button size="small" @click="handleEnableAll(true)" class="sharp-btn">全部启用</el-button>
              <el-button size="small" @click="handleEnableAll(false)" class="sharp-btn">全部禁用</el-button>
            </div>
            <el-button size="small" type="danger" plain @click="handleClearAll" class="sharp-btn">清空全部</el-button>
          </div>
        </div>

        <!-- 单列纵向列表 -->
        <div class="sidebar-list-container">
          <!-- 草稿占位卡片 -->
          <div
            v-if="isDrafting"
            class="source-item draft-item sharp-card is-active"
            @click="activeViewMode = 'edit'"
          >
            <div class="source-info">
              <div class="source-header">
                <span class="draft-badge sharp-tag">草稿</span>
                <span class="source-name">{{ draftSource?.bookSourceName || '新书源 (编辑中)' }}</span>
              </div>
              <div class="source-url">{{ draftSource?.bookSourceUrl || '待配置书源基础 URL' }}</div>
            </div>
            <div class="source-actions" @click.stop>
              <el-button
                text
                size="small"
                type="danger"
                class="cancel-draft-btn sharp-btn"
                @click="handleCancelDraft"
              >
                放弃
              </el-button>
            </div>
          </div>

          <el-empty
            v-if="!isDrafting && filteredSources.length === 0 && bookSourceStore.sources.length === 0"
            description="暂无书源，请点击上方“导入书源”或“新建”"
          />
          <el-empty
            v-else-if="!isDrafting && filteredSources.length === 0"
            description="未找到匹配的书源"
          />

          <div v-else class="source-items-column">
            <div
              v-for="source in filteredSources"
              :key="source.bookSourceUrl"
              class="source-item sharp-card"
              :class="{
                'is-active': !isDrafting && selectedSource?.bookSourceUrl === source.bookSourceUrl,
                disabled: !source.enabled,
                'is-top': source.isTop
              }"
              @click="selectSource(source)"
              @contextmenu.prevent="handleContextMenu(source.bookSourceUrl)"
            >
              <div class="source-info">
                <div class="source-header">
                  <span class="source-top-badge" v-if="source.isTop" title="已置顶">📌</span>
                  <span class="source-name" :title="source.bookSourceName">{{ source.bookSourceName }}</span>
                  <span class="source-group sharp-tag" v-if="source.bookSourceGroup">
                    {{ source.bookSourceGroup }}
                  </span>
                  <el-tag size="small" :type="compatibilityTagType(source)" effect="plain" class="sharp-tag">
                    {{ compatibilityLabel(source) }}
                  </el-tag>
                </div>
                <div class="source-url" :title="source.bookSourceUrl">{{ source.bookSourceUrl }}</div>
              </div>

              <div class="source-actions" @click.stop>
                <el-switch
                  :model-value="source.enabled"
                  @change="bookSourceStore.toggleSource(source.bookSourceUrl)"
                  size="small"
                />

                <!-- 三点更多操作 Dropdown -->
                <el-dropdown
                  :ref="(el: any) => setDropdownRef(source.bookSourceUrl, el)"
                  trigger="click"
                  placement="bottom-end"
                  @command="(cmd: any) => handleCommand(String(cmd), source)"
                >
                  <button
                    type="button"
                    class="more-btn sharp-btn"
                    title="更多操作（亦可右键整张卡片）"
                    aria-label="更多操作"
                  >
                    <svg class="more-icon" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="5" r="2.2"></circle>
                      <circle cx="12" cy="12" r="2.2"></circle>
                      <circle cx="12" cy="19" r="2.2"></circle>
                    </svg>
                  </button>

                  <template #dropdown>
                    <el-dropdown-menu class="source-action-menu sharp-dropdown">
                      <el-dropdown-item command="toggleTop">
                        <el-icon><Top /></el-icon>
                        {{ source.isTop ? '取消置顶' : '置顶书源' }}
                      </el-dropdown-item>
                      <el-dropdown-item command="edit">
                        <el-icon><Edit /></el-icon>
                        编辑书源
                      </el-dropdown-item>
                      <el-dropdown-item command="search">
                        <el-icon><Search /></el-icon>
                        从此源搜索
                      </el-dropdown-item>
                      <el-dropdown-item command="debug">
                        <el-icon><VideoPlay /></el-icon>
                        调试书源
                      </el-dropdown-item>
                      <el-dropdown-item command="toggleCompatibility">
                        语义模式：{{ source.webReaderCompatibilityMode === 'standard' ? 'standard' : 'legado' }}
                      </el-dropdown-item>
                      <el-dropdown-item command="auth">
                        <el-icon><Key /></el-icon>
                        网页登录/验证 (CF盾)
                      </el-dropdown-item>
                      <el-dropdown-item command="copy">
                        <el-icon><CopyDocument /></el-icon>
                        复制规则
                      </el-dropdown-item>
                      <el-dropdown-item command="openWebsite">
                        <el-icon><Link /></el-icon>
                        打开源网站
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided class="delete-action-item">
                        <el-icon><Delete /></el-icon>
                        删除书源
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：内容工作区（编辑区 / 调试区 切换） -->
      <main class="source-main-content sharp-container">
        <template v-if="currentActiveSource">
          <!-- 右侧内容区顶部切换条 -->
          <div class="content-header-bar">
            <div class="selected-source-meta">
              <div class="meta-title-row">
                <span class="draft-tag sharp-tag" v-if="isDrafting">新建草稿</span>
                <span class="selected-name" :title="currentActiveSource.bookSourceName">
                  {{ currentActiveSource.bookSourceName || (isDrafting ? '未命名新书源' : '未命名') }}
                </span>
                <span class="selected-group sharp-tag" v-if="currentActiveSource.bookSourceGroup">
                  {{ currentActiveSource.bookSourceGroup }}
                </span>
                <el-tag v-if="!isDrafting" size="small" :type="compatibilityTagType(currentActiveSource)" effect="plain" class="sharp-tag">
                  {{ compatibilityLabel(currentActiveSource) }}
                </el-tag>
                <el-tag size="small" type="info" effect="plain" class="sharp-tag">
                  {{ currentActiveSource.webReaderCompatibilityMode || 'legado' }}模式
                </el-tag>
              </div>
              <div class="selected-url" :title="currentActiveSource.bookSourceUrl">
                {{ currentActiveSource.bookSourceUrl || (isDrafting ? '（待填写基础 URL）' : '') }}
              </div>
            </div>

            <!-- 切换【编辑区】与【调试区】的按钮 -->
            <div class="view-mode-switcher">
              <el-radio-group v-model="activeViewMode" size="default" class="sharp-radio-group">
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

          <!-- 右侧主体：编辑区 或 调试区 面板 -->
          <div class="content-panel-body">
            <SourceEditPanel
              ref="editPanelRef"
              v-show="activeViewMode === 'edit'"
              :source="currentActiveSource"
              :is-new="isDrafting"
              @save="handleSaveEditedSource"
            />
            <SourceDebugPanel
              v-show="activeViewMode === 'debug'"
              :source="currentActiveSource"
            />
          </div>
        </template>

        <div v-else class="empty-selection-placeholder">
          <el-empty description="请在左侧列表中选择一个书源进行编辑或调试" />
        </div>
      </main>
    </div>

    <!-- 网页验证 / Cookie 注入 Dialog -->
    <SourceAuthDialog
      v-model="showAuthDialog"
      :source="currentAuthSource"
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
                class="sharp-input"
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
                class="sharp-textarea"
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Upload,
  Search,
  Link,
  Top,
  Edit,
  VideoPlay,
  CopyDocument,
  Delete,
  Key,
  Reading,
  Sort as SortIcon,
  ArrowDown,
  Plus,
} from '@element-plus/icons-vue'
import { useBookSourceStore } from '@/stores/bookSource'
import type { SourceImportPreview, SourceImportResult } from '@/stores/bookSource'
import type { BookSource } from '@/source/types/BookSource'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'
import SourceEditPanel from '@/components/SourceEditPanel.vue'
import SourceDebugPanel from '@/components/SourceDebugPanel.vue'
import SourceAuthDialog from '@/components/SourceAuthDialog.vue'
import { copyTextToClipboard } from '@/platform/clipboard'
import { openExternalUrl } from '@/platform/externalBrowser'

const router = useRouter()
const bookSourceStore = useBookSourceStore()

const showImportDialog = ref(false)
const activeImportTab = ref<'url' | 'text'>('url')
const importUrl = ref('')
const importJson = ref('')
const isImporting = ref(false)
const useSourceReplacement = ref(true)
const importPreviewSummary = ref<{ changed: number; errors: number } | null>(null)
const importCompatibilitySummary = ref<{ partial: number; unsupported: number } | null>(null)
const searchKeyword = ref('')

type SourceSort = 'default' | 'name' | 'group' | 'enabled'
const sourceSort = ref<SourceSort>('default')
const sourceSortLabels: Record<SourceSort, string> = {
  default: '默认顺序',
  name: '名称',
  group: '分组',
  enabled: '启用优先',
}
const fileInputRef = ref<HTMLInputElement | null>(null)

// 选中书源与右侧展示模式
const selectedSourceUrl = ref<string>('')
const activeViewMode = ref<'edit' | 'debug'>('edit')

const editPanelRef = ref<any>(null)
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

// 下拉菜单 Refs 管理
const dropdownRefs = new Map<string, any>()
const setDropdownRef = (url: string, el: any) => {
  if (el) {
    dropdownRefs.set(url, el)
  } else {
    dropdownRefs.delete(url)
  }
}

const handleContextMenu = (url: string) => {
  const dropdown = dropdownRefs.get(url)
  dropdown?.handleOpen()
}

onMounted(() => {
  bookSourceStore.loadSources()
})

const enabledCount = computed(() => bookSourceStore.getEnabledSources().length)
const compatibilityReport = (source: BookSource) => inspectSourceCompatibility(source)
const compatibilityLabel = (source: BookSource) => {
  const report = compatibilityReport(source)
  return report.status === 'supported' ? '兼容' : `${report.status === 'partial' ? '部分兼容' : '不支持'} ${report.issues.length}`
}
const compatibilityTagType = (source: BookSource) => {
  const status = compatibilityReport(source).status
  return status === 'supported' ? 'success' : status === 'partial' ? 'warning' : 'danger'
}

const filteredSources = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  const sources = kw ? bookSourceStore.sources.filter(s => {
    const name = s.bookSourceName?.toLowerCase() || ''
    const url = s.bookSourceUrl?.toLowerCase() || ''
    const group = s.bookSourceGroup?.toLowerCase() || ''
    return name.includes(kw) || url.includes(kw) || group.includes(kw)
  }) : bookSourceStore.sources

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
  return true
}

const handleSourceSortCommand = (command: string) => {
  if (command in sourceSortLabels) {
    sourceSort.value = command as SourceSort
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

const handleEnableAll = async (enabled: boolean) => {
  await bookSourceStore.setAllSourcesEnabled(enabled)
  ElMessage.success(enabled ? '已全部启用' : '已全部禁用')
}

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有书源吗？此操作不可恢复。', '清空警告', {
      confirmButtonText: '清空全部',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await bookSourceStore.deleteAllSources()
    ElMessage.success('已清空全部书源')
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
.source-sidebar {
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
  font-weight: 700;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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
}

/* 导入 Dialog 内部样式 */
.import-modal-content {
  margin: -10px 0;
}

.tab-pane-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 6px;
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

@media screen and (max-width: 900px) {
  .source-workbench {
    flex-direction: column;
  }
  .source-sidebar {
    width: 100%;
    height: 280px;
  }
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
</style>
