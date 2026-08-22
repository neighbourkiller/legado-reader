<template>
  <el-card class="book-card" :body-style="{ padding: '0px' }" shadow="hover" @click="handleOpen">
    <div class="cover-placeholder" :style="{ backgroundColor: coverBgColor }">
      <span class="cover-text">{{ firstChar }}</span>
    </div>
    <div class="book-info">
      <h3 class="book-name">{{ book.name }}</h3>
      <p class="book-author">{{ book.author || '未知作者' }}</p>
      <div class="progress-container">
        <el-progress :percentage="Number(book.currentProgress.toFixed(1))" :show-text="false" />
      </div>
      <div class="actions">
        <span class="last-read">上次阅读: {{ formattedTime }}</span>
        <el-button type="danger" icon="Delete" circle size="small" @click.stop="handleDelete" />
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BookMeta } from '@/parsers/types'

const props = defineProps<{
  book: BookMeta
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'delete', id: string): void
}>()

const firstChar = computed(() => {
  return props.book.name ? props.book.name.charAt(0) : '书'
})

const coverBgColor = computed(() => {
  const colors = ['#e1f5fe', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e8eaf6']
  const index = props.book.name ? props.book.name.charCodeAt(0) % colors.length : 0
  return colors[index]
})

const formattedTime = computed(() => {
  if (!props.book.lastReadTime) return '未读'
  const date = new Date(props.book.lastReadTime)
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
})

const handleOpen = () => {
  emit('open', props.book.id)
}

const handleDelete = () => {
  emit('delete', props.book.id)
}
</script>

<style scoped>
.book-card {
  cursor: pointer;
  transition: transform 0.2s;
  display: flex;
  flex-direction: column;
}
.book-card:hover {
  transform: translateY(-4px);
}
.cover-placeholder {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.cover-text {
  font-size: 48px;
  color: rgba(0, 0, 0, 0.4);
  font-weight: bold;
}
.book-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.book-name {
  margin: 0;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-author {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.progress-container {
  margin: 8px 0;
}
.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}
.last-read {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
