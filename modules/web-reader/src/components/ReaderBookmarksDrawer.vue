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
        <div>
          <small>阅读标记</small>
          <strong>本书书签</strong>
        </div>
        <span>{{ bookmarks.length }} 枚书签</span>
      </div>
    </template>

    <el-tabs v-model="activeTab" class="bookmark-tabs">
      <el-tab-pane name="bookmarks">
        <template #label>
          <span class="tab-label">书签 <b>{{ bookmarks.length }}</b></span>
        </template>

        <section
          class="current-bookmark-card"
          :class="{ 'is-bookmarked': currentPositionBookmarked }"
          aria-live="polite"
        >
          <div class="bookmark-ribbon" aria-hidden="true">
            <el-icon><CollectionTag /></el-icon>
          </div>
          <div class="current-position-copy">
            <span>当前页末</span>
            <strong>{{ currentChapterTitle || '正在确定阅读位置' }}</strong>
            <p :title="currentPositionContent">
              {{ currentPositionContent || '打开正文后，可将当前页的最后一行加入书签。' }}
            </p>
          </div>
          <el-button
            class="current-bookmark-action"
            :type="currentPositionBookmarked ? 'danger' : 'primary'"
            :loading="saving"
            :disabled="!currentPositionAvailable"
            @click="emit('toggleCurrent')"
          >
            <el-icon>
              <Delete v-if="currentPositionBookmarked" />
              <CollectionTag v-else />
            </el-icon>
            {{ currentPositionBookmarked ? '删除此书签' : '添加到书签' }}
          </el-button>
        </section>

        <div class="list-heading">
          <strong>本书全部书签</strong>
          <span>按阅读顺序排列</span>
        </div>

        <div v-loading="loading" class="bookmark-content">
          <el-empty
            v-if="!loading && bookmarks.length === 0"
            description="本书还没有书签，可先收藏当前页末。"
          />

          <div v-else class="bookmark-list">
            <article
              v-for="(bookmark, index) in bookmarks"
              :key="bookmark.id"
              class="bookmark-item"
            >
              <button
                type="button"
                class="bookmark-main"
                :aria-label="`跳转到 ${bookmark.chapterTitle}`"
                @click="emit('jump', bookmark)"
              >
                <span class="bookmark-order">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="bookmark-copy">
                  <strong>{{ bookmark.chapterTitle }}</strong>
                  <p>{{ bookmark.content || '暂无摘录' }}</p>
                  <small>
                    第 {{ bookmark.chapterPos + 1 }} 段
                    <template v-if="bookmark.startOffset"> · 字符 {{ bookmark.startOffset + 1 }}</template>
                    · {{ formatDate(bookmark.createdAt) }}
                  </small>
                </span>
                <el-icon class="jump-icon"><ArrowRight /></el-icon>
              </button>
              <el-button
                class="bookmark-delete"
                type="danger"
                text
                :aria-label="`删除 ${bookmark.chapterTitle} 书签`"
                :title="`删除 ${bookmark.chapterTitle} 书签`"
                @click="emit('delete', bookmark)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </article>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="highlights">
        <template #label>
          <span class="tab-label">标注 <b>{{ highlights.length }}</b></span>
        </template>
        <div v-loading="loading" class="bookmark-content">
          <el-empty v-if="!loading && highlights.length === 0" description="本书暂无标注" />
          <div v-else class="bookmark-list">
            <article v-for="highlight in highlights" :key="highlight.id" class="bookmark-item">
              <span class="highlight-swatch" :style="highlightSwatch(highlight)" />
              <button
                type="button"
                class="bookmark-main highlight-main"
                @click="emit('highlightJump', highlight)"
              >
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
import { shallowRef, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { ArrowRight, CollectionTag, Delete } from '@element-plus/icons-vue'
import type { BookmarkRecord, HighlightRecord } from '@/storage/db'
import '@/assets/fonts/popfont.css'

const props = defineProps<{
  modelValue: boolean
  bookmarks: BookmarkRecord[]
  highlights: HighlightRecord[]
  loading: boolean
  saving: boolean
  currentPositionBookmarked: boolean
  currentPositionAvailable: boolean
  currentChapterTitle: string
  currentPositionContent: string
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

const activeTab = shallowRef<'bookmarks' | 'highlights'>('bookmarks')
watch(
  () => props.modelValue,
  visible => {
    if (visible) activeTab.value = 'bookmarks'
  },
)

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN')
const highlightSwatch = (highlight: HighlightRecord): CSSProperties => highlight.style.kind === 'background'
  ? { backgroundColor: highlight.style.color }
  : { borderBottom: `${highlight.style.lineStyle === 'wavy' ? '3px wavy' : '3px solid'} ${highlight.style.color}` }
</script>

<style scoped>
.drawer-title {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: 100%;
  gap: 18px;
}

.drawer-title > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.drawer-title small {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.18em;
}

.drawer-title strong {
  color: var(--el-text-color-primary);
  font-family: FZZCYSK, var(--legado-font-ui);
  font-size: 23px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.drawer-title span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-label b {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  font-size: 10px;
  font-weight: 650;
  line-height: 18px;
  text-align: center;
}

.current-bookmark-card {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 0 12px;
  padding: 16px;
  overflow: hidden;
  color: var(--bookmark-ink);
  background: var(--bookmark-paper);
  background: linear-gradient(135deg, var(--bookmark-paper), var(--bookmark-accent-soft));
  border: 1px solid var(--bookmark-rule);
  border-radius: 16px;
  box-shadow: 0 12px 28px rgba(68, 52, 30, 0.09);
}

.current-bookmark-card::after {
  position: absolute;
  right: -22px;
  bottom: -30px;
  width: 100px;
  height: 100px;
  border: 1px solid color-mix(in srgb, var(--bookmark-accent) 24%, transparent);
  border-radius: 50%;
  content: '';
  pointer-events: none;
}

.bookmark-ribbon {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 34px;
  height: 54px;
  padding-top: 9px;
  color: #fffaf0;
  background: var(--bookmark-accent);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
  transition: transform 180ms ease;
}

.current-bookmark-card.is-bookmarked .bookmark-ribbon {
  transform: translateY(-4px);
}

.current-position-copy {
  min-width: 0;
}

.current-position-copy > span {
  color: var(--bookmark-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.current-position-copy strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  font-family: FZZCYSK, var(--legado-font-ui);
  font-size: 17px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-position-copy p {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: color-mix(in srgb, var(--bookmark-ink) 72%, transparent);
  font-size: 12px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.current-bookmark-action {
  z-index: 1;
  grid-column: 1 / -1;
  width: 100%;
  margin-top: 14px;
  border-radius: 10px;
  font-weight: 650;
}

.list-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 24px 2px 10px;
}

.list-heading strong {
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.list-heading span {
  color: var(--el-text-color-secondary);
  font-size: 11px;
}

.bookmark-content {
  min-height: 180px;
}

.bookmark-list {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--el-bg-color-overlay);
}

.bookmark-item {
  display: flex;
  align-items: center;
  min-height: 84px;
  padding: 0 8px 0 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  transition: background-color 150ms ease;
}

.bookmark-item:hover {
  background: var(--el-fill-color-light);
}

.bookmark-item:last-child {
  border-bottom: 0;
}

.highlight-swatch {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
  margin-left: 12px;
  border-radius: 4px;
}

.bookmark-main {
  display: grid;
  align-items: center;
  grid-template-columns: 34px minmax(0, 1fr) 18px;
  flex: 1;
  gap: 10px;
  min-width: 0;
  padding: 13px 4px 13px 12px;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.bookmark-main:focus-visible {
  border-radius: 10px;
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}

.bookmark-order {
  align-self: start;
  padding-top: 2px;
  color: var(--bookmark-accent);
  font-family: var(--legado-font-code);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bookmark-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.bookmark-copy strong {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-copy p {
  width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-copy small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.highlight-main {
  display: flex;
  align-items: flex-start;
  padding: 13px 4px;
  flex-direction: column;
  gap: 5px;
}

.highlight-main strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.highlight-main p {
  width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-main small {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.jump-icon {
  color: var(--el-text-color-placeholder);
  transition: color 150ms ease, transform 150ms ease;
}

.bookmark-main:hover .jump-icon {
  color: var(--bookmark-accent);
  transform: translateX(2px);
}

.bookmark-delete {
  flex: 0 0 auto;
  opacity: 0.66;
}

.bookmark-delete:hover,
.bookmark-delete:focus-visible {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .bookmark-ribbon,
  .bookmark-item,
  .jump-icon {
    transition: none;
  }
}

@media screen and (max-width: 520px) {
  .current-bookmark-card {
    padding: 14px;
  }

  .list-heading span {
    display: none;
  }

  .bookmark-copy small {
    font-size: 11px;
  }
}
</style>

<style>
.reader-bookmarks-drawer {
  --bookmark-accent: #b7791f;
  --bookmark-accent-soft: #f4e7ce;
  --bookmark-paper: #f7f2e8;
  --bookmark-ink: #2e2922;
  --bookmark-rule: #d8ccb8;
}

html.dark .reader-bookmarks-drawer {
  --bookmark-accent: #e3ad55;
  --bookmark-accent-soft: #332b20;
  --bookmark-paper: #211f1c;
  --bookmark-ink: #eee9df;
  --bookmark-rule: #494136;
}

.reader-bookmarks-drawer .el-drawer__header {
  margin-bottom: 0;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.reader-bookmarks-drawer .el-drawer__body {
  padding-top: 8px;
}
</style>
