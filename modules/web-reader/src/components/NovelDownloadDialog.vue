<template>
  <el-dialog
    v-model="visible"
    title="离线下载"
    width="520px"
    :close-on-click-modal="downloadTask?.status !== 'running'"
  >
    <div class="download-dialog" v-if="book">
      <div class="download-summary">
        《{{ book.name }}》共 {{ chapters.length }} 章，已缓存 {{ downloadedCount }} 章
      </div>

      <template v-if="downloadTask?.status === 'running'">
        <el-progress :percentage="downloadPercent" />
        <div class="download-detail">
          已处理 {{ downloadTask.completed }} / {{ downloadTask.total }} 章
          <span v-if="downloadTask.currentTitle"> · {{ downloadTask.currentTitle }}</span>
        </div>
      </template>

      <template v-else>
        <el-radio-group v-model="downloadRangeMode" class="download-range-mode">
          <el-radio value="all">全部章节</el-radio>
          <el-radio value="unread">从当前阅读章节开始</el-radio>
          <el-radio value="custom">自定义范围</el-radio>
        </el-radio-group>

        <div class="custom-range" v-if="downloadRangeMode === 'custom'">
          <el-input-number v-model="downloadStart" :min="1" :max="chapters.length" />
          <span>至</span>
          <el-input-number v-model="downloadEnd" :min="downloadStart" :max="chapters.length" />
          <span>章</span>
        </div>

        <el-alert
          v-if="downloadTask?.status === 'partial'"
          type="warning"
          :closable="false"
          :title="`上次下载完成，但有 ${downloadTask.failed} 章失败；再次下载会跳过成功章节并重试失败章节。`"
        />
        <el-alert
          v-else-if="downloadTask?.status === 'completed'"
          type="success"
          :closable="false"
          title="所选章节已下载完成，可断网阅读。"
        />
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        v-if="downloadTask?.status === 'running'"
        type="danger"
        plain
        @click="handleCancelDownload"
      >
        停止下载
      </el-button>
      <el-button v-else type="primary" :disabled="!book || chapters.length === 0" @click="handleStartDownload">
        开始下载
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { BookChapter, BookMeta } from '@/parsers/types'
import { useBookSourceStore } from '@/stores/bookSource'
import { useDownloadStore } from '@/stores/download'

const props = defineProps<{
  modelValue: boolean
  book: BookMeta | null
  chapters: BookChapter[]
  beforeStart?: () => Promise<void> | void
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'downloaded-count': [value: number]
}>()

const bookSourceStore = useBookSourceStore()
const downloadStore = useDownloadStore()
const downloadRangeMode = ref<'all' | 'unread' | 'custom'>('all')
const downloadStart = ref(1)
const downloadEnd = ref(1)
const downloadedCount = ref(0)

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const downloadTask = computed(() => props.book ? downloadStore.getTask(props.book.id) : undefined)
const downloadPercent = computed(() => {
  const task = downloadTask.value
  return task?.total ? Math.round((task.completed / task.total) * 100) : 0
})

async function refreshDownloadedCount() {
  if (!props.book) return
  downloadedCount.value = await downloadStore.getDownloadedCount(
    props.book.id,
    props.book.sourceUrl,
    props.chapters,
  )
  emit('downloaded-count', downloadedCount.value)
}

watch(
  () => props.modelValue,
  async isVisible => {
    if (!isVisible) return
    downloadStart.value = 1
    downloadEnd.value = Math.max(1, props.chapters.length)
    await refreshDownloadedCount()
  },
)

async function handleStartDownload() {
  if (!props.book) return
  if (bookSourceStore.sources.length === 0) await bookSourceStore.loadSources()
  const source = bookSourceStore.sources.find(
    item => item.bookSourceUrl === props.book?.sourceUrl,
  )
  if (!source) {
    ElMessage.warning('对应书源未找到或已被禁用')
    return
  }

  let startIndex = 0
  let endIndex = props.chapters.length - 1
  if (downloadRangeMode.value === 'unread') {
    startIndex = props.book.currentChapter || 0
  } else if (downloadRangeMode.value === 'custom') {
    startIndex = downloadStart.value - 1
    endIndex = downloadEnd.value - 1
  }

  try {
    await props.beforeStart?.()
    const result = await downloadStore.startDownload(
      { ...props.book },
      [...props.chapters],
      source,
      startIndex,
      endIndex,
    )
    await refreshDownloadedCount()
    if (result.status === 'completed') {
      ElMessage.success(`下载完成：新增 ${result.succeeded} 章，跳过 ${result.skipped} 章`)
    } else if (result.status === 'partial') {
      ElMessage.warning(`下载结束：成功 ${result.succeeded} 章，失败 ${result.failed} 章`)
    } else {
      ElMessage.info('下载已停止')
    }
  } catch (error) {
    ElMessage.error(`下载失败: ${error instanceof Error ? error.message : error}`)
  }
}

function handleCancelDownload() {
  if (props.book) downloadStore.cancelDownload(props.book.id)
}
</script>

<style scoped>
.download-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.download-summary,
.download-detail {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.download-range-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.custom-range {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
