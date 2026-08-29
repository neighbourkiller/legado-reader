<template>
  <div class="book-detail-view" v-loading="isLoadingDetail">
    <!-- 顶部导航 -->
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="handleGoBack">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回</span>
        </el-button>
        <h2 class="page-title">书籍详情</h2>
      </div>
      <div class="header-right" v-if="isOnlineBook">
        <el-button text @click="openSourceDrawer">
          <el-icon><Switch /></el-icon>
          <span>换源 ({{ sourceName }})</span>
        </el-button>
      </div>
    </div>

    <div class="detail-container" v-if="book">
      <!-- 头部书籍基本信息卡片 -->
      <div class="book-info-card">
        <div class="book-cover-wrap">
          <img
            v-if="book.coverUrl"
            :src="book.coverUrl"
            :alt="book.name"
            class="book-cover"
            @error="onCoverError"
          />
          <div v-else class="book-cover placeholder">
            <span>{{ book.name.charAt(0) || '书' }}</span>
          </div>
        </div>

        <div class="book-main-meta">
          <div class="title-row">
            <h1 class="book-name">{{ book.name }}</h1>
            <span class="source-badge" v-if="sourceName">{{ sourceName }}</span>
          </div>

          <div class="meta-row author-row">
            <span class="meta-item author">{{ book.author || '未知作者' }}</span>
            <span class="divider" v-if="book.kind">|</span>
            <span class="meta-item kind" v-if="book.kind">{{ book.kind }}</span>
          </div>

          <div class="meta-row latest-row" v-if="latestChapter">
            <span class="meta-label">最新章节：</span>
            <span class="meta-val latest-title">{{ latestChapter }}</span>
          </div>

          <div class="meta-row progress-row" v-if="inShelf && shelfBook">
            <span class="meta-label">阅读进度：</span>
            <span class="meta-val progress-text">
              第 {{ (shelfBook.currentChapter || 0) + 1 }} 章 / 共 {{ chapters.length || shelfBook.totalChapters || 0 }} 章
              ({{ shelfBook.currentProgress || 0 }}%)
            </span>
          </div>

          <!-- 核心操作按钮栏 -->
          <div class="action-buttons">
            <el-button type="primary" size="large" @click="handleStartReading" :loading="isEnteringReader">
              <el-icon><Reading /></el-icon>
              <span>{{ inShelf && (shelfBook?.currentChapter || 0) > 0 ? '继续阅读' : '开始阅读' }}</span>
            </el-button>

            <el-button
              :type="inShelf ? 'info' : 'success'"
              size="large"
              plain
              @click="handleToggleShelf"
              :loading="isSavingShelf"
            >
              <el-icon><Star /></el-icon>
              <span>{{ inShelf ? '移出书架' : '加入书架' }}</span>
            </el-button>

            <el-button v-if="isOnlineBook" size="large" @click="refreshBookDetail(true)" :loading="isLoadingToc">
              <el-icon><Refresh /></el-icon>
              <span>刷新目录</span>
            </el-button>

            <el-button v-if="isOnlineBook" size="large" @click="openDownloadDialog" :disabled="chapters.length === 0">
              <el-icon><DownloadIcon /></el-icon>
              <span>{{ downloadButtonText }}</span>
            </el-button>
          </div>
        </div>
      </div>

      <!-- 简介区 -->
      <div class="section-card intro-card" v-if="book.intro">
        <div class="section-title">内容简介</div>
        <div class="intro-content" :class="{ collapsed: isIntroCollapsed }">
          {{ book.intro }}
        </div>
        <div class="intro-toggle" v-if="book.intro.length > 120" @click="isIntroCollapsed = !isIntroCollapsed">
          <span>{{ isIntroCollapsed ? '展开全部 ▼' : '收起内容 ▲' }}</span>
        </div>
      </div>

      <!-- 章节目录区 -->
      <div class="section-card toc-card">
        <div class="toc-header">
          <div class="toc-title-wrap">
            <span class="section-title">章节目录</span>
            <span class="toc-count">(共 {{ chapters.length }} 章)</span>
          </div>

          <div class="toc-tools">
            <el-input
              v-model="tocKeyword"
              placeholder="搜索章节名..."
              clearable
              size="small"
              style="width: 180px"
            />
            <el-button size="small" @click="isReverseOrder = !isReverseOrder">
              <el-icon><Sort /></el-icon>
              <span>{{ isReverseOrder ? '倒序' : '正序' }}</span>
            </el-button>
          </div>
        </div>

        <div v-if="isLoadingToc" class="toc-loading">
          <el-skeleton :rows="6" animated />
        </div>

        <div v-else-if="filteredChapters.length === 0" class="toc-empty">
          <el-empty :description="tocEmptyDescription" />
        </div>

        <div v-else class="chapter-grid">
          <div
            v-for="ch in displayChapters"
            :key="ch.index"
            class="chapter-item"
            :class="{ 'is-current': ch.index === shelfBook?.currentChapter }"
            @click="handleReadChapter(ch.index)"
          >
            <span class="chapter-num">{{ ch.index + 1 }}.</span>
            <span class="chapter-name" :title="ch.title">{{ ch.title }}</span>
          </div>
        </div>

        <!-- 目录过多时分页/展开提示 -->
        <div class="toc-expand-more" v-if="!showAllChapters && filteredChapters.length > 100">
          <el-button text type="primary" @click="showAllChapters = true">
            显示全部 {{ filteredChapters.length }} 章节 (当前展示前 100 章)
          </el-button>
        </div>
      </div>
    </div>

    <!-- 换源抽屉 -->
    <el-drawer
      v-if="isOnlineBook"
      v-model="sourceDrawerVisible"
      title="换源检索"
      size="450px"
      destroy-on-close
    >
      <div class="source-drawer-body">
        <div class="drawer-header-info">
          <span>为《{{ book?.name }}》检索其他可用书源</span>
          <el-button text size="small" @click="searchAlternativeSources" :loading="isSearchingSources">
            重新检索
          </el-button>
        </div>

        <div v-if="isSearchingSources" class="source-loading">
          <el-skeleton :rows="4" animated />
        </div>

        <div v-else-if="alternativeSources.length === 0" class="source-empty">
          <el-empty description="未在其他启用的书源中找到同名书籍" />
        </div>

        <div v-else class="source-list">
          <div
            v-for="(alt, index) in alternativeSources"
            :key="index"
            class="source-item"
            :class="{ 'is-active': alt.sourceUrl === book?.sourceUrl }"
            @click="switchSource(alt)"
          >
            <div class="alt-top">
              <span class="alt-source-name">{{ alt.sourceName }}</span>
              <el-tag size="small" v-if="alt.sourceUrl === book?.sourceUrl" type="success">当前源</el-tag>
            </div>
            <div class="alt-title">{{ alt.name }} - <span class="alt-author">{{ alt.author }}</span></div>
            <div class="alt-last" v-if="alt.lastChapter">最新: {{ alt.lastChapter }}</div>
          </div>
        </div>
      </div>
    </el-drawer>

    <NovelDownloadDialog
      v-if="isOnlineBook"
      v-model="downloadDialogVisible"
      :book="book"
      :chapters="chapters"
      :before-start="saveCurrentBookToDB"
      @downloaded-count="downloadedCount = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  Reading,
  Star,
  Refresh,
  Switch,
  Sort,
  Download as DownloadIcon,
} from '@element-plus/icons-vue'
import type { BookMeta, BookChapter, StoredBook } from '@/parsers/types'
import type { BookSource, SearchResult } from '@/source/types/BookSource'
import { useBookshelfStore } from '@/stores/bookshelf'
import { useBookSourceStore } from '@/stores/bookSource'
import { useDownloadStore } from '@/stores/download'
import NovelDownloadDialog from '@/components/NovelDownloadDialog.vue'
import { SourceEngine } from '@/source/engine/SourceEngine'
import { cleanBookTitle, generateBookId } from '@/source/engine/RuleParser'
import { saveBook, getBook, deleteBookFromDB } from '@/storage/db'

