<template>
  <div class="settings-view">
    <header class="settings-header">
      <el-button text @click="closeSettings">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <h1>设置</h1>
    </header>

    <main class="settings-window">
      <aside class="settings-sidebar">
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
              :class="{ active: selectedKey === item.key }"
              @click="selectItem(item)"
            >
              <el-icon><component :is="item.icon" /></el-icon>
              <span>{{ item.title }}</span>
            </button>
          </section>

          <el-empty
            v-if="filteredGroups.length === 0"
            description="没有匹配的设置"
            :image-size="56"
          />
        </nav>
      </aside>

      <section class="settings-panel">
        <div class="panel-breadcrumb">{{ selectedGroupTitle }} &gt; {{ selectedItem.title }}</div>
        <div class="panel-heading">
          <div class="heading-icon"><el-icon><component :is="selectedItem.icon" /></el-icon></div>
          <div>
            <h2>{{ selectedItem.title }}</h2>
            <p>{{ selectedItem.description }}</p>
          </div>
        </div>

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
        </div>

        <BookmarksPanel v-else-if="selectedKey === 'bookmarks'" />
        <ReadingHistoryPanel v-else-if="selectedKey === 'history'" />
        <FileManagerPanel v-else-if="selectedKey === 'files'" />
        <AboutPanel v-else-if="selectedKey === 'about'" />
        <el-empty v-else description="该功能暂未实现" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Search,
  Collection,
  Operation,
  UploadFilled,
  Brush,
  Tools,
  CollectionTag,
  Clock,
  Folder,
  InfoFilled,
} from '@element-plus/icons-vue'
import { useAppSettingsStore } from '@/stores/appSettings'
import type { BookshelfClickAction } from '@/stores/appSettings'
import BookmarksPanel from '@/components/settings/BookmarksPanel.vue'
import ReadingHistoryPanel from '@/components/settings/ReadingHistoryPanel.vue'
import FileManagerPanel from '@/components/settings/FileManagerPanel.vue'
import AboutPanel from '@/components/settings/AboutPanel.vue'

type SettingKey =
  | 'preferences'
  | 'backup'
  | 'theme'
  | 'other'
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
const appSettingsStore = useAppSettingsStore()
const searchKeyword = ref('')

const groups: SettingGroup[] = [
  {
    title: '常用',
    items: [
      { key: 'bookSources', title: '书源管理', description: '导入、编辑或管理书源', icon: Collection, path: '/book-sources' },
      { key: 'preferences', title: '偏好', description: '设置书架与应用交互偏好', icon: Operation },
    ],
  },
  {
    title: '设置',
    items: [
      { key: 'backup', title: '备份与恢复', description: '备份或恢复客户端数据', icon: UploadFilled },
      { key: 'theme', title: '主题设置', description: '调整界面主题与颜色', icon: Brush },
      { key: 'other', title: '其他设置', description: '与客户端功能相关的设置', icon: Tools },
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
const selectedKey = ref<SettingKey>('preferences')

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
}

const handleActionChange = (value: string | number | boolean | undefined) => {
  if (value === 'detail' || value === 'reader') {
    appSettingsStore.setBookshelfClickAction(value as BookshelfClickAction)
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
</style>
