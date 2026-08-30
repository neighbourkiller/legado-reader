<template>
  <aside class="source-sidebar" :class="{ 'is-selection-mode': selectionMode }">
    <div class="sidebar-toolbar">
      <div class="sidebar-search-row">
        <div
          class="source-group-autocomplete-toggle"
          @mousedown.capture="handleGroupAutocompleteMouseDown"
        >
          <el-autocomplete
            ref="sourceGroupAutocompleteRef"
            :model-value="searchKeyword"
            :fetch-suggestions="querySourceGroups"
            :trigger-on-focus="true"
            placeholder="按名称、分组或网址筛选"
            aria-label="按名称、分组或网址筛选"
            clearable
            :prefix-icon="Search"
            @update:model-value="handleSearchInput"
            @select="handleGroupSelect"
          >
            <template #suffix><el-icon><ArrowDown /></el-icon></template>
          </el-autocomplete>
        </div>
        <el-button class="create-button" @click="emit('create')">
          <el-icon><Plus /></el-icon>
          新建
        </el-button>
      </div>

      <div v-if="!selectionMode" class="sidebar-tools-row">
        <el-dropdown @command="handleSortCommand">
          <el-button text>
            <el-icon><Sort /></el-icon>
            {{ sourceSortLabels[sourceSort] }}
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
        <div class="sidebar-tool-actions">
          <el-button v-if="showAuditEntry" text @click="emit('audit')">
            <el-icon><DataAnalysis /></el-icon>
            批量测试
          </el-button>
          <el-button text @click="emit('toggle-selection-mode')">
            <el-icon><Select /></el-icon>
            选择
          </el-button>
        </div>
      </div>

      <div v-else class="selection-toolbar">
        <div class="selection-summary">
          <strong>已选 {{ selectedUrls.length }} 项</strong>
          <el-button text size="small" @click="emit('select-all')">全选当前结果</el-button>
          <el-button text size="small" :disabled="selectedUrls.length === 0" @click="emit('clear-selection')">
            清除
          </el-button>
        </div>
        <div class="selection-actions">
          <el-button size="small" :disabled="selectedUrls.length === 0" @click="emit('enable-selected')">
            启用
          </el-button>
          <el-button size="small" :disabled="selectedUrls.length === 0" @click="emit('disable-selected')">
            禁用
          </el-button>
          <el-button size="small" type="danger" plain :disabled="selectedUrls.length === 0" @click="emit('delete-selected')">
            删除
          </el-button>
          <el-button size="small" text @click="emit('toggle-selection-mode')">完成</el-button>
        </div>
      </div>
    </div>

    <div class="sidebar-list-container">
      <div
        v-if="isDrafting"
        class="source-item draft-item is-active"
        @click="emit('select-draft')"
      >
        <div class="source-info">
          <div class="source-name-row">
            <span class="draft-badge">草稿</span>
            <span class="source-name">{{ draftSource?.bookSourceName || '新书源（编辑中）' }}</span>
          </div>
          <div class="source-url" :class="{ 'is-placeholder': !draftSource?.bookSourceUrl }">
            {{ draftSource?.bookSourceUrl || '待配置书源基础 URL' }}
          </div>
        </div>
        <el-button text size="small" type="danger" @click.stop="emit('cancel-draft')">放弃</el-button>
      </div>

      <el-empty
        v-if="!isDrafting && sources.length === 0 && totalSources === 0"
        description="暂无书源，请导入或新建书源"
      />
      <el-empty
        v-else-if="!isDrafting && sources.length === 0"
        description="未找到匹配的书源"
      />

      <div v-else class="source-items-column">
        <div
          v-for="source in sources"
          :key="source.bookSourceUrl"
          class="source-item"
          :class="{
            'is-active': !isDrafting && selectedSourceUrl === source.bookSourceUrl,
            'is-selected': selectedUrls.includes(source.bookSourceUrl),
            disabled: !source.enabled,
            'is-top': source.isTop,
          }"
          @click="handleItemClick(source)"
          @contextmenu.prevent="handleContextMenu(source.bookSourceUrl)"
        >
          <el-checkbox
            v-if="selectionMode"
            class="selection-checkbox"
            :model-value="selectedUrls.includes(source.bookSourceUrl)"
            :aria-label="`选择 ${source.bookSourceName}`"
            @click.stop
            @change="emit('toggle-selected', source.bookSourceUrl)"
          />

          <div class="source-info">
            <div class="source-name-row">
              <span v-if="source.isTop" class="source-top-badge" title="已置顶">📌</span>
              <span class="source-name" :title="source.bookSourceName">{{ source.bookSourceName }}</span>
            </div>
            <div class="source-url" :title="source.bookSourceUrl">{{ source.bookSourceUrl }}</div>
            <div class="source-meta-row">
              <span v-if="source.bookSourceGroup" class="source-group">{{ source.bookSourceGroup }}</span>
              <el-tag size="small" :type="ruleStatus(source).tone" effect="plain">
                {{ ruleStatus(source).label }}
              </el-tag>
              <el-tag
                v-if="auditStatus(source)"
                size="small"
                :type="auditStatus(source)?.tone"
                effect="plain"
              >
                {{ auditStatus(source)?.label }}
              </el-tag>
            </div>
          </div>

          <div v-if="!selectionMode" class="source-actions" @click.stop>
            <el-switch
              :model-value="source.enabled"
              size="small"
              :aria-label="`${source.enabled ? '禁用' : '启用'} ${source.bookSourceName}`"
              @change="emit('toggle-source', source.bookSourceUrl)"
            />
            <el-dropdown
              :ref="(element: any) => setDropdownRef(source.bookSourceUrl, element)"
              trigger="click"
              placement="bottom-end"
              @command="handleSourceCommand($event, source)"
            >
              <button type="button" class="more-btn" aria-label="更多操作" title="更多操作（亦可右键整张卡片）">
                <span aria-hidden="true">⋮</span>
              </button>
              <template #dropdown>
                <el-dropdown-menu class="source-action-menu">
                  <el-dropdown-item command="toggleTop"><el-icon><Top /></el-icon>{{ source.isTop ? '取消置顶' : '置顶书源' }}</el-dropdown-item>
                  <el-dropdown-item command="edit"><el-icon><Edit /></el-icon>编辑书源</el-dropdown-item>
                  <el-dropdown-item command="search"><el-icon><Search /></el-icon>从此源搜索</el-dropdown-item>
                  <el-dropdown-item command="debug"><el-icon><VideoPlay /></el-icon>调试书源</el-dropdown-item>
                  <el-dropdown-item command="toggleCompatibility">语义模式：{{ source.webReaderCompatibilityMode === 'standard' ? 'standard' : 'legado' }}</el-dropdown-item>
                  <el-dropdown-item command="auth"><el-icon><Key /></el-icon>网页登录/验证</el-dropdown-item>
                  <el-dropdown-item command="copy"><el-icon><CopyDocument /></el-icon>复制规则</el-dropdown-item>
                  <el-dropdown-item command="exportJson"><el-icon><Download /></el-icon>导出JSON</el-dropdown-item>
                  <el-dropdown-item command="openWebsite"><el-icon><Link /></el-icon>打开源网站</el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="delete-action-item"><el-icon><Delete /></el-icon>删除书源</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  ArrowDown,
  CopyDocument,
  DataAnalysis,
  Delete,
  Download,
  Edit,
  Key,
  Link,
  Plus,
  Search,
  Select,
  Sort,
  Top,
  VideoPlay,
} from '@element-plus/icons-vue'
import type { BookSource } from '@/source/types/BookSource'
import type { SourceAuditEntry } from '@/source/audit/SourceAuditTypes'
import {
  getAuditStatus,
  getRuleCompatibilityStatus,
} from '@/source/audit/SourceStatusPresentation'