const route = useRoute()
const router = useRouter()
const bookshelfStore = useBookshelfStore()
const bookSourceStore = useBookSourceStore()
const downloadStore = useDownloadStore()
const isDesktopBuild = import.meta.env.VITE_APP_TARGET === 'desktop'

const isLoadingDetail = ref(false)
const isLoadingToc = ref(false)
const isEnteringReader = ref(false)
const isSavingShelf = ref(false)
const isIntroCollapsed = ref(true)
const isReverseOrder = ref(false)
const showAllChapters = ref(false)
const tocKeyword = ref('')
const downloadDialogVisible = ref(false)
const downloadedCount = ref(0)

const sourceDrawerVisible = ref(false)
const isSearchingSources = ref(false)
const alternativeSources = ref<SearchResult[]>([])

// 基础书籍元数据
const book = ref<BookMeta | null>(null)
const chapters = ref<BookChapter[]>([])
const tocUrl = ref<string>('')
const latestChapter = ref<string>('')
const isOnlineBook = computed(() => book.value?.format === 'online')
const tocEmptyDescription = computed(() =>
  isOnlineBook.value ? '暂无章节列表或目录拉取失败' : '未能从本地文件解析出章节',
)

const sourceName = computed(() => {
  if (book.value?.format === 'txt') return '本地 TXT'
  if (book.value?.format === 'epub') return '本地 EPUB'
  if (book.value?.sourceName) return book.value.sourceName
  const matched = bookSourceStore.sources.find(s => s.bookSourceUrl === book.value?.sourceUrl)
  return matched?.bookSourceName || '网络书源'
})

