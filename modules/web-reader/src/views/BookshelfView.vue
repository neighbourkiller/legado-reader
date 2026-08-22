<template>
  <div
    class="bookshelf-index-wrapper"
    :class="{ dark: isDark, light: !isDark }"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Drag overlay -->
    <transition name="fade">
      <div v-if="isDragging" class="drag-drop-overlay">
        <div class="drag-drop-box">
          <el-icon class="drag-icon"><UploadFilled /></el-icon>
          <div class="drag-text">释放鼠标导入电子书 (支持 TXT / EPUB)</div>
        </div>
      </div>
    </transition>

    <!-- Left Navigation Sidebar -->
    <aside class="navigation-wrapper">
      <div class="nav-top">
        <div class="navigation-title-wrapper" @click="router.push('/')">
          <div class="navigation-title">阅读</div>
          <div class="navigation-sub-title">清风不识字，何故乱翻书</div>
        </div>

        <div class="search-wrapper">
          <el-input
            v-model="searchWord"
            placeholder="搜索书籍，在线书籍自动加入书架"
            class="search-input"
            clearable
          >
            <template #prefix>
              <el-icon class="search-icon"><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="bottom-wrapper">
          <div class="recent-wrapper">
            <div class="recent-title">最近阅读</div>
            <div class="reading-recent">
              <div
                class="recent-book-badge"
                :class="[mostRecentBook ? 'is-primary' : 'is-warning', { 'clickable': Boolean(mostRecentBook) }]"
                :title="mostRecentBook ? mostRecentBook.name : '尚无阅读记录'"
                @click="openRecentBook"
              >
                {{ mostRecentBook ? mostRecentBook.name : '尚无阅读记录' }}
              </div>
            </div>
          </div>

          <!-- "基本设定" and "已连接xxxx" are hidden as requested -->
        </div>
      </div>

      <!-- Bottom: GitHub Link & Theme Toggle -->
      <div class="bottom-icons">
        <a
          href="https://github.com/neighbourkiller/legado"
          target="_blank"
          rel="noopener noreferrer"
          class="github-link"
          title="访问 GitHub 仓库"
        >
          <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </a>

        <ThemeToggle />
      </div>
    </aside>

    <!-- Right Bookshelf Main Content -->
    <main class="shelf-wrapper">
      <div class="shelf-header">
        <div class="shelf-header-left">
          <span class="shelf-count-text">
            书籍 ({{ filteredBooks.length }})
          </span>
          <span v-if="searchWord" class="search-hint">
            搜索结果
          </span>
        </div>
        <div class="shelf-header-right">
          <el-button type="primary" :icon="Plus" class="import-btn" @click="triggerUpload">
            传书 / 导入书籍
          </el-button>
          <el-button plain class="back-home-btn" @click="router.push('/')">
            返回首页
          </el-button>
        </div>
      </div>

      <div v-if="filteredBooks.length > 0" class="books-grid">
        <BookCard
          v-for="book in filteredBooks"
          :key="book.id"
          :book="book"
          @open="openBook"
          @edit="handleEditBook"
          @delete="confirmDeleteBook"
        />
      </div>

      <el-empty
        v-else-if="searchWord"
        description="未找到匹配的书籍"
        class="shelf-empty"
      >
        <el-button @click="searchWord = ''">清除搜索条件</el-button>
      </el-empty>

      <el-empty
        v-else
        description="书架空空如也，去导入电子书吧"
        class="shelf-empty"
      >
        <el-button type="primary" :icon="Plus" @click="triggerUpload">
          立即导入书籍
        </el-button>
      </el-empty>
    </main>

    <!-- Hidden file input for importing books -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".txt,.epub"
      multiple
      style="display: none"
      @change="handleFileSelect"
    />

    <!-- Edit Book Dialog -->
    <el-dialog
      v-model="showEditDialog"
      title="修改书籍信息"
      width="480px"
      destroy-on-close
      align-center
    >
      <el-form :model="editForm" label-position="top">
        <el-form-item label="书籍名称" required>
          <el-input
            v-model="editForm.name"
            placeholder="请输入书名"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="作者">
          <el-input
            v-model="editForm.author"
            placeholder="请输入作者"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="封面设置">
          <div class="cover-edit-section">
            <div class="cover-preview-box">
              <img
                :src="editForm.coverUrl || defaultCover"
                class="preview-img"
                alt="封面预览"
              />
            </div>
            <div class="cover-inputs">
              <el-input
                v-model="editForm.coverUrl"
                placeholder="输入封面图片 URL 链接"
                clearable
              />
              <div class="cover-action-btns">
                <el-button type="primary" plain size="small" @click="triggerCoverFilePick">
                  上传本地图片
                </el-button>
                <el-button size="small" @click="editForm.coverUrl = ''">
                  恢复默认封面
                </el-button>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showEditDialog = false">取消</el-button>
          <el-button type="primary" @click="saveEditBook">保存修改</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Hidden cover image file picker -->
    <input
      ref="coverFileInputRef"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleCoverFileSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Search, Plus, UploadFilled } from '@element-plus/icons-vue'
