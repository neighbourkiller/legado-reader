<template>
  <div
    class="chapter-wrapper"
    :style="bodyTheme"
    :class="{ night: isNight, day: !isNight }"
    @click="handleWrapperClick"
  >
    <!-- 左侧经典浮动工具栏 -->
    <div class="tool-bar" :style="leftBarTheme" @click.stop>
      <div class="tools">
        <!-- 目录 -->
        <el-popover
          placement="right"
          :width="popupWidth"
          trigger="click"
          :show-arrow="false"
          v-model:visible="popCataVisible"
          popper-class="pop-cata"
        >
          <PopCatalog @getContent="getContent" class="popup" />
          <template #reference>
            <div class="tool-icon">
              <div class="iconfont">&#58905;</div>
              <div class="icon-text">目录</div>
            </div>
          </template>
        </el-popover>

        <!-- 设置 -->
        <el-popover
          placement="right"
          :width="popupWidth"
          trigger="click"
          :show-arrow="false"
          v-model:visible="readSettingsVisible"
          popper-class="pop-setting"
        >
          <ReadSettings class="popup" />
          <template #reference>
            <div class="tool-icon">
              <div class="iconfont">&#58971;</div>
              <div class="icon-text">设置</div>
            </div>
          </template>
        </el-popover>

        <!-- 书架 -->
        <div class="tool-icon" @click="toShelf">
          <div class="iconfont">&#58892;</div>
          <div class="icon-text">书架</div>
        </div>

        <!-- 书籍详情 -->
        <div v-if="supportsBookDetail" class="tool-icon" @click="toBookDetail">
          <el-icon class="action-icon"><DetailIcon /></el-icon>
          <div class="icon-text">详情</div>
        </div>

        <!-- 刷新当前章节正文 -->
        <div
          class="tool-icon"
          :class="{ 'no-point': chapterLoading }"
          title="重新请求并覆盖本章缓存"
          @click="refreshCurrentChapter"
        >
          <el-icon class="action-icon"><RefreshIcon /></el-icon>
          <div class="icon-text">刷新</div>
        </div>

        <!-- 离线下载 -->
        <div
          class="tool-icon"
          :class="{ 'no-point': currentBook?.format !== 'online' }"
          title="下载章节供离线阅读"
          @click="downloadDialogVisible = true"
        >
          <el-icon class="action-icon"><DownloadIcon /></el-icon>
          <div class="icon-text">下载</div>
        </div>

        <!-- 全屏 -->
        <div class="tool-icon" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏 (F11/ESC)' : '全屏阅读 (F11)'">
          <div class="iconfont">&#58907;</div>
          <div class="icon-text">{{ isFullscreen ? '退出' : '全屏' }}</div>
        </div>

        <!-- 顶部 -->
        <div class="tool-icon" @click="toTop">
          <div class="iconfont">&#58914;</div>
          <div class="icon-text">顶部</div>
        </div>

        <!-- 底部 -->
        <div class="tool-icon" @click="toBottom">
          <div class="iconfont">&#58915;</div>
          <div class="icon-text">底部</div>
        </div>
      </div>
    </div>

    <!-- 紧贴正文右侧的书签按钮 -->
    <div v-if="supportsBookDetail" class="bookmark-bar" :style="rightBarTheme" @click.stop>
      <div
        class="tool-icon"
        :class="{ active: isCurrentPositionBookmarked }"
        title="查看本书书签"
        @click="openBookmarksDrawer"
      >
        <el-icon class="action-icon"><BookmarkIcon /></el-icon>
        <div class="icon-text">书签</div>
      </div>
    </div>

    <!-- 右侧经典浮动工具栏 -->
    <div class="read-bar" :style="rightBarTheme" @click.stop>
      <div class="tools">
        <div
          class="tool-icon"
          :class="{ 'no-point': isFirstChapter }"
          @click="toPreChapter"
        >
          <div class="iconfont">&#58920;</div>
          <span v-if="miniInterface">上一章</span>
        </div>
        <div
          class="tool-icon"
          :class="{ 'no-point': isLastChapter }"
          @click="toNextChapter"
        >
          <span v-if="miniInterface">下一章</span>
          <div class="iconfont">&#58913;</div>
        </div>
      </div>
    </div>

    <!-- 正文阅读区域 -->
    <div class="chapter" ref="contentRef" :style="chapterTheme">
      <div class="content">
        <div class="top-bar" ref="topRef"></div>

        <div
          v-for="data in chapterData"
          :key="data.index"
          :data-chapter-index="data.index"
        >
          <ChapterContent
            :key="`${data.index}:${renderRevision}`"
            :contents="data.content"
            :title="data.title"
            :format="data.format"
            :spacing="settings.spacing"
            :fontSize="fontSizeStr"
            :fontFamily="fontFamilyStr"
            :chapterIndex="data.index"
            :highlights="highlightsForChapter(data.index)"
            @highlight-click="openHighlightEditor"
          />
        </div>

        <!-- 触底无限加载指示器 -->
        <div class="loading" ref="loadingRef" v-if="infiniteLoading"></div>
        <div class="bottom-bar" ref="bottomRef"></div>
      </div>
    </div>

    <NovelDownloadDialog
      v-model="downloadDialogVisible"
      :book="currentBook"
      :chapters="chapters"
    />

    <ReaderBookmarksDrawer
      v-model="bookmarkDrawerVisible"
      :bookmarks="currentBookBookmarks"
      :highlights="currentBookHighlights"
      :loading="bookmarksLoading"
      :saving="bookmarkSaving"
      :current-position-bookmarked="isCurrentPositionBookmarked"
      @toggle-current="toggleCurrentBookmark"
      @jump="jumpToBookmark"
      @delete="removeBookmarkFromDrawer"
      @highlight-jump="jumpToHighlight"
      @highlight-edit="openHighlightEditor"
      @highlight-delete="removeHighlight"
    />

    <ReaderSelectionMenu
      v-if="selectionSnapshot"
      class="reader-selection-menu"
      :left="selectionMenuPosition.left"
      :top="selectionMenuPosition.top"
      :placement="selectionMenuPosition.placement"
      :selected-style="appSettings.lastHighlightStyle"
      :anchored-actions-disabled="!selectionSnapshot.anchor"
      @replace="openReplaceDialog"
      @copy="copySelection"
      @bookmark="bookmarkSelection"
      @highlight="highlightSelection"
      @browser="searchSelection"
    />

    <ReplaceRuleDialog
      v-model="replaceDialogVisible"
      :selection-text="pendingSelectionText"
      :book-name="currentBook?.name"
      :source-url="currentBook?.sourceUrl"
      @saved="handleReplaceRuleSaved"
    />

    <HighlightEditDialog
      v-model="highlightEditVisible"
      :highlight="editingHighlight"
      @save="saveHighlightEdit"
      @delete="editingHighlight && removeHighlight(editingHighlight)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document as DetailIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  CollectionTag as BookmarkIcon,
} from '@element-plus/icons-vue'
import { useReadingStore, type ChapterPayload } from '@/stores/reading'
import { useFullscreen } from '@/composables/useFullscreen'
import PopCatalog from '@/components/PopCatalog.vue'
import ReadSettings from '@/components/ReadSettings.vue'
import ChapterContent from '@/components/ChapterContent.vue'
import NovelDownloadDialog from '@/components/NovelDownloadDialog.vue'
import ReaderBookmarksDrawer from '@/components/ReaderBookmarksDrawer.vue'
import ReaderSelectionMenu from '@/components/ReaderSelectionMenu.vue'
import ReplaceRuleDialog from '@/components/ReplaceRuleDialog.vue'
import HighlightEditDialog from '@/components/HighlightEditDialog.vue'
import themeConfig from '@/config/themeConfig'
import jump from '@/plugins/jump'
import { trimChapterWindowBeforeAppend } from '@/utils/chapterWindow'
import {
  addReadingTime,
  deleteBookmark,
  getBookmarksByBookId,
  getBookmarkAt,
  getAllReplaceRules,
  getHighlightsByBookId,
  saveBookmark,
  saveHighlight,
  saveReplaceRule,
  deleteHighlight,
} from '@/storage/db'
import type {
  BookmarkRecord,
  HighlightRecord,
  HighlightStyleRecord,
  ReplaceRuleRecord,
} from '@/storage/db'
import { characterOffsetToParagraphIndex } from '@/backup/compat'
import { useAppSettingsStore } from '@/stores/appSettings'
import { captureReaderSelection, findTextRange, resolveTextAnchor } from '@/utils/textSelection'
import type { ReaderSelectionSnapshot } from '@/utils/textSelection'
import { applyRulesToChapter, ReplacementTimeoutError } from '@/utils/replaceRules'
import { openExternalUrl } from '@/platform/externalBrowser'
import '@/assets/fonts/iconfont.css'

