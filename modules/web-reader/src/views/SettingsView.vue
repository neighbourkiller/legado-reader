<template>
  <div class="settings-view" :class="{ 'mobile-layout': isMobileWeb }">
    <header class="settings-header">
      <el-button text @click="closeSettings">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h1>设置</h1>
    </header>

    <main class="settings-window">
      <aside v-if="!isMobileWeb || !mobilePanelOpen" class="settings-sidebar">
        <el-input
          v-model="searchKeyword"
          class="settings-search"
          placeholder="搜索设置"
          clearable
          :prefix-icon="Search"
        />

        <nav class="settings-navigation" aria-label="设置分类">
          <section v-for="group in filteredGroups" :key="group.title" class="navigation-group">
            <h2>{{ group.title }}</h2>
            <button
              v-for="item in group.items"
              :key="item.key"
              type="button"
              class="navigation-item"
              :class="{ active: !isMobileWeb && selectedKey === item.key }"
              @click="selectItem(item)"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
              <el-icon v-if="isMobileWeb" class="navigation-chevron"><ArrowRight /></el-icon>
            </button>
          </section>

          <el-empty
            v-if="filteredGroups.length === 0"
            description="没有匹配的设置"
            :image-size="56"
          />
        </nav>
      </aside>

      <section v-if="!isMobileWeb || mobilePanelOpen" class="settings-panel">
        <button
          v-if="isMobileWeb"
          type="button"
          class="mobile-panel-back"
          @click="backToSettingsList"
        >
          <el-icon><ArrowLeft /></el-icon>
          设置列表
        </button>
        <div class="panel-breadcrumb">{{ selectedGroupTitle }} &gt; {{ selectedItem.title }}</div>
        <div class="panel-heading">
          <div class="heading-icon"><el-icon><component :is="selectedItem.icon" /></el-icon></div>
          <div>
            <h2>{{ selectedItem.title }}</h2>
            <p>{{ selectedItem.description }}</p>
          </div>
        </div>

        <el-alert
          v-if="appSettingsStore.saveError"
          type="error"
          :title="`设置保存失败：${appSettingsStore.saveError}`"
          show-icon
          closable
          style="margin-bottom: 16px"
          @close="appSettingsStore.saveError = null"
        />

        <div v-if="selectedKey === 'preferences'" class="preference-list">
          <div class="preference-row">
            <div class="preference-copy">
              <strong>书架点击书籍</strong>
              <small>选择从书架点击书籍后打开的页面</small>
            </div>
            <el-radio-group
              :model-value="appSettingsStore.bookshelfClickAction"
              @update:model-value="handleActionChange"
            >
              <el-radio-button value="detail">详情页</el-radio-button>
              <el-radio-button value="reader">正文页</el-radio-button>
            </el-radio-group>
          </div>
          <div class="preference-row">
            <div class="preference-copy">
              <strong>浏览器搜索引擎</strong>
              <small>阅读页选中文本后使用系统默认浏览器搜索</small>
            </div>
            <el-radio-group
              :model-value="appSettingsStore.searchEngine"
              @update:model-value="handleSearchEngineChange"
            >
              <el-radio-button value="bing">Bing</el-radio-button>
              <el-radio-button value="baidu">百度</el-radio-button>
              <el-radio-button value="google">Google</el-radio-button>
            </el-radio-group>
          </div>
          <div class="preference-row">
            <div class="preference-copy">
              <strong>全局主题与阅读页</strong>
              <small>切换全局明暗主题时，选择是否同步修改阅读页</small>
            </div>
            <el-radio-group
              :model-value="appSettingsStore.readerThemeSyncPreference"
              @update:model-value="handleThemeSyncPreferenceChange"
            >
              <el-radio-button value="none">每次询问</el-radio-button>
              <el-radio-button value="sync">始终同步</el-radio-button>
              <el-radio-button value="independent">不同步</el-radio-button>
            </el-radio-group>
          </div>
          <div class="preference-row">
            <div class="preference-copy">
              <strong>滚动阅读</strong>
              <small>翻页动画选择“滚动”时，是否自动加载下一章</small>
            </div>
            <el-radio-group
              :model-value="appSettingsStore.readerScrollInfiniteLoading"
              @update:model-value="handleReaderInfiniteLoadingChange"
            >
              <el-radio-button :value="true">无限加载</el-radio-button>
              <el-radio-button :value="false">仅当前章</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <ThemeSettingsPanel v-else-if="selectedKey === 'theme'" />
        <BookmarksPanel v-else-if="selectedKey === 'bookmarks'" />
        <ReadingHistoryPanel v-else-if="selectedKey === 'history'" />
        <FileManagerPanel v-else-if="selectedKey === 'files'" />
        <BackupPanel v-else-if="selectedKey === 'backup'" />
        <ReplaceRulesPanel v-else-if="selectedKey === 'replaceRules'" />
        <AboutPanel v-else-if="selectedKey === 'about'" />
        <el-empty v-else description="该功能暂未实现" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Collection,
  Operation,
  UploadFilled,
  Brush,
  Tools,
  MagicStick,
  CollectionTag,
  Clock,
  Folder,
  InfoFilled,
} from '@element-plus/icons-vue'
import { useAppSettingsStore } from '@/stores/appSettings'
import type {
  BookshelfClickAction,
  ReaderThemeSyncPreference,
  SearchEngine,
} from '@/stores/appSettings'
import ThemeSettingsPanel from '@/components/settings/ThemeSettingsPanel.vue'
import BookmarksPanel from '@/components/settings/BookmarksPanel.vue'
import ReadingHistoryPanel from '@/components/settings/ReadingHistoryPanel.vue'
import FileManagerPanel from '@/components/settings/FileManagerPanel.vue'
import BackupPanel from '@/components/settings/BackupPanel.vue'
import AboutPanel from '@/components/settings/AboutPanel.vue'
import ReplaceRulesPanel from '@/components/settings/ReplaceRulesPanel.vue'
import { useMobileWebLayout } from '@/composables/useMobileWebLayout'