import '@/assets/fonts/shelffont.css'
import defaultCover from '@/assets/imgs/default_cover.jpg'
import type { BookMeta } from '@/parsers/types'
import BookCard from '@/components/BookCard.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useBookshelfStore } from '@/stores/bookshelf'
import { useTheme } from '@/composables/useTheme'

const router = useRouter()
const bookshelfStore = useBookshelfStore()
const { isDark } = useTheme()

const searchWord = ref('')
const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const coverFileInputRef = ref<HTMLInputElement | null>(null)

const showEditDialog = ref(false)
const editForm = ref({
  id: '',
  name: '',
  author: '',
  coverUrl: '',
})

let dragCounter = 0

onMounted(async () => {
  await bookshelfStore.loadBooks()
})

const filteredBooks = computed(() => {
  const query = searchWord.value.trim().toLowerCase()
  if (!query) return bookshelfStore.books

  return bookshelfStore.books.filter(b => {
    return (
      b.name.toLowerCase().includes(query) ||
      (b.author && b.author.toLowerCase().includes(query))
    )
  })
})

const mostRecentBook = computed(() => {
  if (bookshelfStore.books.length === 0) return null
  // The store already sorts books by lastReadTime descending
  return bookshelfStore.books[0]
})

const openRecentBook = () => {
  if (mostRecentBook.value) {
    openBook(mostRecentBook.value.id)
  }
}

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

const triggerUpload = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return

  await processFiles(Array.from(files))
  target.value = ''
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (dragCounter === 0) {
    isDragging.value = true
  }
  dragCounter++
}

const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDragging.value = false
  }
}

const onDrop = async (e: DragEvent) => {
  dragCounter = 0
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  await processFiles(Array.from(files))
}

const processFiles = async (files: File[]) => {
  const validFiles = files.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ext === 'txt' || ext === 'epub'
  })

  if (validFiles.length === 0) {
    ElMessage.error('仅支持导入 TXT 和 EPUB 格式的小说文件')
    return
  }

  const loading = ElMessage({
    message: `正在导入 ${validFiles.length} 本书籍...`,
    type: 'info',
    duration: 0
  })

  try {
    for (const file of validFiles) {
      await bookshelfStore.parseAndImportBook(file)
    }
    loading.close()
    ElMessage.success('导入成功')
  } catch (error) {
    loading.close()
    ElMessage.error('导入失败，请重试')
    console.error(error)
  }
}

const handleEditBook = (book: BookMeta) => {
  editForm.value = {
    id: book.id,
    name: book.name,
    author: book.author || '',
    coverUrl: book.coverUrl || '',
  }
  showEditDialog.value = true
}

const triggerCoverFilePick = () => {
  coverFileInputRef.value?.click()
}

const handleCoverFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择有效的图片文件')
    target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    if (event.target?.result) {
      editForm.value.coverUrl = event.target.result as string
    }
  }
  reader.readAsDataURL(file)
  target.value = ''
}

const saveEditBook = async () => {
  const name = editForm.value.name.trim()
  if (!name) {
    ElMessage.warning('书名不能为空')
    return
  }

  try {
    await bookshelfStore.updateBook(editForm.value.id, {
      name,
      author: editForm.value.author.trim(),
      coverUrl: editForm.value.coverUrl.trim() || undefined,
    })
    showEditDialog.value = false
    ElMessage.success('书籍信息已更新')
  } catch (error) {
    ElMessage.error('更新失败，请重试')
    console.error(error)
  }
}
</script>