const route = useRoute()
const router = useRouter()
const store = useReadingStore()
const appSettings = useAppSettingsStore()
const { isFullscreen, toggleFullscreen } = useFullscreen()

const {
  currentBook,
  chapters,
  settings,
  miniInterface,
  popCataVisible,
  readSettingsVisible,
} = storeToRefs(store)

const chapterData = ref<ChapterPayload[]>([])
const rawChapterData = ref<ChapterPayload[]>([])
const chapterLoading = ref(false)
const showToolBar = ref(false)
const downloadDialogVisible = ref(false)
const bookmarkDrawerVisible = ref(false)
const bookmarkSaving = ref(false)
const bookmarksLoading = ref(false)
const currentBookBookmarks = ref<BookmarkRecord[]>([])
const currentBookHighlights = ref<HighlightRecord[]>([])
const replaceRules = ref<ReplaceRuleRecord[]>([])
const renderRevision = ref(0)
const selectionSnapshot = ref<ReaderSelectionSnapshot | null>(null)
const selectionMenuPosition = ref<{ left: number; top: number; placement: 'above' | 'below' }>({
  left: 0,
  top: 0,
  placement: 'above',
})
const replaceDialogVisible = ref(false)
const pendingSelectionText = ref('')
const highlightEditVisible = ref(false)
const editingHighlight = ref<HighlightRecord | null>(null)
const bookmarkDrawerPosition = ref<ReadingPosition | null>(null)
const currentPositionKey = ref('')
const bookmarkedPositionKey = ref('')
const supportsBookDetail = import.meta.env.VITE_APP_TARGET === 'desktop'
let contentGeneration = 0
let scrollObserver: IntersectionObserver | null = null

const topRef = ref<HTMLElement>()
const bottomRef = ref<HTMLElement>()
const loadingRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
let readingSessionStartedAt = 0

// 章节状态
const currentChapterIndex = computed(() => currentBook.value?.currentChapter ?? 0)
const isFirstChapter = computed(() => currentChapterIndex.value <= 0)
const isLastChapter = computed(
  () => currentChapterIndex.value >= (chapters.value.length || 1) - 1
)

// 主题与颜色计算 (theme === 6 为夜间模式)
const isNight = computed(() => settings.value.theme === 6)
const bodyColor = computed(
  () => themeConfig.themes[settings.value.theme]?.body || '#ede7da'
)
const chapterColor = computed(
  () => themeConfig.themes[settings.value.theme]?.content || '#ede7da'
)
const popupColor = computed(
  () => themeConfig.themes[settings.value.theme]?.popup || '#ede7da'
)

// 响应式宽度与样式
const readWidth = computed(() => {
  if (!miniInterface.value) {
    return (settings.value.readWidth || 800) + 'px'
  } else {
    return '100%'
  }
})

const popupWidth = computed(() => {
  if (!miniInterface.value) {
    return (settings.value.readWidth || 800) - 33
  } else {
    return window.innerWidth - 33
  }
})

const bodyTheme = computed(() => ({
  background: bodyColor.value,
}))

