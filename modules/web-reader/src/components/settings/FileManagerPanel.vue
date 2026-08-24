<template>
  <div class="file-panel" v-loading="loading">
    <div class="native-folder-action">
      <div>
        <strong>应用文件夹</strong>
        <span>使用系统默认文件管理器查看客户端的实际数据目录</span>
      </div>
      <el-button
        type="primary"
        plain
        :icon="FolderOpened"
        :loading="openingAppDirectory"
        :disabled="!platform.isDesktop"
        @click="handleOpenAppDirectory"
      >
        使用系统文件管理器打开
      </el-button>
    </div>

    <div class="scope-tip">
      仅显示并管理本客户端保存在 IndexedDB 中的文件，不会访问系统其他目录。
    </div>

    <div class="path-bar">
      <div class="breadcrumbs" aria-label="当前路径">
        <button type="button" @click="openRoot">客户端文件</button>
        <template v-if="currentDirectory === 'books'">
          <el-icon><ArrowRight /></el-icon>
          <button type="button" class="current">本地书籍</button>
        </template>
      </div>
      <el-input
        v-model="keyword"
        :placeholder="currentDirectory === 'root' ? '筛选目录' : '筛选当前目录文件'"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <div class="list-header">
      <span>名称</span>
      <span>类型</span>
      <span>大小</span>
      <span>最近使用</span>
      <span>操作</span>
    </div>

    <div class="file-list">
      <button
        v-if="currentDirectory === 'root' && showBooksFolder"
        type="button"
        class="file-row folder-row"
        @click="openBooks"
      >
        <span class="name-cell">
          <el-icon class="entry-icon folder-icon"><FolderOpened /></el-icon>
          <span><strong>本地书籍</strong><small>{{ files.length }} 个文件</small></span>
        </span>
        <span>文件夹</span>
        <span>{{ formatSize(allFilesSize) }}</span>
        <span>—</span>
        <span class="action-cell">打开</span>
      </button>

      <button
        v-if="currentDirectory === 'books'"
        type="button"
        class="file-row parent-row"
        @click="openRoot"
      >
        <span class="name-cell">
          <el-icon class="entry-icon"><Back /></el-icon>
          <span><strong>..</strong><small>返回上级目录</small></span>
        </span>
        <span>文件夹</span><span>—</span><span>—</span><span class="action-cell">返回</span>
      </button>

      <article v-for="file in filteredFiles" :key="file.id" class="file-row">
        <button type="button" class="name-cell file-name" @click="openFile(file)">
          <el-icon class="entry-icon file-icon"><Document /></el-icon>
          <span>
            <strong>{{ file.name }}</strong>
            <small>{{ file.author || '佚名' }} · {{ file.totalChapters }} 章</small>
          </span>
        </button>
        <span>{{ file.format.toUpperCase() }}</span>
        <span>{{ formatSize(file.size) }}</span>
        <span>{{ formatDate(file.lastReadTime) }}</span>
        <span class="row-actions">
          <el-button text type="primary" @click="openFile(file)">打开</el-button>
          <el-button text type="danger" @click="removeFile(file)">删除</el-button>
        </span>
      </article>

      <el-empty
        v-if="showEmpty"
        :description="currentDirectory === 'root' ? '没有匹配的目录' : '当前目录没有本地书籍文件'"
      />
    </div>

    <div class="status-bar">
      <span>{{ statusText }}</span>
      <el-button text :icon="Refresh" :loading="loading" @click="loadFiles">刷新</el-button>
    </div>

    <section class="cache-section" aria-labelledby="chapter-cache-title">
      <div class="section-heading">
        <div>
          <h3 id="chapter-cache-title">离线章节缓存</h3>
          <p>按书籍管理已下载或阅读时自动保存的网络章节正文</p>
        </div>
        <el-button
          type="danger"
          plain
          :disabled="cacheSummaries.length === 0"
          :loading="clearingAllCaches"
          @click="clearAllCaches"
        >
          全部清理
        </el-button>
      </div>

      <div class="cache-summary">
        <span>{{ cacheSummaries.length }} 本书</span>
        <span>{{ totalCachedChapters }} 章</span>
        <span>约 {{ formatSize(totalCacheSize) }}</span>
      </div>

      <div class="cache-list-header">
        <span>书籍</span>
        <span>缓存章数</span>
        <span>占用空间（约）</span>
        <span>操作</span>
      </div>
      <div class="cache-list">
        <article v-for="cache in cacheSummaries" :key="cache.bookId" class="cache-row">
          <span class="cache-book">
            <strong>{{ cache.bookName || '未知书籍' }}</strong>
            <small>{{ cache.bookAuthor || cache.bookId }}</small>
          </span>
          <span>{{ cache.chapterCount }} 章</span>
          <span>{{ formatSize(cache.size) }}</span>
          <span>
            <el-button
              text
              type="danger"
              :loading="clearingBookId === cache.bookId"
              @click="clearBookCache(cache)"
            >
              清理
            </el-button>
          </span>
        </article>
        <el-empty v-if="cacheSummaries.length === 0" description="暂无离线章节缓存" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowRight, Back, Document, FolderOpened, Refresh, Search } from '@element-plus/icons-vue'