<style scoped>
.bookshelf-index-wrapper {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  transition: background-color 0.25s ease, color 0.25s ease;
}

/* ================= Dark Mode (Night) ================= */
.bookshelf-index-wrapper.dark {
  background-color: #181818;
  color: #dcdcdc;
}

.bookshelf-index-wrapper.dark .navigation-wrapper {
  background-color: #2b2b2b;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
}

.bookshelf-index-wrapper.dark .navigation-title {
  color: #aeaeae;
}

.bookshelf-index-wrapper.dark .navigation-sub-title {
  color: #8c8c8c;
}

.bookshelf-index-wrapper.dark .search-wrapper :deep(.el-input__wrapper) {
  background-color: #383838;
  box-shadow: 0 0 0 1px #454545 inset;
}

.bookshelf-index-wrapper.dark .search-wrapper :deep(.el-input__inner) {
  color: #b1b1b1;
}

.bookshelf-index-wrapper.dark .search-wrapper :deep(.el-input__inner::placeholder) {
  color: #6e6e6e;
}

.bookshelf-index-wrapper.dark .recent-title {
  color: #8c8c8c;
}

.bookshelf-index-wrapper.dark .recent-book-badge.is-primary {
  background-color: rgba(64, 158, 255, 0.15);
  border: 1px solid rgba(64, 158, 255, 0.35);
  color: #79bbff;
}

.bookshelf-index-wrapper.dark .recent-book-badge.is-primary:hover {
  background-color: rgba(64, 158, 255, 0.25);
  border-color: rgba(64, 158, 255, 0.5);
  color: #9bf1ff;
}

.bookshelf-index-wrapper.dark .recent-book-badge.is-warning {
  background-color: rgba(230, 162, 60, 0.15);
  border: 1px solid rgba(230, 162, 60, 0.35);
  color: #e6a23c;
}

.bookshelf-index-wrapper.dark .shelf-wrapper {
  background-color: #161819;
}

.bookshelf-index-wrapper.dark .shelf-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.bookshelf-index-wrapper.dark .shelf-count-text {
  color: #dcdcdc;
}

.bookshelf-index-wrapper.dark .github-icon {
  color: #aeaeae;
}

.bookshelf-index-wrapper.dark .github-icon:hover {
  color: #ffffff;
}

/* ================= Light Mode (Day) ================= */
.bookshelf-index-wrapper.light {
  background-color: #ffffff;
  color: #333333;
}

.bookshelf-index-wrapper.light .navigation-wrapper {
  background-color: #f7f7f7;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
}

.bookshelf-index-wrapper.light .navigation-title {
  color: #2c3e50;
}

.bookshelf-index-wrapper.light .navigation-sub-title {
  color: #b1b1b1;
}

.bookshelf-index-wrapper.light .search-wrapper :deep(.el-input__wrapper) {
  background-color: #ffffff;
  box-shadow: 0 0 0 1px #e3e3e3 inset;
}

.bookshelf-index-wrapper.light .search-wrapper :deep(.el-input__inner) {
  color: #333333;
}

.bookshelf-index-wrapper.light .search-wrapper :deep(.el-input__inner::placeholder) {
  color: #a0a0a0;
}

.bookshelf-index-wrapper.light .recent-title {
  color: #b1b1b1;
}

.bookshelf-index-wrapper.light .recent-book-badge.is-primary {
  background-color: #ecf5ff;
  border: 1px solid #d9ecff;
  color: #409eff;
}

.bookshelf-index-wrapper.light .recent-book-badge.is-primary:hover {
  background-color: #d9ecff;
  border-color: #c6e2ff;
  color: #2b85e4;
}

.bookshelf-index-wrapper.light .recent-book-badge.is-warning {
  background-color: #fdf6ec;
  border: 1px solid #faecd8;
  color: #e6a23c;
}

.bookshelf-index-wrapper.light .shelf-wrapper {
  background-color: #ffffff;
}