const chapterTheme = computed(() => ({
  background: chapterColor.value,
  width: readWidth.value,
}))

// 左侧工具栏贴紧正文左边缘
const leftBarTheme = computed(() => ({
  background: popupColor.value,
  marginLeft: miniInterface.value
    ? '0'
    : -((settings.value.readWidth || 800) / 2 + 60) + 'px',
  display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}))

// 右侧工具栏贴紧正文右边缘
const rightBarTheme = computed(() => ({
  background: popupColor.value,
  marginRight: miniInterface.value
    ? '0'
    : -((settings.value.readWidth || 800) / 2 + 44) + 'px',
  display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}))

// 常用字体多变体与别名映射表（兼顾英文名、中文名、GB版、屏幕版等系统安装差异）
const FONT_ALIAS_MAP: Record<string, string[]> = {
  'lxgw wenkai screen': [
    'LXGW WenKai Screen',
    'LXGW WenKai GB Screen',
    '霞鹜文楷 屏幕阅读版',
    '霞鹜文楷 GB 屏幕阅读版',
    'LXGW WenKai',
    'LXGW WenKai GB',
    '霞鹜文楷',
  ],
  'lxgw wenkai': [
    'LXGW WenKai',
    'LXGW WenKai GB',
    '霞鹜文楷',
    '霞鹜文楷 GB',
    'LXGW WenKai Screen',
    'LXGW WenKai GB Screen',
    '霞鹜文楷 屏幕阅读版',
    '霞鹜文楷 GB 屏幕阅读版',
  ],
  '霞鹜文楷': [
    '霞鹜文楷 GB 屏幕阅读版',
    '霞鹜文楷 屏幕阅读版',
    '霞鹜文楷',
    'LXGW WenKai GB Screen',
    'LXGW WenKai Screen',
    'LXGW WenKai',
  ],
  'pingfang sc': ['PingFang SC', 'PingFangSC-Regular', '苹方-简', '苹方'],
  'microsoft yahei': ['Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI'],
  'source han sans': ['Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', '思源黑体'],
  'source han serif': ['Source Han Serif SC', 'Source Han Serif CN', 'Noto Serif CJK SC', 'Noto Serif SC', '思源宋体'],
  'kaiti': ['KaiTi', '楷体', 'STKaiti', '华文楷体', 'Kaiti SC', 'AR PL UKai CN'],
  'simsun': ['SimSun', '宋体', 'STSong', '华文宋体', 'Songti SC', 'NSimSun'],
}

// 字体与字号
const fontFamilyStr = computed(() => {
  if (settings.value.font >= 0) {
    return themeConfig.fonts[settings.value.font] || 'Microsoft YaHei, sans-serif'
  }
  const custom = settings.value.customFontName?.trim()
  if (!custom) {
    return 'Microsoft YaHei, sans-serif'
  }

  const lower = custom.toLowerCase()
  let matchedAliases: string[] = []

  for (const [key, aliases] of Object.entries(FONT_ALIAS_MAP)) {
    if (lower === key || lower.includes(key) || aliases.some(a => a.toLowerCase() === lower)) {
      matchedAliases = aliases
      break
    }
  }

  if (matchedAliases.length > 0) {
    const list = Array.from(new Set([custom, ...matchedAliases]))
    return list.map(f => `"${f}"`).join(', ') + ', PingFangSC-Regular, "Microsoft YaHei", sans-serif'
  }

  return `"${custom}", PingFangSC-Regular, "Microsoft YaHei", sans-serif`
})

const fontSizeStr = computed(() => `${settings.value.fontSize || 18}px`)

const infiniteLoading = computed(() => settings.value.infiniteLoading)
const isCurrentPositionBookmarked = computed(
  () => currentPositionKey.value !== '' && currentPositionKey.value === bookmarkedPositionKey.value,
)

interface ReadingPosition {
  chapterIndex: number
  chapterPos: number
  content: string
}

const findReadingPosition = (): ReadingPosition | null => {
  const elements = document.elementsFromPoint(
    window.innerWidth / 2,
    Math.min(180, Math.max(80, window.innerHeight / 4)),
  )
  const readingElement = elements.find(element => element.closest('[data-chapter-index]'))
  const chapterElement = readingElement?.closest<HTMLElement>('[data-chapter-index]')
  if (!chapterElement) return null

  const chapterIndex = Number(chapterElement.dataset.chapterIndex)
  if (!Number.isInteger(chapterIndex)) return null

  const positionElement = readingElement?.closest<HTMLElement>('[data-chapterpos]')
  const rawPosition = Number(positionElement?.dataset.chapterpos)
  const chapterPos = Number.isInteger(rawPosition) ? rawPosition : 0
  const content = (positionElement?.innerText || readingElement?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)

  return { chapterIndex, chapterPos, content }
}

const syncBookmarkState = async (position: ReadingPosition | null = findReadingPosition()) => {
  if (!position || !currentBook.value) return
  const key = `${currentBook.value.id}:${position.chapterIndex}:${position.chapterPos}`
  if (key === currentPositionKey.value) return

  currentPositionKey.value = key
  const bookmark = await getBookmarkAt(
    currentBook.value.id,
    position.chapterIndex,
    position.chapterPos,
  ).catch(() => undefined)
  if (currentPositionKey.value === key) {
    bookmarkedPositionKey.value = bookmark ? key : ''
  }
}

const loadCurrentBookBookmarks = async () => {
  if (!currentBook.value) return
  bookmarksLoading.value = true
  try {
    currentBookBookmarks.value = await getBookmarksByBookId(currentBook.value.id)
  } catch (error) {
    console.error('读取本书书签失败', error)
    ElMessage.error('读取本书书签失败')
  } finally {
    bookmarksLoading.value = false
  }
}

const loadCurrentBookHighlights = async () => {
  if (!currentBook.value) return
  try {
    currentBookHighlights.value = await getHighlightsByBookId(currentBook.value.id)
    renderRevision.value += 1
  } catch (error) {
    console.error('读取本书标注失败', error)
    ElMessage.error('读取本书标注失败')
  }
}