type SettingKey =
  | 'preferences'
  | 'backup'
  | 'theme'
  | 'other'
  | 'replaceRules'
  | 'bookmarks'
  | 'history'
  | 'files'
  | 'about'

interface SettingItem {
  key: SettingKey | 'bookSources'
  title: string
  description: string
  icon: Component
  path?: string
}

interface SettingGroup {
  title: string
  items: SettingItem[]
}

const router = useRouter()
const route = useRoute()
const appSettingsStore = useAppSettingsStore()
const { isMobileWeb } = useMobileWebLayout()
const searchKeyword = shallowRef('')
const isDesktopBuild = import.meta.env.VITE_APP_TARGET === 'desktop'

const groups: SettingGroup[] = [
  {
    title: '常用',
    items: [
      ...(isDesktopBuild
        ? [{ key: 'bookSources' as const, title: '书源管理', description: '导入、编辑或管理书源', icon: Collection, path: '/book-sources' }]
        : []),
      { key: 'preferences', title: '偏好', description: '设置书架与应用交互偏好', icon: Operation },
    ],
  },
  {
    title: '设置',
    items: [
      { key: 'backup', title: '备份与恢复', description: '备份或恢复客户端数据', icon: UploadFilled },
      { key: 'theme', title: '主题设置', description: '调整界面主题、颜色与字体', icon: Brush },
      { key: 'replaceRules', title: '替换管理', description: '管理标题、正文与书源替换规则', icon: MagicStick },
      ...(isDesktopBuild
        ? [{ key: 'other' as const, title: '其他设置', description: '与客户端功能相关的设置', icon: Tools }]
        : []),
    ],
  },
  {
    title: '其他',
    items: [
      { key: 'bookmarks', title: '书签', description: '查看所有书签', icon: CollectionTag },
      { key: 'history', title: '阅读记录', description: '查看阅读时间记录', icon: Clock },
      { key: 'files', title: '文件管理', description: '管理本地书籍文件', icon: Folder },
      { key: 'about', title: '关于', description: '查看客户端信息', icon: InfoFilled },
    ],
  },
]

const selectableItems = groups.flatMap(group => group.items).filter(item => !item.path)
const resolveSettingKey = (value: unknown): SettingKey | null => {
  if (typeof value !== 'string') return null
  return selectableItems.some(item => item.key === value) ? value as SettingKey : null
}