type SourceSort = 'default' | 'name' | 'group' | 'enabled'

const props = defineProps<{
  sources: BookSource[]
  totalSources: number
  searchKeyword: string
  sourceSort: SourceSort
  sourceSortLabels: Record<SourceSort, string>
  sourceGroups: string[]
  selectedSourceUrl?: string
  isDrafting: boolean
  draftSource: BookSource | null
  selectionMode: boolean
  selectedUrls: string[]
  showAuditEntry: boolean
  latestAuditByUrl: Map<string, SourceAuditEntry>
  auditEngineCurrent: boolean
}>()

const emit = defineEmits<{
  (event: 'update:searchKeyword', value: string): void
  (event: 'create' | 'cancel-draft' | 'select-draft' | 'audit' | 'toggle-selection-mode' | 'select-all' | 'clear-selection' | 'enable-selected' | 'disable-selected' | 'delete-selected'): void
  (event: 'sort', command: string): void
  (event: 'group-filter', group: string | null): void
  (event: 'select' | 'toggle-selected' | 'toggle-source', value: string): void
  (event: 'command', command: string, source: BookSource): void
}>()

const dropdownRefs = new Map<string, { handleOpen?: () => void }>()
type AutocompleteToggleInstance = {
  activated: boolean
  close: () => void
  handleKeyEnter: () => Promise<void>
}
const sourceGroupAutocompleteRef = ref<AutocompleteToggleInstance | null>(null)
const ruleStatuses = computed(() => new Map(
  props.sources.map(source => [source.bookSourceUrl, getRuleCompatibilityStatus(source)]),
))