const highlightsForChapter = (chapterIndex: number) =>
  currentBookHighlights.value.filter(item => item.chapterIndex === chapterIndex)

const openBookmarksDrawer = async () => {
  const position = findReadingPosition()
  bookmarkDrawerPosition.value = position
  bookmarkDrawerVisible.value = true
  if (position) await syncBookmarkState(position)
  await loadCurrentBookBookmarks()
  await loadCurrentBookHighlights()
}

const toggleBookmark = async (position: ReadingPosition | null) => {
  if (bookmarkSaving.value || !currentBook.value) return
  if (!position) {
    ElMessage.warning('暂时无法确定当前阅读位置')
    return
  }

  bookmarkSaving.value = true
  try {
    const existing = await getBookmarkAt(
      currentBook.value.id,
      position.chapterIndex,
      position.chapterPos,
    )
    const key = `${currentBook.value.id}:${position.chapterIndex}:${position.chapterPos}`
    currentPositionKey.value = key

    if (existing) {
      await deleteBookmark(existing.id)
      bookmarkedPositionKey.value = ''
      ElMessage.success('书签已删除')
    } else {
      const chapterTitle = chapters.value[position.chapterIndex]?.title || `第${position.chapterIndex + 1}章`
      await saveBookmark({
        id: key,
        bookId: currentBook.value.id,
        bookName: currentBook.value.name,
        bookAuthor: currentBook.value.author,
        chapterIndex: position.chapterIndex,
        chapterPos: position.chapterPos,
        chapterTitle,
        content: position.content || chapterTitle,
        startOffset: 0,
        endOffset: 0,
        createdAt: Date.now(),
      })
      bookmarkedPositionKey.value = key
      ElMessage.success('书签已添加')
    }
    await loadCurrentBookBookmarks()
  } catch (error) {
    console.error('保存书签失败', error)
    ElMessage.error('书签操作失败')
  } finally {
    bookmarkSaving.value = false
  }
}

const toggleCurrentBookmark = () => toggleBookmark(bookmarkDrawerPosition.value)

const removeBookmarkFromDrawer = async (bookmark: BookmarkRecord) => {
  try {
    await ElMessageBox.confirm(`确定删除“${bookmark.chapterTitle}”的这条书签吗？`, '删除书签', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteBookmark(bookmark.id)
    currentBookBookmarks.value = currentBookBookmarks.value.filter(item => item.id !== bookmark.id)
    if (bookmarkedPositionKey.value === bookmark.id) bookmarkedPositionKey.value = ''
    ElMessage.success('书签已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('删除书签失败', error)
      ElMessage.error('删除书签失败')
    }
  }
}

const jumpToBookmark = async (bookmark: BookmarkRecord) => {
  bookmarkDrawerVisible.value = false
  if (!chapterData.value.some(chapter => chapter.index === bookmark.chapterIndex)) {
    const loaded = await getContent(bookmark.chapterIndex, true)
    if (!loaded) return
  }
  await nextTick()
  const target = document.querySelector<HTMLElement>(
    `[data-chapter-index="${bookmark.chapterIndex}"] [data-chapterpos="${bookmark.chapterPos}"]`,
  )
  if (!target) {
    ElMessage.warning('暂时无法定位到该书签')
    return
  }
  const body = document.querySelector<HTMLElement>(
    `[data-chapter-index="${bookmark.chapterIndex}"] [data-reader-body]`,
  )
  const hasPreciseAnchor = (bookmark.endOffset || 0) > (bookmark.startOffset || 0)
  const resolvedAnchor = body && hasPreciseAnchor
    ? resolveTextAnchor(body.textContent || '', bookmark.content, bookmark.startOffset || 0)
    : null
  if (hasPreciseAnchor && !resolvedAnchor) {
    ElMessage.warning('该书签受正文替换影响，当前无法定位')
    return
  }
  const exactRange = body && resolvedAnchor
    ? findTextRange(body, resolvedAnchor.startOffset, resolvedAnchor.endOffset)
    : null
  const exactTarget = exactRange?.startContainer.parentElement || target
  jump(exactTarget, { duration: 0 })
  await store.saveProgress(bookmark.chapterIndex, bookmark.chapterPos).catch(console.error)
  currentPositionKey.value = bookmark.id
  bookmarkedPositionKey.value = bookmark.id
  bookmarkDrawerPosition.value = {
    chapterIndex: bookmark.chapterIndex,
    chapterPos: bookmark.chapterPos,
    content: bookmark.content,
  }
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      chapter: String(bookmark.chapterIndex),
      pos: String(bookmark.chapterPos),
    },
  }).catch(console.error)
}

const chapterBody = (chapterIndex: number) => document.querySelector<HTMLElement>(
  `[data-chapter-index="${chapterIndex}"] [data-reader-body]`,
)

const resolvedHighlightRange = (highlight: HighlightRecord): Range | null => {
  const body = chapterBody(highlight.chapterIndex)
  if (!body) return null
  const fullText = body.textContent || ''
  const resolved = resolveTextAnchor(fullText, highlight.text, highlight.startOffset)
  return resolved ? findTextRange(body, resolved.startOffset, resolved.endOffset) : null
}

const jumpToHighlight = async (highlight: HighlightRecord) => {
  bookmarkDrawerVisible.value = false
  if (!chapterData.value.some(chapter => chapter.index === highlight.chapterIndex)) {
    const loaded = await getContent(highlight.chapterIndex, true)
    if (!loaded) return
  }
  await nextTick()
  const range = resolvedHighlightRange(highlight)
  if (!range) {
    ElMessage.warning('该标注受正文替换影响，当前无法定位')
    return
  }
  const target = range.startContainer.parentElement
  if (target) jump(target, { duration: 0 })
  await store.saveProgress(highlight.chapterIndex, highlight.startParagraph).catch(console.error)
}