// 检查是否已在书架中
const shelfBook = computed(() => {
  if (!book.value) return undefined
  return bookshelfStore.books.find(b => b.id === book.value?.id)
})

const inShelf = computed(() => Boolean(shelfBook.value))
const downloadTask = computed(() => book.value ? downloadStore.getTask(book.value.id) : undefined)
const downloadPercent = computed(() => {
  const task = downloadTask.value
  return task?.total ? Math.round((task.completed / task.total) * 100) : 0
})
const downloadButtonText = computed(() => {
  const task = downloadTask.value
  if (task?.status === 'running') return `下载中 ${downloadPercent.value}%`
  if (downloadedCount.value > 0) return `离线下载 (${downloadedCount.value})`
  return '离线下载'
})

onMounted(async () => {
  const startupTasks = [bookshelfStore.loadBooks()]
  if (isDesktopBuild) startupTasks.push(bookSourceStore.loadSources())
  await Promise.all(startupTasks)

  await initBookFromRoute()
  await refreshDownloadedCount()
})

const refreshDownloadedCount = async () => {
  if (!book.value || !isOnlineBook.value) {
    downloadedCount.value = 0
    return
  }
  downloadedCount.value = await downloadStore.getDownloadedCount(
    book.value.id,
    book.value.sourceUrl,
    chapters.value,
  )
}

const openDownloadDialog = async () => {
  if (!book.value || chapters.value.length === 0) {
    ElMessage.warning('当前没有可下载的章节')
    return
  }
  await refreshDownloadedCount()
  downloadDialogVisible.value = true
}

const initBookFromRoute = async () => {
  const query = route.query
  const state = history.state || {}

  const name = cleanBookTitle(String(query.name || state.name || ''))
  const author = String(query.author || state.author || '')
  const bookUrl = String(query.bookUrl || state.bookUrl || '')
  const coverUrl = String(query.coverUrl || state.coverUrl || '')
  const intro = String(query.intro || state.intro || '')
  const kind = String(query.kind || state.kind || '')
  const lastChapter = String(query.lastChapter || state.lastChapter || '')
  const srcUrl = String(query.sourceUrl || state.sourceUrl || '')
  const srcName = String(query.sourceName || state.sourceName || '')

  if (!name && !query.id) {
    ElMessage.warning('未指定书籍信息')
    router.push('/search')
    return
  }

  const id = query.id ? String(query.id) : generateBookId(name, author, srcUrl)

  // 1. 优先从本地 IndexedDB 缓存加载（Cache-First）
  const existing = await getBook(id)
  if (existing) {
    book.value = existing.meta
    chapters.value = existing.chapters || []
    tocUrl.value = existing.meta.tocUrl || existing.meta.bookUrl || bookUrl
    latestChapter.value = existing.meta.latestChapterTitle
      || chapters.value[chapters.value.length - 1]?.title
      || lastChapter
    // 命中本地缓存，秒开渲染，不发起任何自动网络请求
    if (existing.meta.format === 'online' && chapters.value.length === 0) {
      fetchBookDetailAndToc()
    }
    return
  }

  // 2. 未命中缓存（首次访问）：构造初始元数据并触发网络拉取
  book.value = {
    id,
    name,
    author,
    format: 'online',
    totalChapters: 0,
    currentChapter: 0,
    currentProgress: 0,
    lastReadTime: Date.now(),
    coverUrl,
    intro,
    kind,
    sourceUrl: srcUrl,
    sourceName: srcName,
    bookUrl,
    tocUrl: bookUrl,
    latestChapterTitle: lastChapter,
  }
  tocUrl.value = bookUrl
  latestChapter.value = lastChapter

  // 首次异步获取详情与目录，并自动存入本地缓存
  fetchBookDetailAndToc()
}