.bookshelf-index-wrapper.light .shelf-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.bookshelf-index-wrapper.light .shelf-count-text {
  color: #33373d;
}

.bookshelf-index-wrapper.light .github-icon {
  color: #4b5563;
}

.bookshelf-index-wrapper.light .github-icon:hover {
  color: #111827;
}

/* ================= Navigation Sidebar ================= */
.navigation-wrapper {
  width: 260px;
  min-width: 260px;
  height: 100%;
  padding: 48px 36px 32px 36px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  overflow: hidden;
}

.nav-top {
  display: flex;
  flex-direction: column;
}

.navigation-title-wrapper {
  cursor: pointer;
  user-select: none;
}

.navigation-title {
  font-size: 26px;
  font-weight: 500;
  font-family: 'FZZCYSK', "Songti SC", "SimSun", "Noto Serif CJK SC", serif;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.navigation-sub-title {
  font-size: 15px;
  font-weight: 300;
  font-family: 'FZZCYSK', "Songti SC", "SimSun", "Noto Serif CJK SC", serif;
  margin-top: 14px;
  letter-spacing: 0.05em;
}

/* Search input */
.search-wrapper {
  margin-top: 24px;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 50px;
  padding: 4px 14px;
  transition: box-shadow 0.2s ease;
}

.search-icon {
  font-size: 16px;
  color: #8c8c8c;
  margin-right: 4px;
}

/* Recent Reading section */
.bottom-wrapper {
  display: flex;
  flex-direction: column;
}

.recent-wrapper {
  margin-top: 36px;
}

.recent-title {
  font-size: 14px;
  font-family: 'FZZCYSK', "Songti SC", "SimSun", serif;
  letter-spacing: 0.05em;
}

.reading-recent {
  margin-top: 14px;
}

.recent-book-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.recent-book-badge.clickable {
  cursor: pointer;
}

.recent-book-badge.clickable:hover {
  transform: translateY(-1px);
}

/* Bottom Icons */
.bottom-icons {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% + 22px);
  margin-right: -22px;
  margin-top: auto;
  padding-top: 16px;
}

.github-link {
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.github-icon {
  width: 26px;
  height: 26px;
  transition: color 0.2s ease, transform 0.2s ease;
}

.github-link:hover .github-icon {
  transform: scale(1.08);
}

/* ================= Shelf Main Content ================= */
.shelf-wrapper {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  padding: 40px 48px 60px 48px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.shelf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20px;
  margin-bottom: 24px;
}

.shelf-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.shelf-count-text {
  font-size: 18px;
  font-weight: 700;
}

.search-hint {
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 12px;
  background-color: rgba(64, 158, 255, 0.15);
  color: #409eff;
}

.shelf-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.books-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px 24px;
  justify-content: space-between;
}

.shelf-empty {
  margin: auto 0;
  padding: 60px 0;
}

/* Drag overlay */
.drag-drop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-drop-box {
  padding: 40px 60px;
  border: 2px dashed #409eff;
  border-radius: 8px;
  text-align: center;
  background: rgba(20, 20, 20, 0.85);
  color: #ffffff;
}

.drag-icon {
  font-size: 64px;
  color: #409eff;
  margin-bottom: 16px;
}

.drag-text {
  font-size: 20px;
  letter-spacing: 0.1em;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive Breakpoints */
@media screen and (max-width: 800px) {
  .bookshelf-index-wrapper {
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .navigation-wrapper {
    width: 100%;
    min-width: unset;
    height: auto;
    padding: 24px 20px;
  }

  .navigation-title-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .navigation-sub-title {
    margin-top: 0;
  }

  .bottom-icons {
    width: 100%;
    margin-right: 0;
    margin-top: 16px;
    padding-top: 12px;
  }

  .shelf-wrapper {
    padding: 20px;
    height: auto;
    overflow-y: visible;
  }

  .books-grid {
    grid-template-columns: 1fr;
  }
}

/* ================= Cover Edit Section ================= */
.cover-edit-section {
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;
}

.cover-preview-box {
  width: 66px;
  height: 88px;
  min-width: 66px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  background: #f0ede6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-inputs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cover-action-btns {
  display: flex;
  gap: 10px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
