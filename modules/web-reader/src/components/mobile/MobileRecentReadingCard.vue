<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { Reading } from '@element-plus/icons-vue'
import type { BookMeta } from '@/parsers/types'
import defaultCover from '@/assets/imgs/default_cover.jpg'
import { clampBookProgress } from '@/mobile/mobileHome'

const props = defineProps<{
  book: BookMeta
}>()

const emit = defineEmits<{
  continue: [id: string]
}>()

const imageLoadFailed = shallowRef(false)
const progress = computed(() => clampBookProgress(props.book.currentProgress))
const coverSrc = computed(() =>
  props.book.coverUrl && !imageLoadFailed.value ? props.book.coverUrl : defaultCover,
)
const chapterText = computed(() =>
  props.book.durChapterTitle || `第 ${Math.max(1, props.book.currentChapter + 1)} 章`,
)

watch(() => props.book.id, () => {
  imageLoadFailed.value = false
})
</script>

<template>
  <article class="recent-reading-card">
    <div class="recent-reading-card__cover">
      <img :src="coverSrc" :alt="book.name" @error="imageLoadFailed = true" />
      <span v-if="!book.coverUrl || imageLoadFailed" class="recent-reading-card__cover-title">
        {{ book.name }}
      </span>
    </div>

    <div class="recent-reading-card__body">
      <h3 :title="book.name">{{ book.name }}</h3>
      <p class="recent-reading-card__chapter">{{ chapterText }}</p>
      <div
        class="recent-reading-card__progress"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progress"
      >
        <span :style="{ width: `${progress}%` }"></span>
      </div>
      <p class="recent-reading-card__meta">
        已读 {{ progress }}% · 共 {{ book.totalChapters }} 章
      </p>
    </div>

    <button
      type="button"
      class="recent-reading-card__action"
      @click="emit('continue', book.id)"
    >
      <el-icon><Reading /></el-icon>
      <span>继续阅读</span>
    </button>
  </article>
</template>

<style scoped>
.recent-reading-card {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--mobile-border) 82%, var(--el-color-primary));
  border-radius: 18px;
  background:
    radial-gradient(circle at 90% 10%, rgba(var(--legado-primary-rgb), 0.13), transparent 42%),
    var(--mobile-surface);
  box-shadow: var(--mobile-shadow);
}

.recent-reading-card__cover {
  position: relative;
  width: 72px;
  height: 98px;
  overflow: hidden;
  border-radius: 7px;
  background: #ede9df;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
}

.recent-reading-card__cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recent-reading-card__cover-title {
  position: absolute;
  inset: 12px 8px;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #312d28;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.recent-reading-card__body {
  min-width: 0;
}

.recent-reading-card__body h3 {
  display: -webkit-box;
  margin: 1px 0 6px;
  overflow: hidden;
  color: var(--mobile-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.recent-reading-card__chapter,
.recent-reading-card__meta {
  margin: 0;
  overflow: hidden;
  color: var(--mobile-text-muted);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-reading-card__progress {
  height: 5px;
  margin: 12px 0 7px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-border) 75%, transparent);
}

.recent-reading-card__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--el-color-primary);
}

.recent-reading-card__action {
  grid-column: 1 / -1;
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: var(--el-color-primary);
  box-shadow: 0 8px 18px rgba(var(--legado-primary-rgb), 0.24);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.recent-reading-card__action:active {
  transform: translateY(1px);
}

.recent-reading-card__action:focus-visible {
  outline: 2px solid var(--mobile-text);
  outline-offset: 2px;
}

@media (min-width: 420px) {
  .recent-reading-card {
    grid-template-columns: 78px minmax(0, 1fr) auto;
    align-items: center;
  }

  .recent-reading-card__cover {
    width: 78px;
    height: 106px;
  }

  .recent-reading-card__action {
    grid-column: auto;
    min-width: 98px;
    padding: 0 13px;
  }

  .recent-reading-card__action span {
    white-space: nowrap;
  }
}
</style>
