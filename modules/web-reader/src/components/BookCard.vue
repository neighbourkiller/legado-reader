<template>
  <div
    class="book-item-card"
    @click="handleOpen"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="cover-wrapper">
      <img
        class="cover-img"
        :src="coverSrc"
        :alt="book.name"
        loading="lazy"
        @error="onImageError"
      />
      <div v-if="!hasCoverImage" class="cover-title-overlay">
        <span class="cover-name">{{ book.name }}</span>
        <span class="cover-author">{{ book.author }}</span>
      </div>
    </div>

    <div class="info-wrapper">
      <div class="title-row">
        <div class="book-title" :title="book.name">{{ book.name }}</div>

        <!-- Three-dots Dropdown Menu -->
        <el-dropdown
          ref="dropdownRef"
          trigger="click"
          placement="bottom-end"
          @command="handleCommand"
          @click.stop
        >
          <button
            type="button"
            class="more-btn"
            title="更多操作"
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
            <el-dropdown-menu class="book-action-menu">
              <el-dropdown-item command="detail" :icon="Document" v-if="supportsDetail">
                书籍详情
              </el-dropdown-item>
              <el-dropdown-item command="edit" :icon="Edit">
                修改信息
              </el-dropdown-item>
              <el-dropdown-item command="delete" :icon="Delete" divided class="delete-action-item">
                从书架删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="sub-info">
        <span class="author" :title="book.author">{{ book.author || '佚名' }}</span>
        <span class="dot">•</span>
        <span class="chapters">共{{ book.totalChapters }}章</span>
        <span class="dot">•</span>
        <span class="time">{{ timeFormatted }}</span>
      </div>

      <div class="dur-chapter" :title="durChapterText">
        已读：{{ durChapterText }}
      </div>

      <div class="last-chapter" :title="latestChapterText">
        最新：{{ latestChapterText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Edit, Delete, Document } from '@element-plus/icons-vue'
import type { DropdownInstance } from 'element-plus'
import type { BookMeta } from '@/parsers/types'
import defaultCover from '@/assets/imgs/default_cover.jpg'

const props = defineProps<{
  book: BookMeta
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'delete', id: string): void
  (e: 'edit', book: BookMeta): void
  (e: 'detail', id: string): void
}>()

const dropdownRef = ref<DropdownInstance | null>(null)
const imageLoadFailed = ref(false)
const supportsDetail = computed(() =>
  import.meta.env.VITE_APP_TARGET === 'desktop' || props.book.format !== 'online',
)

const hasCoverImage = computed(() => {
  return Boolean(props.book.coverUrl) && !imageLoadFailed.value
})

const coverSrc = computed(() => {
  if (props.book.coverUrl && !imageLoadFailed.value) {
    return props.book.coverUrl
  }
  return defaultCover
})

const onImageError = () => {
  imageLoadFailed.value = true
}

const timeFormatted = computed(() => {
  if (!props.book.lastReadTime) return props.book.format.toUpperCase()
  const diff = Date.now() - props.book.lastReadTime
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
})

const durChapterText = computed(() => {
  if (props.book.durChapterTitle) {
    return props.book.durChapterTitle
  }
  if (props.book.currentChapter !== undefined && props.book.currentChapter > 0) {
    return `第${props.book.currentChapter + 1}章`
  }
  return '尚无阅读记录'
})

const latestChapterText = computed(() => {
  if (props.book.latestChapterTitle) {
    return props.book.latestChapterTitle
  }
  return `第${props.book.totalChapters}章`
})

const handleOpen = () => {
  emit('open', props.book.id)
}

const handleContextMenu = () => {
  dropdownRef.value?.handleOpen()
}

const handleCommand = (command: string) => {
  if (command === 'detail') {
    emit('detail', props.book.id)
  } else if (command === 'edit') {
    emit('edit', props.book)
  } else if (command === 'delete') {
    emit('delete', props.book.id)
  }
}
</script>

<style scoped>
.book-item-card {
  user-select: none;
  display: flex;
  cursor: pointer;
  padding: 20px 20px;
  box-sizing: border-box;
  flex-direction: row;
  border-radius: 6px;
  position: relative;
  transition: background-color 0.25s ease, transform 0.2s ease;
}

.book-item-card:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

:global(html:not(.dark)) .book-item-card:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

/* Cover section */
.cover-wrapper {
  position: relative;
  width: 84px;
  min-width: 84px;
  height: 112px;
  border-radius: 3px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  background-color: #f0ede6;
}

.cover-img {
  width: 84px;
  height: 112px;
  object-fit: cover;
  display: block;
}

.cover-title-overlay {
  position: absolute;
  top: 12px;
  left: 10px;
  right: 10px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  pointer-events: none;
}

.cover-name {
  font-size: 11px;
  font-weight: 700;
  color: #2b2825;
  line-height: 1.25;
  max-height: 42px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-clamp: 3;
  font-family: var(--legado-font-ui);
}

.cover-author {
  font-size: 9px;
  color: #797167;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Info section */
.info-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  height: 112px;
  margin-left: 18px;
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.book-title {
  font-size: 16px;
  font-weight: 700;
  color: #e4e7ed;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  transition: color 0.2s ease;
}

:global(html:not(.dark)) .book-title {
  color: #33373d;
}

/* More three-dots button */
.more-btn {
  opacity: 0.4;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #a0a0a0;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.book-item-card:hover .more-btn {
  opacity: 0.85;
}

.more-btn:hover {
  opacity: 1 !important;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

:global(html:not(.dark)) .more-btn {
  color: #606266;
}

:global(html:not(.dark)) .more-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #111827;
}

.more-icon {
  width: 16px;
  height: 16px;
}

/* Sub information */
.sub-info {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  font-size: 12px;
  font-weight: 500;
  color: #8c8c8c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(html:not(.dark)) .sub-info {
  color: #6b6b6b;
}

.author {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dot {
  margin: 0 6px;
  color: #666666;
}

.dur-chapter,
.last-chapter {
  color: #808080;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

:global(html:not(.dark)) .dur-chapter,
:global(html:not(.dark)) .last-chapter {
  color: #969ba3;
}
</style>

<style>
/* Dropdown Global Override for smooth theme harmony */
.delete-action-item {
  color: #f56c6c !important;
}

.delete-action-item:hover {
  background-color: rgba(245, 108, 108, 0.12) !important;
  color: #f56c6c !important;
}
</style>
