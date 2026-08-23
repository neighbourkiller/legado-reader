<template>
  <div class="records-panel" v-loading="loading">
    <div class="panel-toolbar">
      <el-input v-model="keyword" placeholder="搜索书名、章节或书签内容" clearable :prefix-icon="Search" />
      <span class="record-count">共 {{ filteredBookmarks.length }} 条</span>
    </div>

    <el-empty v-if="!loading && filteredBookmarks.length === 0" description="暂无书签" />

    <div v-else class="record-list">
      <article v-for="bookmark in filteredBookmarks" :key="bookmark.id" class="record-item">
        <button type="button" class="record-main" @click="openBookmark(bookmark)">
          <strong>{{ bookmark.bookName }}</strong>
          <span>{{ bookmark.chapterTitle }} · 第 {{ bookmark.chapterPos + 1 }} 段</span>
          <p>{{ bookmark.content || '暂无摘录' }}</p>
          <small>{{ formatDate(bookmark.createdAt) }}</small>
        </button>
        <el-button type="danger" text @click="removeBookmark(bookmark)">删除</el-button>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  deleteBookmark,
  getAllBookmarks,
  getBook,
} from '@/storage/db'
import type { BookmarkRecord } from '@/storage/db'

const router = useRouter()
const loading = ref(false)
const keyword = ref('')
const bookmarks = ref<BookmarkRecord[]>([])

const filteredBookmarks = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return bookmarks.value
  return bookmarks.value.filter(bookmark =>
    `${bookmark.bookName}${bookmark.bookAuthor}${bookmark.chapterTitle}${bookmark.content}`
      .toLowerCase()
      .includes(query),
  )
})

const loadBookmarks = async () => {
  loading.value = true
  try {
    bookmarks.value = await getAllBookmarks()
  } finally {
    loading.value = false
  }
}

const openBookmark = async (bookmark: BookmarkRecord) => {
  if (!(await getBook(bookmark.bookId))) {
    ElMessage.warning('该书籍已不在书架中')
    return
  }
  router.push({
    path: `/reader/${bookmark.bookId}`,
    query: {
      chapter: String(bookmark.chapterIndex),
      pos: String(bookmark.chapterPos),
    },
  })
}

const removeBookmark = async (bookmark: BookmarkRecord) => {
  try {
    await ElMessageBox.confirm(`确定删除《${bookmark.bookName}》的这条书签吗？`, '删除书签', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteBookmark(bookmark.id)
    bookmarks.value = bookmarks.value.filter(item => item.id !== bookmark.id)
    ElMessage.success('书签已删除')
  } catch {
    // 用户取消
  }
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN')

onMounted(loadBookmarks)
</script>

<style scoped>
.records-panel { margin-top: 24px; }
.panel-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.panel-toolbar .el-input { max-width: 420px; }
.record-count { color: var(--el-text-color-secondary); font-size: 13px; white-space: nowrap; }
.record-list { overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-bg-color-overlay); }
.record-item { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-bottom: 1px solid var(--el-border-color-lighter); }
.record-item:last-child { border-bottom: 0; }
.record-main { display: flex; flex: 1; min-width: 0; padding: 0; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; flex-direction: column; gap: 5px; }
.record-main strong { font-size: 15px; }
.record-main span { color: var(--el-color-primary); font-size: 13px; }
.record-main p { width: 100%; margin: 2px 0; color: var(--el-text-color-regular); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-main small { color: var(--el-text-color-secondary); }
</style>