import {
  clearChapterContents,
  deleteBookChapterContents,
  getAllStoredBookFiles,
  getChapterCacheSummaries,
} from '@/storage/db'
import type { ChapterCacheSummary, StoredBookFileInfo } from '@/storage/db'
import { useBookshelfStore } from '@/stores/bookshelf'
import { platform } from '@/platform/capabilities'
import { openAppDataDirectory } from '@/platform/appFiles'

type Directory = 'root' | 'books'

const router = useRouter()
const bookshelfStore = useBookshelfStore()
const loading = ref(false)
const openingAppDirectory = ref(false)
const clearingAllCaches = ref(false)
const clearingBookId = ref('')
const keyword = ref('')
const currentDirectory = ref<Directory>('root')
const files = ref<StoredBookFileInfo[]>([])
const cacheSummaries = ref<ChapterCacheSummary[]>([])

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const showBooksFolder = computed(() =>
  !normalizedKeyword.value || '本地书籍'.includes(normalizedKeyword.value),
)
const filteredFiles = computed(() => {
  if (currentDirectory.value !== 'books') return []
  if (!normalizedKeyword.value) return files.value
  return files.value.filter(file =>
    `${file.name}${file.author}${file.format}`.toLowerCase().includes(normalizedKeyword.value),
  )
})
const allFilesSize = computed(() => files.value.reduce((total, file) => total + file.size, 0))
const visibleFilesSize = computed(() => filteredFiles.value.reduce((total, file) => total + file.size, 0))
const totalCachedChapters = computed(() =>
  cacheSummaries.value.reduce((total, cache) => total + cache.chapterCount, 0),
)
const totalCacheSize = computed(() =>
  cacheSummaries.value.reduce((total, cache) => total + cache.size, 0),
)
const showEmpty = computed(() =>
  currentDirectory.value === 'root' ? !showBooksFolder.value : filteredFiles.value.length === 0,
)
const statusText = computed(() => {
  if (currentDirectory.value === 'root') return `1 个文件夹，${files.value.length} 个客户端文件`
  return `${filteredFiles.value.length} 个文件，${formatSize(visibleFilesSize.value)}`
})

watch(currentDirectory, () => { keyword.value = '' })

const openRoot = () => { currentDirectory.value = 'root' }
const openBooks = () => { currentDirectory.value = 'books' }
const openFile = (file: StoredBookFileInfo) => router.push(`/reader/${file.id}`)

const handleOpenAppDirectory = async () => {
  openingAppDirectory.value = true
  try {
    await openAppDataDirectory()
    ElMessage.success('已使用系统文件管理器打开应用文件夹')
  } catch (error) {
    console.error('打开应用文件夹失败', error)
    ElMessage.error(error instanceof Error ? error.message : '打开应用文件夹失败')
  } finally {
    openingAppDirectory.value = false
  }
}