const initialSettingKey = resolveSettingKey(route.query.section)
const selectedKey = shallowRef<SettingKey>(initialSettingKey ?? 'preferences')
const mobilePanelOpen = shallowRef(Boolean(initialSettingKey))

const selectedItem = computed(() => {
  return selectableItems.find(item => item.key === selectedKey.value) ?? selectableItems[0]
})

const selectedGroupTitle = computed(() => {
  return groups.find(group => group.items.some(item => item.key === selectedKey.value))?.title ?? ''
})

const filteredGroups = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return groups

  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        `${item.title}${item.description}`.toLowerCase().includes(keyword),
      ),
    }))
    .filter(group => group.items.length > 0)
})

const resetMobileScroll = async () => {
  if (!isMobileWeb.value) return
  await nextTick()
  document.querySelector<HTMLElement>('.app-content')?.scrollTo({ top: 0 })
}

watch(() => route.query.section, section => {
  const settingKey = resolveSettingKey(section)
  if (settingKey) {
    selectedKey.value = settingKey
    if (isMobileWeb.value) mobilePanelOpen.value = true
  } else if (isMobileWeb.value) {
    mobilePanelOpen.value = false
  }
  void resetMobileScroll()
})

const closeSettings = () => {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.replace('/bookshelf')
  }
}

const selectItem = (item: SettingItem) => {
  if (item.path) {
    router.push(item.path)
    return
  }
  selectedKey.value = item.key as SettingKey
  if (isMobileWeb.value) {
    mobilePanelOpen.value = true
    void router.push({ path: '/settings', query: { section: item.key } })
  }
}

const backToSettingsList = () => {
  mobilePanelOpen.value = false
  void router.replace('/settings')
}

const handleActionChange = (value: string | number | boolean | undefined) => {
  if (value === 'detail' || value === 'reader') {
    appSettingsStore.setBookshelfClickAction(value as BookshelfClickAction)
  }
}

const handleThemeSyncPreferenceChange = (value: string | number | boolean | undefined) => {
  if (value === 'none' || value === 'sync' || value === 'independent') {
    appSettingsStore.setReaderThemeSyncPreference(value as ReaderThemeSyncPreference)
  }
}

const handleSearchEngineChange = (value: string | number | boolean | undefined) => {
  if (value === 'bing' || value === 'baidu' || value === 'google') {
    appSettingsStore.setSearchEngine(value as SearchEngine)
  }
}

const handleReaderInfiniteLoadingChange = (value: string | number | boolean | undefined) => {
  if (typeof value === 'boolean') {
    appSettingsStore.setReaderScrollInfiniteLoading(value)
  }
}
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color-page);
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
  flex-shrink: 0;
}

.settings-header h1 {
  margin: 0;
  font-size: 20px;
}

.settings-window {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

.settings-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 18px 14px;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

.settings-search {
  margin-bottom: 16px;
}

.settings-navigation {
  flex: 1;
  overflow-y: auto;
}

.navigation-group {
  margin-bottom: 18px;
}

.navigation-group h2 {
  margin: 0 10px 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.navigation-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  color: var(--el-text-color-regular);
  background: transparent;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.navigation-item:hover {
  background: var(--el-fill-color-light);
}

.navigation-item.active {
  color: var(--el-color-white);
  background: var(--el-color-primary);
}

.settings-panel {
  min-width: 0;
  padding: 24px 32px 80px;
  overflow-y: auto;
}

.panel-breadcrumb {
  margin-bottom: 24px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.heading-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  font-size: 23px;
}

.panel-heading h2 {
  margin: 0 0 5px;
  font-size: 22px;
}

.panel-heading p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.preference-list {
  margin-top: 24px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color-overlay);
}

.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 82px;
  padding: 16px 20px;
}

.preference-row + .preference-row {
  border-top: 1px solid var(--el-border-color-lighter);
}

.preference-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preference-copy strong {
  font-size: 15px;
  font-weight: 500;
}

.preference-copy small {
  color: var(--el-text-color-secondary);
}

