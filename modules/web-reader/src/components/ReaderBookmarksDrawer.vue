<template>
  <el-drawer
    :model-value="modelValue"
    class="reader-bookmarks-drawer"
    direction="rtl"
    size="min(420px, 100vw)"
    :show-close="true"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="drawer-title">
        <strong>书签与标注</strong>
        <span>{{ bookmarks.length + highlights.length }} 条</span>
      </div>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="书签" name="bookmarks">
        <el-button
          class="current-bookmark-action"
          :type="currentPositionBookmarked ? 'danger' : 'primary'"
          :loading="saving"
          @click="emit('toggleCurrent')"
        >
          {{ currentPositionBookmarked ? '删除当前位置书签' : '添加当前位置书签' }}
        </el-button>

        <div v-loading="loading" class="bookmark-content">
          <el-empty v-if="!loading && bookmarks.length === 0" description="本书暂无书签" />

          <div v-else class="bookmark-list">
            <article v-for="bookmark in bookmarks" :key="bookmark.id" class="bookmark-item">
              <button type="button" class="bookmark-main" @click="emit('jump', bookmark)">
                <strong>{{ bookmark.chapterTitle }}</strong>
                <p>{{ bookmark.content || '暂无摘录' }}</p>
                <small>
                  第 {{ bookmark.chapterPos + 1 }} 段
                  <template v-if="bookmark.startOffset"> · 字符 {{ bookmark.startOffset + 1 }}</template>
                  · {{ formatDate(bookmark.createdAt) }}
                </small>
              </button>
              <el-button type="danger" text @click="emit('delete', bookmark)">删除</el-button>
            </article>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="标注" name="highlights">
        <div v-loading="loading" class="bookmark-content">
          <el-empty v-if="!loading && highlights.length === 0" description="本书暂无标注" />
          <div v-else class="bookmark-list">
            <article v-for="highlight in highlights" :key="highlight.id" class="bookmark-item">
              <span class="highlight-swatch" :style="highlightSwatch(highlight)" />
              <button type="button" class="bookmark-main" @click="emit('highlightJump', highlight)">
                <strong>{{ highlight.chapterTitle }}</strong>
                <p>{{ highlight.note || highlight.text }}</p>
                <small>第 {{ highlight.startParagraph + 1 }} 段 · {{ formatDate(highlight.createdAt) }}</small>
              </button>
              <el-button text @click="emit('highlightEdit', highlight)">编辑</el-button>
              <el-button type="danger" text @click="emit('highlightDelete', highlight)">删除</el-button>
            </article>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { CSSProperties } from 'vue'
import type { BookmarkRecord, HighlightRecord } from '@/storage/db'

defineProps<{
  modelValue: boolean
  bookmarks: BookmarkRecord[]
  highlights: HighlightRecord[]
  loading: boolean
  saving: boolean
  currentPositionBookmarked: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  toggleCurrent: []
  jump: [bookmark: BookmarkRecord]
  delete: [bookmark: BookmarkRecord]
  highlightJump: [highlight: HighlightRecord]
  highlightEdit: [highlight: HighlightRecord]
  highlightDelete: [highlight: HighlightRecord]
}>()

const activeTab = ref<'bookmarks' | 'highlights'>('bookmarks')
const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN')
const highlightSwatch = (highlight: HighlightRecord): CSSProperties => highlight.style.kind === 'background'
  ? { backgroundColor: highlight.style.color }
  : { borderBottom: `${highlight.style.lineStyle === 'wavy' ? '3px wavy' : '3px solid'} ${highlight.style.color}` }
</script>

<style scoped>
.drawer-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.drawer-title strong {
  color: var(--el-text-color-primary);
  font-size: 18px;
}

.drawer-title span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.current-bookmark-action {
  width: 100%;
}

.bookmark-content {
  min-height: 180px;
}

.bookmark-list {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.bookmark-item:last-child {
  border-bottom: 0;
}

.highlight-swatch {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.bookmark-main {
  display: flex;
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
  flex-direction: column;
  gap: 5px;
}

.bookmark-main strong {
  color: var(--el-color-primary);
  font-size: 14px;
}

.bookmark-main p {
  width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-main small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