const fetchBookDetailAndToc = async () => {
  if (!book.value?.sourceUrl || !book.value?.bookUrl) return

  const source = bookSourceStore.sources.find(s => s.bookSourceUrl === book.value?.sourceUrl)
  if (!source) return

  isLoadingDetail.value = true
  const engine = new SourceEngine()

  // 1. 获取书籍详情（刷新高清封面、纯净书名、作者、完整简介及目录URL）
  try {
    const info = await engine.getBookInfo(source, book.value.bookUrl)
    if (info.name) {
      book.value.name = cleanBookTitle(info.name)
    }
    if (info.author && (!book.value.author || book.value.author === '未知作者')) {
      book.value.author = info.author
    }
    if (info.coverUrl) {
      book.value.coverUrl = info.coverUrl
    }
    if (info.intro && (!book.value.intro || book.value.intro.length < info.intro.length)) {
      book.value.intro = info.intro
    }
    if (info.tocUrl) {
      tocUrl.value = info.tocUrl
    }
  } catch (e) {
    console.warn('获取详情页失败，降级使用基础元数据:', e)
  } finally {
    isLoadingDetail.value = false
  }

  // 2. 拉取目录
  await fetchToc(false)
  if (inShelf.value) {
    await saveCurrentBookToDB()
  }
}

const refreshBookDetail = async (showToast = true) => {
  if (!book.value?.sourceUrl || !book.value?.bookUrl) return

  const source = bookSourceStore.sources.find(s => s.bookSourceUrl === book.value?.sourceUrl)
  if (!source) {
    ElMessage.warning('对应书源未找到或已被禁用')
    return
  }

  isLoadingToc.value = true
  const engine = new SourceEngine()

  try {
    // 1. 刷新详情页（高清封面、简介、标题）
    try {
      const info = await engine.getBookInfo(source, book.value.bookUrl)
      if (info.name) book.value.name = cleanBookTitle(info.name)
      if (info.author && (!book.value.author || book.value.author === '未知作者')) book.value.author = info.author
      if (info.coverUrl) book.value.coverUrl = info.coverUrl
      if (info.intro) book.value.intro = info.intro
      if (info.tocUrl) tocUrl.value = info.tocUrl
    } catch (e) {
      console.warn('刷新详情页失败:', e)
    }

    // 2. 刷新目录
    const targetTocUrl = tocUrl.value || book.value.bookUrl
    const rawChapters = await engine.getToc(source, targetTocUrl)
    if (rawChapters && rawChapters.length > 0) {
      chapters.value = rawChapters.map((ch, idx) => ({
        index: idx,
        title: ch.name,
        href: ch.url,
        isVolume: ch.isVolume,
        isVip: ch.isVip,
        isPay: ch.isPay,
        updateTime: ch.updateTime,
        contentType: source.bookSourceType === 2 ? 'images' : 'text',
      }))
      book.value.totalChapters = chapters.value.length
      latestChapter.value = chapters.value[chapters.value.length - 1].title
      book.value.latestChapterTitle = latestChapter.value

      // 保存至本地数据库缓存（仅在已加入书架时同步）
      if (inShelf.value) {
        await saveCurrentBookToDB()
      }

      if (showToast) {
        ElMessage.success(`刷新成功，共 ${chapters.value.length} 章 (最新: ${latestChapter.value})`)
      }
    } else if (showToast) {
      ElMessage.warning('未能获取到章节列表')
    }
  } catch (err: any) {
    console.error('刷新失败:', err)
    if (showToast) {
      ElMessage.error(`刷新失败: ${err.message || err}`)
    }
  } finally {
    isLoadingToc.value = false
  }
}