const loadFiles = async () => {
  loading.value = true
  try {
    const [storedFiles, chapterCaches] = await Promise.all([
      getAllStoredBookFiles(),
      getChapterCacheSummaries(),
    ])
    files.value = storedFiles
    cacheSummaries.value = chapterCaches
  } catch (error) {
    console.error('读取客户端文件失败', error)
    ElMessage.error('读取客户端文件失败')
  } finally {
    loading.value = false
  }
}

const clearBookCache = async (cache: ChapterCacheSummary) => {
  try {
    await ElMessageBox.confirm(
      `确定清理《${cache.bookName || '未知书籍'}》的 ${cache.chapterCount} 章离线缓存吗？`,
      '清理离线章节缓存',
      { confirmButtonText: '清理', cancelButtonText: '取消', type: 'warning' },
    )
    clearingBookId.value = cache.bookId
    await deleteBookChapterContents(cache.bookId)
    cacheSummaries.value = cacheSummaries.value.filter(item => item.bookId !== cache.bookId)
    ElMessage.success('该书离线章节缓存已清理')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('清理单书离线章节缓存失败', error)
      ElMessage.error('清理离线章节缓存失败')
    }
  } finally {
    clearingBookId.value = ''
  }
}

const clearAllCaches = async () => {
  try {
    await ElMessageBox.confirm(
      `确定清理全部 ${totalCachedChapters.value} 章离线缓存吗？此操作不会删除书籍、书签和阅读记录。`,
      '清理全部离线章节缓存',
      { confirmButtonText: '全部清理', cancelButtonText: '取消', type: 'warning' },
    )
    clearingAllCaches.value = true
    await clearChapterContents()
    cacheSummaries.value = []
    ElMessage.success('全部离线章节缓存已清理')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('清理全部离线章节缓存失败', error)
      ElMessage.error('清理全部离线章节缓存失败')
    }
  } finally {
    clearingAllCaches.value = false
  }
}