function setDropdownRef(url: string, element: any) {
  if (element) dropdownRefs.set(url, element)
  else dropdownRefs.delete(url)
}

function handleSearchInput(value: string) {
  emit('update:searchKeyword', String(value))
  emit('group-filter', null)
}

function querySourceGroups(query: string, callback: (items: Array<{ value: string }>) => void) {
  const keyword = query.trim().toLocaleLowerCase()
  callback(props.sourceGroups
    .filter(group => !keyword || group.toLocaleLowerCase().includes(keyword))
    .map(group => ({ value: group })))
}

function handleGroupSelect(item: { value: string }) {
  emit('update:searchKeyword', item.value)
  emit('group-filter', item.value)
}

function handleGroupAutocompleteMouseDown(event: MouseEvent) {
  if (!(event.target instanceof HTMLInputElement)) return
  const autocomplete = sourceGroupAutocompleteRef.value
  if (!autocomplete) return

  if (autocomplete.activated) {
    event.preventDefault()
    event.stopImmediatePropagation()
    autocomplete.close()
  } else if (document.activeElement === event.target) {
    event.preventDefault()
    void autocomplete.handleKeyEnter()
  }
}

function handleSortCommand(command: string | number | object) {
  emit('sort', String(command))
}

function handleSourceCommand(command: string | number | object, source: BookSource) {
  emit('command', String(command), source)
}

function handleContextMenu(url: string) {
  if (props.selectionMode) return
  dropdownRefs.get(url)?.handleOpen?.()
}

function handleItemClick(source: BookSource) {
  if (props.selectionMode) emit('toggle-selected', source.bookSourceUrl)
  else emit('select', source.bookSourceUrl)
}

function auditStatus(source: BookSource) {
  return getAuditStatus(props.latestAuditByUrl.get(source.bookSourceUrl), props.auditEngineCurrent)
}

function ruleStatus(source: BookSource) {
  return ruleStatuses.value.get(source.bookSourceUrl) ?? getRuleCompatibilityStatus(source)
}
</script>

<style scoped>
.source-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  font-variant-numeric: tabular-nums;
}

.sidebar-toolbar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
}

.sidebar-search-row,
.sidebar-tools-row,
.selection-summary,
.selection-actions,
.source-name-row,
.source-meta-row,
.source-actions {
  display: flex;
  align-items: center;
}