const openHighlightEditor = (highlight: HighlightRecord) => {
  editingHighlight.value = highlight
  highlightEditVisible.value = true
}

const saveHighlightEdit = async (style: HighlightStyleRecord, note: string) => {
  if (!editingHighlight.value) return
  const updated = { ...editingHighlight.value, style, note }
  await saveHighlight(updated)
  currentBookHighlights.value = currentBookHighlights.value.map(item =>
    item.id === updated.id ? updated : item,
  )
  appSettings.setLastHighlightStyle(style)
  highlightEditVisible.value = false
  editingHighlight.value = null
  renderRevision.value += 1
  ElMessage.success('标注已更新')
}

const removeHighlight = async (highlight: HighlightRecord) => {
  try {
    await ElMessageBox.confirm('确定删除这条标注吗？', '删除标注', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteHighlight(highlight.id)
    currentBookHighlights.value = currentBookHighlights.value.filter(item => item.id !== highlight.id)
    highlightEditVisible.value = false
    editingHighlight.value = null
    renderRevision.value += 1
    ElMessage.success('标注已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('删除标注失败', error)
      ElMessage.error('删除标注失败')
    }
  }
}

const clearSelectionMenu = (clearNativeSelection = true) => {
  selectionSnapshot.value = null
  if (clearNativeSelection) window.getSelection()?.removeAllRanges()
}

const showSelectionMenu = () => {
  if (!supportsBookDetail || replaceDialogVisible.value || highlightEditVisible.value) return
  const snapshot = captureReaderSelection(window.getSelection())
  if (!snapshot) {
    selectionSnapshot.value = null
    return
  }
  const menuWidth = 322
  const left = Math.min(window.innerWidth - menuWidth / 2 - 8, Math.max(menuWidth / 2 + 8, snapshot.rect.left + snapshot.rect.width / 2))
  const showAbove = snapshot.rect.top >= 58
  selectionMenuPosition.value = {
    left,
    top: showAbove ? snapshot.rect.top - 8 : snapshot.rect.bottom + 8,
    placement: showAbove ? 'above' : 'below',
  }
  selectionSnapshot.value = snapshot
}

const onSelectionPointerUp = (event: PointerEvent) => {
  if ((event.target as Element | null)?.closest('.reader-selection-menu')) return
  window.setTimeout(showSelectionMenu, 0)
}

const copySelection = async () => {
  const text = selectionSnapshot.value?.text
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    clearSelectionMenu()
    ElMessage.success('已复制')
  } catch (error) {
    console.error('复制失败', error)
    ElMessage.error('复制失败，请检查系统剪贴板权限')
  }
}

const openReplaceDialog = () => {
  const snapshot = selectionSnapshot.value
  if (!snapshot?.anchor) return
  pendingSelectionText.value = snapshot.text
  replaceDialogVisible.value = true
  clearSelectionMenu()
}

const bookmarkSelection = async () => {
  const anchor = selectionSnapshot.value?.anchor
  if (!anchor || !currentBook.value) return
  const id = `${currentBook.value.id}:${anchor.chapterIndex}:${anchor.startParagraph}:${anchor.startOffset}`
  const chapterTitle = chapters.value[anchor.chapterIndex]?.title || `第${anchor.chapterIndex + 1}章`
  try {
    await saveBookmark({
      id,
      bookId: currentBook.value.id,
      bookName: currentBook.value.name,
      bookAuthor: currentBook.value.author,
      chapterIndex: anchor.chapterIndex,
      chapterPos: anchor.startParagraph,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
      chapterTitle,
      content: anchor.text,
      createdAt: Date.now(),
    })
    await loadCurrentBookBookmarks()
    clearSelectionMenu()
    ElMessage.success('书签已添加')
  } catch (error) {
    console.error('添加精确书签失败', error)
    ElMessage.error('书签添加失败')
  }
}

const highlightSelection = async (style: HighlightStyleRecord) => {
  const anchor = selectionSnapshot.value?.anchor
  if (!anchor || !currentBook.value) return
  const chapter = chapters.value[anchor.chapterIndex]
  const record: HighlightRecord = {
    id: `${currentBook.value.id}:${anchor.chapterIndex}:${anchor.startOffset}:${Date.now()}`,
    bookId: currentBook.value.id,
    bookName: currentBook.value.name,
    bookAuthor: currentBook.value.author,
    bookUrl: currentBook.value.bookUrl,
    chapterUrl: chapter?.href,
    chapterIndex: anchor.chapterIndex,
    chapterTitle: chapter?.title || `第${anchor.chapterIndex + 1}章`,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    startParagraph: anchor.startParagraph,
    endParagraph: anchor.endParagraph,
    text: anchor.text,
    style,
    createdAt: Date.now(),
  }
  try {
    await saveHighlight(record)
    currentBookHighlights.value.push(record)
    appSettings.setLastHighlightStyle(style)
    clearSelectionMenu()
    renderRevision.value += 1
    ElMessage.success('已添加高亮')
  } catch (error) {
    console.error('添加高亮失败', error)
    ElMessage.error('高亮保存失败')
  }
}

const searchSelection = async () => {
  const text = selectionSnapshot.value?.text.trim()
  if (!text) return
  const directUrl = /^https?:\/\/\S+$/i.test(text) ? text : null
  const templates = {
    bing: 'https://www.bing.com/search?q=',
    baidu: 'https://www.baidu.com/s?wd=',
    google: 'https://www.google.com/search?q=',
  }
  const url = directUrl || `${templates[appSettings.searchEngine]}${encodeURIComponent(text)}`
  try {
    await openExternalUrl(url)
    clearSelectionMenu()
  } catch (error) {
    console.error('打开系统浏览器失败', error)
    ElMessage.error('无法打开系统默认浏览器，选区已保留')
  }
}