const removeFile = async (file: StoredBookFileInfo) => {
  try {
    await ElMessageBox.confirm(
      `确定删除《${file.name}》及其本地文件吗？书签与阅读记录将保留。`,
      '删除客户端文件',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await bookshelfStore.deleteBook(file.id)
    files.value = files.value.filter(item => item.id !== file.id)
    cacheSummaries.value = cacheSummaries.value.filter(item => item.bookId !== file.id)
    ElMessage.success('客户端文件已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('删除客户端文件失败', error)
      ElMessage.error('删除客户端文件失败')
    }
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (timestamp: number) => {
  if (!timestamp) return '未使用'
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(loadFiles)
</script>

<style scoped>
.file-panel { margin-top: 24px; }
.native-folder-action { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px; padding: 14px 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 10px; background: var(--el-bg-color-overlay); }
.native-folder-action > div { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.native-folder-action strong { color: var(--el-text-color-primary); font-size: 14px; font-weight: 500; }
.native-folder-action span { color: var(--el-text-color-secondary); font-size: 12px; }
.scope-tip { margin-bottom: 14px; padding: 10px 13px; border-radius: 8px; color: var(--el-text-color-secondary); background: var(--el-fill-color-light); font-size: 13px; }
.path-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.path-bar .el-input { width: min(360px, 45%); }
.breadcrumbs { display: flex; align-items: center; min-width: 0; gap: 5px; }
.breadcrumbs button { padding: 5px 6px; border: 0; color: var(--el-color-primary); background: transparent; font: inherit; cursor: pointer; }
.breadcrumbs button.current { color: var(--el-text-color-primary); cursor: default; }
.breadcrumbs .el-icon { color: var(--el-text-color-placeholder); font-size: 13px; }
.list-header, .file-row { display: grid; grid-template-columns: minmax(260px, 1fr) 90px 90px 150px 120px; align-items: center; column-gap: 12px; }
.list-header { padding: 9px 16px; border: 1px solid var(--el-border-color-lighter); border-bottom: 0; border-radius: 10px 10px 0 0; color: var(--el-text-color-secondary); background: var(--el-fill-color-light); font-size: 12px; }
.file-list { overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 0 0 10px 10px; background: var(--el-bg-color-overlay); }
.file-row { min-height: 66px; padding: 9px 16px; border: 0; border-bottom: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-secondary); background: transparent; text-align: left; font-size: 12px; }
.file-row:last-child { border-bottom: 0; }
button.file-row { width: 100%; cursor: pointer; }
button.file-row:hover, .file-row:hover { background: var(--el-fill-color-light); }
.name-cell { display: flex; align-items: center; min-width: 0; gap: 13px; border: 0; color: inherit; background: transparent; text-align: left; }
button.name-cell { padding: 0; cursor: pointer; }
.name-cell > span { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.name-cell strong { overflow: hidden; color: var(--el-text-color-primary); font-size: 14px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.name-cell small { overflow: hidden; color: var(--el-text-color-secondary); text-overflow: ellipsis; white-space: nowrap; }
.entry-icon { flex: 0 0 auto; color: var(--el-text-color-secondary); font-size: 25px; }
.folder-icon { color: var(--el-color-warning); }
.file-icon { color: var(--el-color-primary); }
.action-cell { color: var(--el-color-primary); }
.row-actions { display: flex; align-items: center; }
.row-actions .el-button + .el-button { margin-left: 2px; }
.status-bar { display: flex; align-items: center; justify-content: space-between; min-height: 42px; color: var(--el-text-color-secondary); font-size: 12px; }
.file-list :deep(.el-empty) { padding: 34px 0; }
.cache-section { margin-top: 28px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.section-heading h3 { margin: 0 0 5px; color: var(--el-text-color-primary); font-size: 16px; }
.section-heading p { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
.cache-summary { display: flex; gap: 18px; padding: 11px 16px; border: 1px solid var(--el-border-color-lighter); border-bottom: 0; border-radius: 10px 10px 0 0; color: var(--el-text-color-secondary); background: var(--el-fill-color-light); font-size: 12px; }
.cache-list-header, .cache-row { display: grid; grid-template-columns: minmax(260px, 1fr) 110px 140px 80px; align-items: center; column-gap: 12px; }
.cache-list-header { padding: 9px 16px; border: 1px solid var(--el-border-color-lighter); border-bottom: 0; color: var(--el-text-color-secondary); font-size: 12px; }
.cache-list { overflow: hidden; border: 1px solid var(--el-border-color-lighter); border-radius: 0 0 10px 10px; background: var(--el-bg-color-overlay); }
.cache-row { min-height: 62px; padding: 8px 16px; border-bottom: 1px solid var(--el-border-color-lighter); color: var(--el-text-color-secondary); font-size: 12px; }
.cache-row:last-of-type { border-bottom: 0; }
.cache-row:hover { background: var(--el-fill-color-light); }
.cache-book { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.cache-book strong, .cache-book small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cache-book strong { color: var(--el-text-color-primary); font-size: 14px; font-weight: 500; }
.cache-book small { color: var(--el-text-color-secondary); }
.cache-list :deep(.el-empty) { padding: 30px 0; }

@media screen and (max-width: 900px) {
  .list-header, .file-row { grid-template-columns: minmax(220px, 1fr) 72px 80px 110px; }
  .list-header > :nth-child(4), .file-row > :nth-child(4) { display: none; }
}

@media screen and (max-width: 640px) {
  .native-folder-action { align-items: stretch; flex-direction: column; }
  .section-heading { align-items: stretch; flex-direction: column; }
  .section-heading .el-button { align-self: flex-start; }
  .path-bar { align-items: stretch; flex-direction: column; }
  .path-bar .el-input { width: 100%; }
  .list-header { display: none; }
  .file-list { border-radius: 10px; }
  .file-row { grid-template-columns: minmax(0, 1fr) auto; }
  .file-row > :nth-child(2), .file-row > :nth-child(3), .file-row > :nth-child(4) { display: none; }
  .cache-list-header { display: none; }
  .cache-list { border-radius: 0 0 10px 10px; }
  .cache-row { grid-template-columns: minmax(0, 1fr) auto; }
  .cache-row > :nth-child(2), .cache-row > :nth-child(3) { display: none; }
}
</style>
