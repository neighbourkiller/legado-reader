<template>
  <div class="bookshelf-container">
    <div v-if="bookshelfStore.books.length > 0" class="books-grid">
      <BookCard
        v-for="book in bookshelfStore.books"
        :key="book.id"
        :book="book"
        @open="openBook"
        @delete="confirmDeleteBook"
      />
    </div>
    <el-empty
      v-else
      description="书架空空如也，去首页导入小说吧"
    >
      <el-button type="primary" @click="router.push('/')">去导入</el-button>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import BookCard from '@/components/BookCard.vue'
import { useBookshelfStore } from '@/stores/bookshelf'

const router = useRouter()
const bookshelfStore = useBookshelfStore()

onMounted(async () => {
  await bookshelfStore.loadBooks()
})

const openBook = (id: string) => {
  router.push(`/reader/${id}`)
}

const confirmDeleteBook = (id: string) => {
  ElMessageBox.confirm(
    '确定要删除这本书吗？阅读进度也将一并删除。',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      await bookshelfStore.deleteBook(id)
      ElMessage.success('已删除')
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {
    // cancelled
  })
}
</script>

<style scoped>
.bookshelf-container {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}
.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 24px;
}
</style>