@media screen and (max-width: 768px) {
  .settings-window {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .settings-panel {
    padding: 20px 18px 72px;
  }

  .preference-row {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media screen and (max-width: 640px) {
  .settings-header {
    height: 56px;
    padding: 0 12px;
  }

  .settings-window {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .settings-sidebar {
    min-height: 260px;
    max-height: 42vh;
    padding: 12px;
    border-right: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
    flex: 0 0 auto;
  }

  .settings-panel {
    padding: 18px 14px 72px;
    overflow: visible;
  }

  .panel-breadcrumb {
    margin-bottom: 16px;
  }
}

@media screen and (max-width: 767px) {
  .settings-view.mobile-layout {
    height: auto;
    min-height: calc(100vh - var(--mobile-primary-nav-total-height));
    min-height: calc(100dvh - var(--mobile-primary-nav-total-height));
    overflow: visible;
    color: var(--mobile-text);
    background: var(--mobile-bg);
  }

  .settings-view.mobile-layout .settings-header {
    height: auto;
    min-height: 72px;
    padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 12px;
    border-color: var(--mobile-border);
    background: var(--mobile-bg);
  }

  .settings-view.mobile-layout .settings-header :deep(.el-button) {
    display: none;
  }

  .settings-view.mobile-layout .settings-header h1 {
    color: var(--mobile-text);
    font-size: 30px;
    font-weight: 760;
    letter-spacing: -0.035em;
  }

  .settings-view.mobile-layout .settings-window {
    display: flex;
    min-height: 0;
    flex-direction: column;
    overflow: visible;
  }

  .settings-view.mobile-layout .settings-sidebar {
    min-height: 0;
    max-height: none;
    padding: 14px 16px 18px;
    border-right: 0;
    border-bottom: 1px solid var(--mobile-border);
    background: var(--mobile-bg);
  }

  .settings-view.mobile-layout .settings-search :deep(.el-input__wrapper) {
    min-height: 50px;
    padding: 0 14px;
    border-radius: 14px;
    background: var(--mobile-surface-raised);
    box-shadow: 0 0 0 1px var(--mobile-border) inset;
  }

  .settings-view.mobile-layout .settings-navigation {
    display: grid;
    gap: 14px;
    overflow: visible;
  }

  .settings-view.mobile-layout .navigation-group {
    margin: 0;
    padding: 8px;
    border: 1px solid var(--mobile-border);
    border-radius: 14px;
    background: var(--mobile-surface);
  }

  .settings-view.mobile-layout .navigation-group h2 {
    margin: 6px 10px 7px;
    color: var(--mobile-text-muted);
  }

  .settings-view.mobile-layout .navigation-item {
    min-height: 44px;
    height: auto;
    border-radius: 10px;
    color: var(--mobile-text-muted);
  }

  .settings-view.mobile-layout .navigation-item > span {
    flex: 1;
  }

  .settings-view.mobile-layout .navigation-chevron {
    flex: 0 0 auto;
    color: var(--mobile-text-muted);
    font-size: 16px;
  }

  .settings-view.mobile-layout .navigation-item.active {
    color: var(--el-color-primary);
    background: rgba(var(--legado-primary-rgb), 0.12);
  }

  .settings-view.mobile-layout .settings-panel {
    min-height: calc(100dvh - 72px - var(--mobile-primary-nav-total-height));
    padding: 14px 16px 32px;
    overflow: visible;
    background: var(--mobile-bg);
  }

  .settings-view.mobile-layout .mobile-panel-back {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    margin: 0 0 12px -8px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    color: var(--el-color-primary);
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
  }

  .settings-view.mobile-layout .mobile-panel-back:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 1px;
  }

  .settings-view.mobile-layout .panel-breadcrumb {
    display: none;
  }

  .settings-view.mobile-layout .panel-heading {
    align-items: flex-start;
    border-color: var(--mobile-border);
  }

  .settings-view.mobile-layout .heading-icon {
    flex: 0 0 auto;
    border-radius: 12px;
    background: rgba(var(--legado-primary-rgb), 0.12);
  }

  .settings-view.mobile-layout .preference-list {
    border-color: var(--mobile-border);
    border-radius: 14px;
    background: var(--mobile-surface);
  }

  .settings-view.mobile-layout .preference-row {
    gap: 14px;
    padding: 16px;
    border-color: var(--mobile-border);
  }
}
</style>
