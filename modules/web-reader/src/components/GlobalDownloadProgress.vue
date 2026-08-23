<template>
  <transition name="download-progress">
    <div v-if="shouldShow" class="global-download-progress">
      <div class="progress-header">
        <span class="progress-title">
          {{ activeTasks.length > 1 ? `${activeTasks.length} 个下载任务` : activeTasks[0]?.bookName }}
        </span>
        <span class="progress-value">{{ totalPercent }}%</span>
      </div>
      <el-progress :percentage="totalPercent" :show-text="false" />
      <div class="progress-detail">
        已处理 {{ completedChapters }} / {{ totalChapters }} 章
        <span v-if="activeTasks.length === 1 && activeTasks[0]?.currentTitle">
          · {{ activeTasks[0].currentTitle }}
        </span>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { platform } from '@/platform/capabilities'
import { useDownloadStore } from '@/stores/download'

const route = useRoute()
const downloadStore = useDownloadStore()
const { tasks } = storeToRefs(downloadStore)

const activeTasks = computed(() =>
  Object.values(tasks.value).filter(task => task.status === 'running'),
)
const completedChapters = computed(() =>
  activeTasks.value.reduce((sum, task) => sum + task.completed, 0),
)
const totalChapters = computed(() =>
  activeTasks.value.reduce((sum, task) => sum + task.total, 0),
)
const totalPercent = computed(() =>
  totalChapters.value > 0
    ? Math.round((completedChapters.value / totalChapters.value) * 100)
    : 0,
)
const shouldShow = computed(
  () => platform.isDesktop && route.name !== 'home' && activeTasks.value.length > 0,
)
</script>

<style scoped>
.global-download-progress {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1900;
  width: min(360px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-dark);
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.progress-title {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-value {
  flex-shrink: 0;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 600;
}

.progress-detail {
  margin-top: 8px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.download-progress-enter-active,
.download-progress-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.download-progress-enter-from,
.download-progress-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media screen and (max-width: 600px) {
  .global-download-progress {
    right: 16px;
    bottom: 72px;
  }
}
</style>