.sidebar-search-row { gap: 8px; }
.source-group-autocomplete-toggle { min-width: 0; flex: 1; }
.source-group-autocomplete-toggle :deep(.el-autocomplete),
.source-group-autocomplete-toggle :deep(.el-autocomplete .el-input) { width: 100%; }
.create-button { flex-shrink: 0; }
.sidebar-tools-row { min-height: 28px; justify-content: space-between; }
.sidebar-tool-actions { display: flex; align-items: center; }
.sidebar-tools-row :deep(.el-button), .sidebar-tool-actions :deep(.el-button) { margin-left: 0; padding-inline: 6px; }

.selection-toolbar { display: flex; flex-direction: column; gap: 8px; }
.selection-summary { min-height: 28px; gap: 4px; }
.selection-summary strong { margin-right: auto; font-size: 13px; }
.selection-actions { gap: 6px; }
.selection-actions :deep(.el-button) { flex: 1; margin-left: 0; }

.sidebar-list-container { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
.source-items-column { display: flex; flex-direction: column; gap: 7px; }

.source-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 82px;
  padding: 10px 12px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  transition: border-color .15s ease, background-color .15s ease;
}
.source-item:hover { border-color: var(--el-color-primary-light-5); background: var(--el-fill-color-light); }
.source-item.is-active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); box-shadow: inset 3px 0 0 var(--el-color-primary); }
.source-item.is-selected { border-color: var(--el-color-primary-light-3); background: var(--el-color-primary-light-9); }
.source-item.disabled { opacity: .58; }
.source-item.is-selected, .source-item.is-active { opacity: 1; }
.draft-item { margin-bottom: 8px; border-style: dashed; border-color: var(--el-color-primary); }

.selection-checkbox { flex-shrink: 0; }
.source-info { min-width: 0; flex: 1; }
.source-name-row { min-width: 0; gap: 5px; }
.source-name { min-width: 0; overflow: hidden; color: var(--el-text-color-primary); font-size: 13.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.source-item.is-active .source-name { color: var(--el-color-primary); }
.source-top-badge { flex-shrink: 0; font-size: 12px; }
.draft-badge { flex-shrink: 0; padding: 1px 6px; color: #fff; background: var(--el-color-primary); font-size: 11px; }
.source-url { margin-top: 3px; overflow: hidden; color: var(--el-text-color-placeholder); font-family: var(--legado-font-code); font-feature-settings: 'calt' 0, 'liga' 0; font-variant-ligatures: none; font-size: 11.5px; font-weight: 400; letter-spacing: 0.01em; text-overflow: ellipsis; white-space: nowrap; }
.source-url.is-placeholder { font-family: var(--legado-font-ui); letter-spacing: normal; }
.source-meta-row { min-height: 20px; margin-top: 6px; gap: 5px; overflow: hidden; }
.source-meta-row :deep(.el-tag) { height: 19px; padding: 0 5px; font-size: 10.5px; }
.source-group { max-width: 92px; overflow: hidden; color: var(--el-text-color-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.source-group::after { content: '·'; margin-left: 5px; color: var(--el-border-color-darker); }
.source-actions { flex-shrink: 0; gap: 6px; }
.more-btn { width: 26px; height: 28px; padding: 0; border: 0; color: var(--el-text-color-secondary); background: transparent; font-size: 22px; line-height: 24px; cursor: pointer; }
.more-btn:hover, .more-btn:focus-visible { color: var(--el-color-primary); background: var(--el-fill-color); outline: 2px solid var(--el-color-primary-light-5); outline-offset: 1px; }

@media (prefers-reduced-motion: reduce) {
  .source-item { transition: none; }
}
</style>

<style>
.source-action-menu .delete-action-item { color: var(--el-color-danger) !important; }
.source-action-menu .delete-action-item:hover { color: var(--el-color-danger) !important; background: var(--el-color-danger-light-9) !important; }
</style>