const flushReadingSession = async (
  continueSession = document.visibilityState === 'visible',
) => {
  if (!supportsBookDetail || !currentBook.value || readingSessionStartedAt === 0) return
  const duration = Math.max(0, Date.now() - readingSessionStartedAt)
  readingSessionStartedAt = continueSession ? Date.now() : 0
  await addReadingTime(currentBook.value, duration).catch(error => {
    console.warn('保存阅读记录失败', error)
  })
}

// 点击屏幕切换移动端工具栏
const handleWrapperClick = () => {
  if (miniInterface.value) {
    showToolBar.value = !showToolBar.value
  }
}

const replaceContext = () => ({
  bookName: currentBook.value?.name || '',
  sourceUrl: currentBook.value?.sourceUrl,
})

const processChapterPayload = async (payload: ChapterPayload): Promise<ChapterPayload> => {
  try {
    return await applyRulesToChapter(payload, replaceRules.value, replaceContext())
  } catch (error) {
    if (error instanceof ReplacementTimeoutError) {
      const disabled = { ...error.rule, isEnabled: false }
      await saveReplaceRule(disabled).catch(console.error)
      replaceRules.value = replaceRules.value.map(rule => rule.id === disabled.id ? disabled : rule)
      ElMessage.error(`替换规则“${disabled.name}”执行超时，已自动停用`)
      return applyRulesToChapter(payload, replaceRules.value, replaceContext())
    }
    throw error
  }
}

const reprocessLoadedChapters = async () => {
  const generation = contentGeneration
  const processed = await Promise.all(rawChapterData.value.map(processChapterPayload))
  if (generation !== contentGeneration) return
  chapterData.value = processed
  renderRevision.value += 1
}

const handleReplaceRuleSaved = async () => {
  replaceRules.value = await getAllReplaceRules()
  try {
    await reprocessLoadedChapters()
  } catch (error) {
    console.error('重新处理已加载正文失败', error)
    ElMessage.error(error instanceof Error ? error.message : '正文重新处理失败')
  }
}

// 获取章节内容
const getContent = async (
  index: number,
  reloadChapter = true,
  forceRefresh = false,
): Promise<boolean> => {
  if (index < 0 || index >= chapters.value.length) return false

  const generation = reloadChapter ? ++contentGeneration : contentGeneration
  chapterLoading.value = true

  if (reloadChapter && !forceRefresh) {
    window.scrollTo(0, 0)
    chapterData.value = []
    rawChapterData.value = []
    await store.saveProgress(index).catch(console.error)
  } else if (!reloadChapter) {
    chapterData.value = trimChapterWindowBeforeAppend(chapterData.value)
    rawChapterData.value = trimChapterWindowBeforeAppend(rawChapterData.value)
  }

  try {
    const payload = await store.fetchChapter(index, { forceRefresh })
    if (generation !== contentGeneration) return false

    if (payload) {
      const processedPayload = await processChapterPayload(payload)
      if (forceRefresh) {
        rawChapterData.value = [payload]
        chapterData.value = [processedPayload]
      } else {
        rawChapterData.value.push(payload)
        chapterData.value.push(processedPayload)
      }
      if (reloadChapter && store.currentBook) {
        store.currentBook.currentChapter = index
        if (
          store.currentBook.legacyChapterCharPos !== undefined &&
          store.currentBook.legacyChapterCharPos >= 0
        ) {
          const rawContent = Array.isArray(payload.content)
            ? payload.content.join('\n')
            : payload.content.replace(/<[^>]+>/g, '\n')
          store.currentBook.currentChapterPos = characterOffsetToParagraphIndex(
            rawContent,
            store.currentBook.legacyChapterCharPos,
          )
          store.currentBook.legacyChapterCharPos = undefined
          await store.saveProgress(index, store.currentBook.currentChapterPos).catch(console.error)
        }
      }
      return true
    }
    return false
  } catch (err) {
    console.error('获取章节内容失败', err)
    const action = forceRefresh ? '刷新正文' : '获取章节内容'
    ElMessage.error(err instanceof Error ? `${action}失败: ${err.message}` : `${action}失败`)
    return false
  } finally {
    if (generation === contentGeneration) {
      chapterLoading.value = false
    }
  }
}

const refreshCurrentChapter = async () => {
  if (chapterLoading.value) return
  const refreshed = await getContent(currentChapterIndex.value, true, true)
  if (refreshed) ElMessage.success('本章正文已刷新')
}

// 底部触底无限加载
const loadMore = () => {
  const lastChapter = chapterData.value[chapterData.value.length - 1]
  if (!lastChapter) return
  const nextIndex = lastChapter.index + 1
  if (nextIndex < chapters.value.length) {
    getContent(nextIndex, false)
  }
}

const onReachBottom = (entries: IntersectionObserverEntry[]) => {
  if (chapterLoading.value) return
  for (const entry of entries) {
    if (entry.isIntersecting) {
      loadMore()
      break
    }
  }
}

watchEffect(() => {
  if (!infiniteLoading.value) {
    scrollObserver?.disconnect()
  } else if (loadingRef.value && scrollObserver) {
    scrollObserver.observe(loadingRef.value)
  }
})

// 顶部 / 底部跳转
const toTop = () => {
  if (topRef.value) jump(topRef.value, { duration: settings.value.jumpDuration })
}

const toBottom = () => {
  if (bottomRef.value) jump(bottomRef.value, { duration: settings.value.jumpDuration })
}

const toShelf = () => {
  router.push('/bookshelf')
}

const toBookDetail = () => {
  if (!currentBook.value) return
  router.push({
    path: '/book-detail',
    query: { id: currentBook.value.id },
  })
}

// 章节前后切换
const toPreChapter = async () => {
  if (isFirstChapter.value) {
    ElMessage.warning('已经是第一章')
    return
  }
  await getContent(currentChapterIndex.value - 1, true)
}

const toNextChapter = async () => {
  if (isLastChapter.value) {
    ElMessage.warning('已经是最后一章')
    return
  }
  await getContent(currentChapterIndex.value + 1, true)
}

