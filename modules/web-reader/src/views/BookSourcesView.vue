<template>
  <div class="book-sources-view">
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

    <!-- 快捷工具栏（搜索与批量操作） -->
    <div class="toolbar-section" v-if="bookSourceStore.sources.length > 0">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="按书源名称、分组或网址筛选..."
          clearable
          class="search-input"
          :prefix-icon="Search"
        />
      </div>
      <div class="toolbar-right">
        <el-button size="small" @click="handleEnableAll(true)">全部启用</el-button>
        <el-button size="small" @click="handleEnableAll(false)">全部禁用</el-button>
        <el-button size="small" type="danger" plain @click="handleClearAll">清空全部</el-button>
      </div>
    </div>

    <div class="source-list" v-loading="bookSourceStore.isLoading">
      <el-empty
        v-if="filteredSources.length === 0 && bookSourceStore.sources.length === 0"
        description="暂无书源，请点击上方“导入书源”"
      />
      <el-empty
        v-else-if="filteredSources.length === 0"
        description="未找到匹配的书源"
      />

      <div v-else class="source-grid">
        <div
          v-for="source in filteredSources"
          :key="source.bookSourceUrl"
          class="source-card"
          :class="{ disabled: !source.enabled, 'is-top': source.isTop }"
          @contextmenu.prevent="handleContextMenu(source.bookSourceUrl)"
        >
          <div class="source-info">
            <div class="source-header">
              <span class="source-top-badge" v-if="source.isTop" title="已置顶">📌</span>
              <span class="source-name" :title="source.bookSourceName">{{ source.bookSourceName }}</span>
              <span class="source-group" v-if="source.bookSourceGroup">
                {{ source.bookSourceGroup }}
              </span>
            </div>
            <div class="source-url" :title="source.bookSourceUrl">{{ source.bookSourceUrl }}</div>
          </div>
          <div class="source-actions">
            <el-switch
              :model-value="source.enabled"
              @change="bookSourceStore.toggleSource(source.bookSourceUrl)"
              size="small"
              @click.stop
            />

            <!-- 三点更多操作 Dropdown -->
            <el-dropdown
              :ref="(el: any) => setDropdownRef(source.bookSourceUrl, el)"
              trigger="click"
              placement="bottom-end"
              @command="(cmd: any) => handleCommand(String(cmd), source)"
              @click.stop
            >
              <button
                type="button"
                class="more-btn"
                title="更多操作（亦可右键整张卡片）"
                aria-label="更多操作"
                @click.stop
              >
                <svg class="more-icon" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2.2"></circle>
                  <circle cx="12" cy="12" r="2.2"></circle>
                  <circle cx="12" cy="19" r="2.2"></circle>
                </svg>
              </button>

              <template #dropdown>
                <el-dropdown-menu class="source-action-menu">
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

    <!-- 编辑书源 Dialog -->
    <SourceEditDialog
      v-model:visible="showEditDialog"
      :source="currentEditingSource"
      @save="handleSaveEditedSource"
    />

    <!-- 调试书源 Dialog -->
    <SourceDebugDialog
      v-model:visible="showDebugDialog"
      :source="currentDebuggingSource"
    />

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
              />
              <div class="quick-examples">
                <span class="example-label">推荐示例：</span>
                <el-tag
                  size="small"
                  class="example-tag"
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
              />
              <div class="import-file-bar">
                <el-button @click="triggerFileImport">从本地 JSON 文件导入</el-button>
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
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showImportDialog = false" :disabled="isImporting">取消</el-button>
          <el-button
            type="primary"
            :loading="isImporting"
            :disabled="isImportDisabled"
            @click="handleImport"
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
} from '@element-plus/icons-vue'
import { useBookSourceStore } from '@/stores/bookSource'
import type { BookSource } from '@/source/types/BookSource'
import SourceEditDialog from '@/components/SourceEditDialog.vue'
import SourceDebugDialog from '@/components/SourceDebugDialog.vue'
import SourceAuthDialog from '@/components/SourceAuthDialog.vue'

const router = useRouter()
const bookSourceStore = useBookSourceStore()

const showImportDialog = ref(false)
const activeImportTab = ref<'url' | 'text'>('url')
const importUrl = ref('')
const importJson = ref('')
const isImporting = ref(false)
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

// 编辑与调试弹窗状态
const showEditDialog = ref(false)
const currentEditingSource = ref<BookSource | null>(null)
const showDebugDialog = ref(false)
const currentDebuggingSource = ref<BookSource | null>(null)
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

    case 'edit':
      currentEditingSource.value = source
      showEditDialog.value = true
      break

    case 'search':
      router.push({
        path: '/search',
        query: {
          sourceUrl: source.bookSourceUrl,
          sourceName: source.bookSourceName,
        },
      })
      break

    case 'debug':
      currentDebuggingSource.value = source
      showDebugDialog.value = true
      break

    case 'auth':
      currentAuthSource.value = source
      showAuthDialog.value = true
      break

    case 'copy':
      try {
        const jsonStr = JSON.stringify(source, null, 2)
        await navigator.clipboard.writeText(jsonStr)
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
      window.open(target, '_blank')
      break
    }

    case 'delete':
      handleDelete(source.bookSourceUrl)
      break
  }
}

const handleSaveEditedSource = async (updated: BookSource) => {
  await bookSourceStore.updateSource(updated)
  ElMessage.success('书源已成功更新')
}

const handleImport = async () => {
  if (isImporting.value) return
  isImporting.value = true

  try {
    let result: { total: number; unique: number; duplicates: number }
    if (activeImportTab.value === 'url') {
      result = await bookSourceStore.importSourcesFromUrl(importUrl.value)
    } else {
      result = await bookSourceStore.importSources(importJson.value)
    }

    if (result.duplicates > 0) {
      ElMessage.success(
        `共读取 ${result.total} 条书源，成功生效 ${result.unique} 个（自动合并 ${result.duplicates} 个同 URL 记录）`
      )
    } else {
      ElMessage.success(`成功导入 ${result.unique} 个书源`)
    }
    showImportDialog.value = false
    importJson.value = ''
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败，请检查链接或格式')
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
  min-height: 100vh;
  background-color: var(--el-bg-color);
  padding: 40px 48px 60px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
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
  border-radius: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  gap: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  flex: 1;
  max-width: 380px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.source-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.source-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}

.source-card.is-top {
  border-color: var(--el-color-primary-light-3);
  background-color: var(--el-color-primary-light-9);
}

.source-card.disabled {
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
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-group {
  font-size: 11px;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.source-url {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  margin-left: 12px;
}

/* 更多操作三点按钮 */
.more-btn {
  opacity: 0.45;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.source-card:hover .more-btn {
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

@media screen and (max-width: 768px) {
  .book-sources-view {
    padding: 16px 20px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .toolbar-section {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left {
    max-width: 100%;
  }

  .source-grid {
    grid-template-columns: 1fr;
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