const fetchToc = async (showToast = false) => {
  if (!book.value?.sourceUrl) return

  const source = bookSourceStore.sources.find(s => s.bookSourceUrl === book.value?.sourceUrl)
  if (!source) {
    ElMessage.warning('对应书源未找到或已被禁用')
    return
  }

  const targetTocUrl = tocUrl.value || book.value.bookUrl
  if (!targetTocUrl) return

  isLoadingToc.value = true
  const engine = new SourceEngine()

  try {
    const rawChapters = await engine.getToc(source, targetTocUrl)
    if (rawChapters && rawChapters.length > 0) {
      chapters.value = rawChapters.map((ch, idx) => ({
        index: idx,
        title: ch.name,
        href: ch.url,
        isVolume: ch.isVolume,
        isVip: ch.isVip,
        isPay: ch.isPay,
        updateTime: ch.updateTime,
        contentType: source.bookSourceType === 2 ? 'images' : 'text',
      }))
      book.value.totalChapters = chapters.value.length
      latestChapter.value = chapters.value[chapters.value.length - 1].title
      book.value.latestChapterTitle = latestChapter.value

      // 同步更新数据库记录
      if (inShelf.value) {
        await saveCurrentBookToDB()
      }

      if (showToast) {
        ElMessage.success(`目录刷新成功，共 ${chapters.value.length} 章`)
      }
    } else {
      if (showToast) {
        ElMessage.warning('未能获取到章节列表')
      }
    }
  } catch (err: any) {
    console.error('拉取目录失败:', err)
    if (showToast) {
      ElMessage.error(`目录拉取失败: ${err.message || err}`)
    }
  } finally {
    isLoadingToc.value = false
  }
}

// 目录过滤与排序
const filteredChapters = computed(() => {
  let list = [...chapters.value]
  if (isReverseOrder.value) {
    list.reverse()
  }
  const kw = tocKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(ch => ch.title.toLowerCase().includes(kw))
  }
  return list
})

const displayChapters = computed(() => {
  if (showAllChapters.value || filteredChapters.value.length <= 100) {
    return filteredChapters.value
  }
  return filteredChapters.value.slice(0, 100)
})

// 保存当前网络书籍到本地数据库
const saveCurrentBookToDB = async (inShelfOverride?: boolean) => {
  if (!book.value) return
  const existing = await getBook(book.value.id)
  const isBookInShelf = inShelfOverride !== undefined
    ? inShelfOverride
    : (inShelf.value || existing?.meta?.inShelf === true || book.value.inShelf === true)

  book.value.inShelf = isBookInShelf

  const record: StoredBook = {
    meta: {
      ...book.value,
      inShelf: isBookInShelf,
      totalChapters: chapters.value.length,
      tocUrl: tocUrl.value || book.value.bookUrl,
      latestChapterTitle: latestChapter.value,
    },
    chapters: chapters.value,
    // 本地 TXT/EPUB 的原始二进制必须保留，否则从详情页进入阅读会破坏书籍。
    fileData: existing?.fileData ?? null,
  }
  await saveBook(record)
  await bookshelfStore.loadBooks()
}

// 开始 / 继续阅读
const handleStartReading = async () => {
  if (!book.value) return
  isEnteringReader.value = true

  try {
    await saveCurrentBookToDB()
    router.push(`/reader/${book.value.id}`)
  } catch (err: any) {
    ElMessage.error(`进入阅读失败: ${err.message || err}`)
  } finally {
    isEnteringReader.value = false
  }
}

// 点击具体章节开始阅读
const handleReadChapter = async (chapterIndex: number) => {
  if (!book.value) return
  try {
    book.value.currentChapter = chapterIndex
    await saveCurrentBookToDB()
    router.push(`/reader/${book.value.id}`)
  } catch (err: any) {
    ElMessage.error(`进入章节失败: ${err.message || err}`)
  }
}

// 加入 / 移出书架
const handleToggleShelf = async () => {
  if (!book.value) return
  isSavingShelf.value = true

  try {
    if (inShelf.value) {
      await deleteBookFromDB(book.value.id)
      book.value.inShelf = false
      downloadedCount.value = 0
      await bookshelfStore.loadBooks()
      ElMessage.success('已从书架移出')
      if (!isOnlineBook.value) {
        router.push('/bookshelf')
        return
      }
    } else {
      await saveCurrentBookToDB(true)
      ElMessage.success('已加入书架')
    }
  } catch (err: any) {
    ElMessage.error(`操作失败: ${err.message || err}`)
  } finally {
    isSavingShelf.value = false
  }
}

