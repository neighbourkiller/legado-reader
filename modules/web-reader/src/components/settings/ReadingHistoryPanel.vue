<template>
  <div class="history-panel" v-loading="loading">
    <div class="summary-card">
      <div><small>累计阅读</small><strong>{{ formatDuration(totalReadTime) }}</strong></div>
      <div><small>书籍数量</small><strong>{{ records.length }}</strong></div>
      <el-button v-if="records.length" type="danger" plain @click="clearAll">清空记录</el-button>
    </div>

    <el-empty v-if="!loading && records.length === 0" description="暂无阅读记录" />

    <div v-else class="history-list">
      <article v-for="record in records" :key="record.bookId" class="history-item">
        <button type="button" class="history-main" @click="openRecord(record)">
          <strong>{{ record.bookName }}</strong>
          <span>{{ record.bookAuthor || '佚名' }}</span>
        </button>
        <div class="history-time">
          <strong>{{ formatDuration(record.readTime) }}</strong>
          <small>最后阅读：{{ formatDate(record.lastRead) }}</small>
        </div>
        <el-button type="danger" text @click="removeRecord(record)">删除</el-button>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  clearReadingRecords,
  deleteReadingRecord,
  getAllReadingRecords,
  getBook,
} from '@/storage/db'
import type { ReadingRecord } from '@/storage/db'

const router = useRouter()
const loading = ref(false)
const records = ref<ReadingRecord[]>([])
const totalReadTime = computed(() => records.value.reduce((total, record) => total + record.readTime, 0))

const loadRecords = async () => {
  loading.value = true
  try {
    records.value = await getAllReadingRecords()
  } finally {
    loading.value = false
  }
}

const openRecord = async (record: ReadingRecord) => {
  if (!(await getBook(record.bookId))) {
    ElMessage.warning('该书籍已不在书架中')
    return
  }
  router.push(`/reader/${record.bookId}`)
}

const removeRecord = async (record: ReadingRecord) => {
  try {
    await ElMessageBox.confirm(`确定删除《${record.bookName}》的阅读记录吗？`, '删除阅读记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteReadingRecord(record.bookId)
    records.value = records.value.filter(item => item.bookId !== record.bookId)
  } catch {
    // 用户取消
  }
}

const clearAll = async () => {
  try {
    await ElMessageBox.confirm('确定清空全部阅读记录吗？', '清空阅读记录', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await clearReadingRecords()
    records.value = []
    ElMessage.success('阅读记录已清空')
  } catch {
    // 用户取消
  }
}

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '', `${seconds}秒`].filter(Boolean).join('')
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN')

onMounted(loadRecords)
</script>

<style scoped>
.history-panel { margin-top: 24px; }
.summary-card { display: flex; align-items: center; gap: 36px; margin-bottom: 18px; padding: 18px 20px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-bg-color-overlay); }
.summary-card > div { display: flex; flex-direction: column; gap: 6px; }
.summary-card small { color: var(--el-text-color-secondary); }
.summary-card strong { font-size: 18px; }
.summary-card .el-button { margin-left: auto; }
.history-list { overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-bg-color-overlay); }
.history-item { display: flex; align-items: center; gap: 18px; padding: 16px 18px; border-bottom: 1px solid var(--el-border-color-lighter); }
.history-item:last-child { border-bottom: 0; }
.history-main { display: flex; flex: 1; min-width: 0; padding: 0; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; flex-direction: column; gap: 5px; }
.history-main span, .history-time small { color: var(--el-text-color-secondary); font-size: 12px; }
.history-time { display: flex; min-width: 180px; text-align: right; flex-direction: column; gap: 5px; }
.history-time strong { font-size: 14px; }
</style>