// 键盘事件
let canJump = true
const handleKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && selectionSnapshot.value) {
    event.stopPropagation()
    clearSelectionMenu()
    return
  }
  if (!canJump) return
  switch (event.key) {
    case 'ArrowLeft':
      event.stopPropagation()
      event.preventDefault()
      toPreChapter()
      break
    case 'ArrowRight':
      event.stopPropagation()
      event.preventDefault()
      toNextChapter()
      break
    case 'ArrowUp':
      event.stopPropagation()
      event.preventDefault()
      if (document.documentElement.scrollTop === 0) {
        ElMessage.warning('已到达页面顶部')
      } else {
        canJump = false
        jump(0 - document.documentElement.clientHeight + 100, {
          duration: settings.value.jumpDuration,
          callback: () => (canJump = true),
        })
      }
      break
    case 'ArrowDown':
      event.stopPropagation()
      event.preventDefault()
      if (
        document.documentElement.clientHeight +
          document.documentElement.scrollTop >=
        document.documentElement.scrollHeight - 5
      ) {
        ElMessage.warning('已到达页面底部')
      } else {
        canJump = false
        jump(document.documentElement.clientHeight - 100, {
          duration: settings.value.jumpDuration,
          callback: () => (canJump = true),
        })
      }
      break
  }
}

const ignoreKeyPress = (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
  }
}

// 滚动阅读进度更新
let progressFrame: number | null = null
let lastSavedPositionKey = ''
const updateReadingProgress = () => {
  progressFrame = null
  const position = findReadingPosition()
  if (!position) return
  const index = position.chapterIndex
  const positionKey = `${position.chapterIndex}:${position.chapterPos}`
  if (Number.isInteger(index) && positionKey !== lastSavedPositionKey) {
    lastSavedPositionKey = positionKey
    store.saveProgress(index, position.chapterPos).catch(console.error)
  }
  if (supportsBookDetail) syncBookmarkState(position).catch(console.error)
}

const onScroll = () => {
  if (selectionSnapshot.value) clearSelectionMenu()
  if (progressFrame === null) {
    progressFrame = window.requestAnimationFrame(updateReadingProgress)
  }
}

// 窗口尺寸变化
const onResize = () => {
  if (selectionSnapshot.value) clearSelectionMenu()
  store.setMiniInterface(window.innerWidth < 776)
  if (!store.miniInterface) {
    if (settings.value.readWidth < 640) settings.value.readWidth = 640
    if (settings.value.readWidth + 2 * 68 > window.innerWidth) {
      settings.value.readWidth = Math.max(640, window.innerWidth - 160)
    }
  }
}

// 页面标题更新
watchEffect(() => {
  const title = chapters.value[currentChapterIndex.value]?.title
  if (currentBook.value && title) {
    document.title = `${currentBook.value.name} | ${title}`
  }
})

// 监听页面隐藏自动保存进度
const onVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    if (currentBook.value) store.saveProgress().catch(console.error)
    flushReadingSession().catch(console.error)
  } else if (supportsBookDetail && currentBook.value && readingSessionStartedAt === 0) {
    readingSessionStartedAt = Date.now()
  }
}

onMounted(async () => {
  const rawId = route.params.id
  const bookId = Array.isArray(rawId) ? rawId[0] : (rawId as string)
  if (!bookId) {
    router.push('/bookshelf')
    return
  }

  try {
    await store.loadBook(bookId)
    if (supportsBookDetail) {
      replaceRules.value = await getAllReplaceRules().catch(() => [])
      await loadCurrentBookHighlights()
      await addReadingTime(currentBook.value!, 0).catch(console.error)
      readingSessionStartedAt = Date.now()
    }

    onResize()
    window.addEventListener('resize', onResize)

    // 若保存了自定义网络字体，页面刷新时自动挂载
    if (
      settings.value.font === -1 &&
      settings.value.customFontName &&
      settings.value.customFontUrl &&
      typeof FontFace === 'function'
    ) {
      try {
        const fontface = new FontFace(
          settings.value.customFontName,
          `url("${settings.value.customFontUrl}")`
        )
        fontface
          .load()
          .then(loaded => {
            document.fonts.add(loaded)
          })
          .catch(err => {
            console.warn('自动重新挂载自定义网络字体失败:', err)
          })
      } catch (e) {
        console.warn('FontFace 初始化失败:', e)
      }
    }

    if (chapters.value.length === 0) {
      ElMessage.warning('该书籍未包含任何章节')
      return
    }

    const requestedChapter = Number(route.query.chapter)
    const initialChapter = Math.max(
      0,
      Math.min(
        chapters.value.length - 1,
        Number.isInteger(requestedChapter)
          ? requestedChapter
          : (currentBook.value?.currentChapter ?? 0),
      )
    )
    await getContent(initialChapter, true)
    await nextTick()
    const requestedPosition = route.query.pos !== undefined
      ? Number(route.query.pos)
      : currentBook.value?.currentChapterPos
    if (Number.isInteger(requestedPosition) && Number(requestedPosition) >= 0) {
      const target = document.querySelector<HTMLElement>(
        `[data-chapter-index="${initialChapter}"] [data-chapterpos="${Number(requestedPosition)}"]`,
      )
      if (target) jump(target, { duration: 0 })
    }
    if (supportsBookDetail) await syncBookmarkState()

    window.addEventListener('keyup', handleKeyPress)
    window.addEventListener('keydown', ignoreKeyPress)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('pointerup', onSelectionPointerUp)
    document.addEventListener('visibilitychange', onVisibilityChange)

    scrollObserver = new IntersectionObserver(onReachBottom, {
      rootMargin: '-100% 0% 20% 0%',
    })
    if (infiniteLoading.value && loadingRef.value) {
      scrollObserver.observe(loadingRef.value)
    }
  } catch (err) {
    console.error('加载图书失败详情:', err)
    ElMessage.error(
      err instanceof Error ? `加载图书失败: ${err.message}` : '加载图书失败，正在返回书架...'
    )
    setTimeout(toShelf, 1500)
  }
})