// 换源检索
const openSourceDrawer = () => {
  sourceDrawerVisible.value = true
  if (alternativeSources.value.length === 0) {
    searchAlternativeSources()
  }
}

const searchAlternativeSources = async () => {
  if (!book.value) return
  isSearchingSources.value = true
  alternativeSources.value = []

  try {
    const engine = new SourceEngine()
    const sources = bookSourceStore.getEnabledSources()
    const kw = book.value.name

    const promises = sources.map(s =>
      engine.search(s, kw).catch(() => [] as SearchResult[])
    )

    const all = await Promise.allSettled(promises)
    const list: SearchResult[] = []

    for (const res of all) {
      if (res.status === 'fulfilled') {
        list.push(...res.value)
      }
    }

    // 优先过滤出书名完全一致或高匹配度的
    alternativeSources.value = list.filter(item =>
      item.name.includes(book.value!.name) || book.value!.name.includes(item.name)
    )
  } catch (err) {
    console.error('换源检索失败:', err)
  } finally {
    isSearchingSources.value = false
  }
}

// 切换到另一个书源
const switchSource = async (alt: SearchResult) => {
  if (!book.value || !alt.sourceUrl) return
  book.value.sourceUrl = alt.sourceUrl
  book.value.sourceName = alt.sourceName
  book.value.bookUrl = alt.bookUrl
  tocUrl.value = alt.bookUrl
  if (alt.coverUrl && !book.value.coverUrl) book.value.coverUrl = alt.coverUrl
  if (alt.intro && !book.value.intro) book.value.intro = alt.intro
  if (alt.lastChapter) latestChapter.value = alt.lastChapter

  sourceDrawerVisible.value = false
  ElMessage.success(`已切换至书源：${alt.sourceName}`)
  await fetchToc(true)
  await refreshDownloadedCount()
}

const handleGoBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push(isOnlineBook.value && isDesktopBuild ? '/search' : '/bookshelf')
  }
}

const onCoverError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.book-detail-view {
  min-height: 100vh;
  background-color: var(--el-bg-color);
  padding: 20px 40px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.detail-container {
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 头部卡片 */
.book-info-card {
  display: flex;
  gap: 24px;
  padding: 24px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.book-cover-wrap {
  width: 120px;
  height: 168px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: var(--el-fill-color);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
}

.book-main-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.book-name {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.source-badge {
  font-size: 12px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.meta-row {
  font-size: 13px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.author-row {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.author-row .author {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.author-row .divider {
  color: var(--el-border-color);
}

.meta-label {
  color: var(--el-text-color-secondary);
}

.latest-title {
  color: var(--el-color-primary);
  font-weight: 500;
}

.progress-text {
  color: var(--el-color-success);
  font-weight: 600;
}

.action-buttons {
  display: flex;
  gap: 14px;
  margin-top: 16px;
  flex-wrap: wrap;
}

/* 通用内容卡片 */
.section-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  padding: 20px 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

/* 简介区 */
.intro-content {
  font-size: 14px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
  white-space: pre-line;
  transition: all 0.3s ease;
}

.intro-content.collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.intro-toggle {
  margin-top: 8px;
  font-size: 13px;
  color: var(--el-color-primary);
  cursor: pointer;
  user-select: none;
}

/* 目录区 */
.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.toc-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.toc-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.toc-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.chapter-item {
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
  overflow: hidden;
}

.chapter-item:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
}

.chapter-item.is-current {
  background: var(--el-color-primary);
  color: #fff;
  font-weight: 600;
}

.chapter-num {
  font-size: 11px;
  opacity: 0.7;
  flex-shrink: 0;
}

.chapter-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-expand-more {
  text-align: center;
  margin-top: 16px;
}

/* 换源抽屉 */
.drawer-header-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 16px;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-item {
  padding: 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.source-item:hover {
  border-color: var(--el-color-primary);
}

.source-item.is-active {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.alt-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.alt-source-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.alt-title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.alt-author {
  color: var(--el-text-color-secondary);
}

.alt-last {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media screen and (max-width: 768px) {
  .book-detail-view {
    padding: 16px 20px;
  }

  .book-info-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .title-row,
  .meta-row {
    justify-content: center;
  }

  .action-buttons {
    justify-content: center;
  }

  .chapter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