onUnmounted(() => {
  flushReadingSession(false).catch(console.error)
  window.removeEventListener('keyup', handleKeyPress)
  window.removeEventListener('keydown', ignoreKeyPress)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerup', onSelectionPointerUp)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (progressFrame !== null) window.cancelAnimationFrame(progressFrame)
  popCataVisible.value = false
  readSettingsVisible.value = false
  scrollObserver?.disconnect()
  scrollObserver = null
  store.cleanup()
})

onBeforeRouteLeave(() => {
  window.removeEventListener('keyup', handleKeyPress)
  document.removeEventListener('pointerup', onSelectionPointerUp)
  if (currentBook.value) {
    store.saveProgress().catch(console.error)
    flushReadingSession(false).catch(console.error)
  }
})
</script>

<style lang="scss" scoped>
:deep(.pop-setting) {
  margin-left: 68px;
  top: 0;
}

:deep(.pop-cata) {
  margin-left: 10px;
}

.chapter-wrapper {
  padding: 0;
  width: 100%;
  min-height: 100vh;
  position: relative;

  .tool-bar {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 100;

    .tools {
      display: flex;
      flex-direction: column;

      .tool-icon {
        box-sizing: content-box !important;
        font-size: 18px;
        width: 58px;
        height: 48px;
        text-align: center;
        padding-top: 12px;
        cursor: pointer;
        outline: none;

        .iconfont {
          font-family: iconfont !important;
          width: 16px;
          height: 16px;
          font-size: 16px;
          margin: 0 auto 6px;
        }

        .action-icon {
          display: block;
          width: 16px;
          height: 16px;
          margin: 0 auto 6px;
          font-size: 16px;
        }

        .icon-text {
          font-size: 12px;
          line-height: 1;
        }

        &.no-point {
          opacity: 0.35;
          pointer-events: none;
        }
      }
    }
  }

  .bookmark-bar {
    position: fixed;
    top: 72px;
    right: 50%;
    z-index: 100;

    .tool-icon {
      box-sizing: content-box !important;
      width: 42px;
      height: 43px;
      padding-top: 10px;
      text-align: center;
      cursor: pointer;

      .action-icon {
        display: block;
        width: 17px;
        height: 17px;
        margin: 0 auto 5px;
        font-size: 17px;
      }

      .icon-text {
        font-size: 12px;
        line-height: 1;
      }

      &.active {
        color: #e6a23c;
      }

      &.no-point {
        opacity: 0.5;
        pointer-events: none;
      }
    }
  }

  .read-bar {
    position: fixed;
    bottom: 0;
    right: 50%;
    z-index: 100;

    .tools {
      display: flex;
      flex-direction: column;

      .tool-icon {
        box-sizing: content-box !important;
        font-size: 18px;
        width: 42px;
        height: 31px;
        padding-top: 12px;
        text-align: center;
        align-items: center;
        cursor: pointer;
        outline: none;
        margin-top: -1px;

        .iconfont {
          font-family: iconfont !important;
          width: 16px;
          height: 16px;
          font-size: 16px;
          margin: 0 auto 6px;
        }

        &.no-point {
          opacity: 0.35;
          pointer-events: none;
        }
      }
    }
  }

  .chapter {
    font-family: 'Microsoft YaHei', PingFangSC-Regular, HelveticaNeue-Light,
      'Helvetica Neue Light', sans-serif;
    text-align: left;
    padding: 0 65px;
    min-height: 100vh;
    margin: 0 auto;
    box-sizing: border-box;

    .content {
      font-size: 18px;
      line-height: 1.8;

      .top-bar,
      .bottom-bar {
        height: 64px;
      }

      .loading {
        height: 40px;
      }
    }
  }
}

.day {
  :deep(.popup) {
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 0 6px rgba(0, 0, 0, 0.04);
  }

  .tool-icon {
    border: 1px solid rgba(0, 0, 0, 0.1);
    margin-top: -1px;
    color: #000;

    .icon-text {
      color: rgba(0, 0, 0, 0.4);
    }
  }

  .chapter {
    border: 1px solid #d8d8d8;
    color: #262626;
  }
}

.night {
  :deep(.popup) {
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.48),
      0 0 6px rgba(0, 0, 0, 0.16);
  }

  .tool-icon {
    border: 1px solid #444;
    margin-top: -1px;
    color: #666;

    .icon-text {
      color: #666;
    }
  }

  .chapter {
    border: 1px solid #444;
    color: #666;
  }

  :deep(.popper__arrow) {
    background: #666;
  }
}

@media screen and (max-width: 776px) {
  .chapter-wrapper {
    padding: 0;

    .tool-bar {
      left: 0;
      top: auto;
      bottom: 0;
      width: 100vw;
      margin-left: 0 !important;

      .tools {
        flex-direction: row;
        justify-content: space-around;

        .tool-icon {
          border: none;
          flex: 1;
          width: auto;
          min-width: 0;
          height: 48px;
          padding-top: 6px;
        }
      }
    }

    .read-bar {
      right: 0;
      top: 0;
      bottom: auto;
      width: 100vw;
      margin-right: 0 !important;

      .tools {
        flex-direction: row;
        justify-content: space-between;
        padding: 0 15px;

        .tool-icon {
          border: none;
          width: auto;
          height: 40px;
          padding-top: 6px;
          display: flex;
          align-items: center;
          gap: 6px;

          .iconfont {
            display: inline-block;
            margin: 0;
          }
        }
      }
    }

    .bookmark-bar {
      top: 52px;
      right: 8px;
      margin-right: 0 !important;
      border-radius: 6px;

      .tool-icon {
        border: none;
        width: 40px;
        height: 40px;
        padding-top: 6px;
      }
    }

    .chapter {
      width: 100vw !important;
      padding: 0 20px;
      box-sizing: border-box;
      border: none !important;
    }
  }
}
</style>
