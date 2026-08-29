<template>
  <div
    class="chapter-wrapper"
    :style="bodyTheme"
    :class="{
      night: isNight,
      day: !isNight,
      'pagination-mode': isPaginationMode,
    }"
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
          :popper-options="readerPopoverOptions"
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
          :popper-options="readerPopoverOptions"
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
        <div v-if="canOpenBookDetail" class="tool-icon" @click="toBookDetail">
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
    <div class="bookmark-bar" :style="rightBarTheme" @click.stop>
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
    <div
      class="chapter"
      :class="[pageTransitionClass, { 'pagination-chapter': isPaginationMode }]"
      ref="contentRef"
      :style="[chapterTheme, pageTransitionTheme]"
      :title="isPaginationMode ? '点击左侧上一页，右侧下一页' : undefined"
      @click="handleChapterClick"
    >
      <div class="page-viewport" ref="pageViewportRef">
        <div class="content" ref="pageContentRef" :style="paginationContentStyle">
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
              :embedded-images="data.embeddedImages"
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

        <!-- 覆盖 / 仿真翻页过渡图层 -->
        <div
          v-if="pageOverlay"
          class="page-transition-overlay"
          :class="pageOverlay.className"
          :style="pageOverlay.style"
        >
          <div
            class="content page-transition-overlay-content"
            :style="pageOverlay.contentStyle"
            v-html="pageOverlay.html"
          ></div>
          <div v-if="pageOverlay.showShadow" class="page-transition-shadow-gradient"></div>
        </div>
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
import { useBookshelfStore } from '@/stores/bookshelf'
import type { ReaderPageAnimation } from '@/parsers/types'
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
  deleteBookFromDB,
  getBookmarksByBookId,
  getBookmarkAt,
  getAllReplaceRules,
  getHighlightsByBookId,
  saveBookmark,
  saveHighlight,
  saveReplaceRule,
  deleteHighlight,
  updateBookMeta,
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
import { copyTextToClipboard } from '@/platform/clipboard'
import '@/assets/fonts/iconfont.css'

const route = useRoute()
const router = useRouter()
const store = useReadingStore()
const bookshelfStore = useBookshelfStore()
const appSettings = useAppSettingsStore()
const { isFullscreen, toggleFullscreen } = useFullscreen()

const isBookInShelf = computed(() => {
  if (!currentBook.value) return true
  // 本地书（txt/epub）默认在书架中
  if (currentBook.value.format !== 'online') return true
  if (currentBook.value.inShelf === false) return false
  return bookshelfStore.books.some(b => b.id === currentBook.value?.id)
})

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
const isDesktopBuild = import.meta.env.VITE_APP_TARGET === 'desktop'
const canOpenBookDetail = computed(() =>
  isDesktopBuild || currentBook.value?.format === 'txt' || currentBook.value?.format === 'epub',
)
const readerPopoverOptions = computed(() => ({
  modifiers: [
    {
      name: 'preventOverflow',
      options: {
        padding: {
          top: isDesktopBuild && !isFullscreen.value ? 36 : 0,
          right: 0,
          bottom: 0,
          left: 0,
        },
      },
    },
  ],
}))
let contentGeneration = 0
let scrollObserver: IntersectionObserver | null = null

const topRef = ref<HTMLElement>()
const bottomRef = ref<HTMLElement>()
const loadingRef = ref<HTMLElement>()
const contentRef = ref<HTMLElement>()
const pageViewportRef = ref<HTMLElement>()
const pageContentRef = ref<HTMLElement>()
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

type PageTransitionDirection = 'forward' | 'backward'

interface PageOverlayState {
  className: string
  style: Record<string, string>
  contentStyle: Record<string, string>
  html: string
  showShadow?: boolean
  onComplete?: () => void
}

const isPaginationMode = computed(() => settings.value.pageAnimation !== 'scroll')
const pageTransitionClass = ref('')
const pageOverlay = ref<PageOverlayState | null>(null)
const suppressPageTransition = ref(false)
let pageTransitionTimer: number | undefined
let paginationMeasureFrame: number | undefined
const paginationPageIndex = ref(0)
const paginationPageCount = ref(1)
const paginationPageWidth = ref(0)

const pageTransitionDuration = computed(() => {
  if (settings.value.pageAnimation === 'none') return 0
  const duration = settings.value.jumpDuration
  if (duration <= 0) return 0
  return Math.min(500, Math.max(150, Math.round(duration * 0.35)))
})

const pageTransitionTheme = computed(() => {
  const lineSpacing = settings.value.spacing?.line ?? 1.0
  const paragraphSpacing = settings.value.spacing?.paragraph ?? 1.0
  const letterSpacing = settings.value.spacing?.letter ?? 0
  return {
    '--reader-page-transition-duration': `${pageTransitionDuration.value}ms`,
    '--reader-chapter-bg': chapterColor.value,
    '--reader-line-height': `calc(1 + ${lineSpacing})`,
    '--reader-paragraph-margin': `calc(${paragraphSpacing} * 1em) 0`,
    '--reader-letter-spacing': `calc(${letterSpacing} * 1em)`,
  }
})

const paginationContentStyle = computed(() => {
  if (!isPaginationMode.value) return {}
  const pageWidth = paginationPageWidth.value || pageViewportRef.value?.clientWidth || 1
  const disableTransition =
    settings.value.pageAnimation !== 'slide' ||
    pageTransitionDuration.value === 0 ||
    suppressPageTransition.value
  return {
    '--reader-pagination-page-width': `${pageWidth}px`,
    transform: `translateX(-${paginationPageIndex.value * paginationPageWidth.value}px)`,
    transition: disableTransition ? 'none' : undefined,
  }
})

const clearPageOverlay = () => {
  if (pageTransitionTimer !== undefined) {
    window.clearTimeout(pageTransitionTimer)
    pageTransitionTimer = undefined
  }
  if (pageOverlay.value?.onComplete) {
    pageOverlay.value.onComplete()
  }
  pageOverlay.value = null
}

const measurePagination = () => {
  if (!isPaginationMode.value || !pageViewportRef.value || !pageContentRef.value) return
  const width = pageViewportRef.value.clientWidth
  if (width === 0) return

  paginationPageWidth.value = width
  paginationPageCount.value = Math.max(1, Math.ceil(pageContentRef.value.scrollWidth / width))
  paginationPageIndex.value = Math.min(paginationPageIndex.value, paginationPageCount.value - 1)
}

const schedulePaginationMeasurement = () => {
  if (!isPaginationMode.value) return
  if (paginationMeasureFrame !== undefined) window.cancelAnimationFrame(paginationMeasureFrame)
  nextTick(() => {
    paginationMeasureFrame = window.requestAnimationFrame(() => {
      paginationMeasureFrame = undefined
      measurePagination()
    })
  })
}

const revealPaginationTarget = async (target: HTMLElement) => {
  if (!isPaginationMode.value || !pageViewportRef.value || paginationPageWidth.value === 0) {
    return false
  }
  clearPageOverlay()
  const viewportLeft = pageViewportRef.value.getBoundingClientRect().left
  const targetOffset = target.getBoundingClientRect().left - viewportLeft
    + paginationPageIndex.value * paginationPageWidth.value
  paginationPageIndex.value = Math.max(
    0,
    Math.min(paginationPageCount.value - 1, Math.floor(targetOffset / paginationPageWidth.value)),
  )
  await nextTick()
  return true
}

const playChapterTransition = async (direction?: PageTransitionDirection) => {
  if (!direction || settings.value.pageAnimation === 'none' || pageTransitionDuration.value === 0) {
    return
  }

  if (pageTransitionTimer !== undefined) window.clearTimeout(pageTransitionTimer)
  pageTransitionClass.value = ''
  await nextTick()
  pageTransitionClass.value = 'page-transition--chapter-fade'
  pageTransitionTimer = window.setTimeout(() => {
    pageTransitionClass.value = ''
    pageTransitionTimer = undefined
  }, 200)
}

const turnPaginationPage = async (direction: PageTransitionDirection) => {
  if (!isPaginationMode.value || chapterLoading.value) return false
  measurePagination()
  const oldIndex = paginationPageIndex.value
  const nextIndex = oldIndex + (direction === 'forward' ? 1 : -1)
  if (nextIndex < 0 || nextIndex >= paginationPageCount.value) return false

  const animation = settings.value.pageAnimation
  const duration = pageTransitionDuration.value
  const width = paginationPageWidth.value || pageViewportRef.value?.clientWidth || 1
  const html = pageContentRef.value?.innerHTML || ''

  clearPageOverlay()

  if (animation === 'none' || duration === 0) {
    paginationPageIndex.value = nextIndex
    await nextTick()
    updateReadingProgress()
    return true
  }

  if (animation === 'slide') {
    paginationPageIndex.value = nextIndex
    await nextTick()
    updateReadingProgress()
    return true
  }

  if (animation === 'cover') {
    if (direction === 'forward') {
      pageOverlay.value = {
        className: 'page-transition--cover-forward',
        style: {
          background: chapterColor.value,
        },
        contentStyle: {
          '--reader-pagination-page-width': `${width}px`,
          transform: `translateX(-${nextIndex * width}px)`,
        },
        html,
        showShadow: true,
        onComplete: () => {
          paginationPageIndex.value = nextIndex
        },
      }
      pageTransitionTimer = window.setTimeout(() => {
        if (pageOverlay.value) {
          paginationPageIndex.value = nextIndex
          pageOverlay.value = null
          pageTransitionTimer = undefined
          updateReadingProgress()
        }
      }, duration)
    } else {
      paginationPageIndex.value = nextIndex
      pageOverlay.value = {
        className: 'page-transition--cover-backward',
        style: {
          background: chapterColor.value,
        },
        contentStyle: {
          '--reader-pagination-page-width': `${width}px`,
          transform: `translateX(-${oldIndex * width}px)`,
        },
        html,
        showShadow: true,
      }
      pageTransitionTimer = window.setTimeout(() => {
        if (pageOverlay.value) {
          pageOverlay.value = null
          pageTransitionTimer = undefined
          updateReadingProgress()
        }
      }, duration)
    }
    return true
  }

  if (animation === 'simulation') {
    if (direction === 'forward') {
      paginationPageIndex.value = nextIndex
      pageOverlay.value = {
        className: 'page-transition--sim-forward',
        style: {
          background: chapterColor.value,
        },
        contentStyle: {
          '--reader-pagination-page-width': `${width}px`,
          transform: `translateX(-${oldIndex * width}px)`,
        },
        html,
        showShadow: true,
      }
      pageTransitionTimer = window.setTimeout(() => {
        if (pageOverlay.value) {
          pageOverlay.value = null
          pageTransitionTimer = undefined
          updateReadingProgress()
        }
      }, duration)
    } else {
      pageOverlay.value = {
        className: 'page-transition--sim-backward',
        style: {
          background: chapterColor.value,
        },
        contentStyle: {
          '--reader-pagination-page-width': `${width}px`,
          transform: `translateX(-${nextIndex * width}px)`,
        },
        html,
        showShadow: true,
        onComplete: () => {
          paginationPageIndex.value = nextIndex
        },
      }
      pageTransitionTimer = window.setTimeout(() => {
        if (pageOverlay.value) {
          paginationPageIndex.value = nextIndex
          pageOverlay.value = null
          pageTransitionTimer = undefined
          updateReadingProgress()
        }
      }, duration)
    }
    return true
  }

  paginationPageIndex.value = nextIndex
  await nextTick()
  updateReadingProgress()
  return true
}

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

const infiniteLoading = computed(
  () => settings.value.pageAnimation === 'scroll' && appSettings.readerScrollInfiniteLoading,
)
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
  if (isPaginationMode.value) {
    await revealPaginationTarget(exactTarget)
  } else {
    jump(exactTarget, { duration: 0 })
  }
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
  if (target) {
    if (isPaginationMode.value) {
      await revealPaginationTarget(target)
    } else {
      jump(target, { duration: 0 })
    }
  }
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

const isImageChapter = (chapterIndex?: number) => {
  if (chapterIndex !== undefined) {
    const ch = chapterData.value.find(c => c.index === chapterIndex)
    if (ch?.format === 'images') return true
  }
  return chapterData.value.some(c => c.format === 'images')
}

const showSelectionMenu = () => {
  if (replaceDialogVisible.value || highlightEditVisible.value) return
  const snapshot = captureReaderSelection(window.getSelection())
  if (!snapshot) {
    selectionSnapshot.value = null
    return
  }
  if (isImageChapter(snapshot.anchor?.chapterIndex)) {
    clearSelectionMenu()
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
  if (isImageChapter()) {
    clearSelectionMenu()
    return
  }
  if ((event.target as Element | null)?.closest('.reader-selection-menu')) return
  window.setTimeout(showSelectionMenu, 0)
}

const copySelection = async () => {
  const text = selectionSnapshot.value?.text
  if (!text) return
  try {
    await copyTextToClipboard(text)
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
  if (!anchor || !currentBook.value || isImageChapter(anchor.chapterIndex)) return
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
  if (!currentBook.value || readingSessionStartedAt === 0) return
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

const handleChapterClick = async (event: MouseEvent) => {
  if (!isPaginationMode.value || chapterLoading.value) return
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  const target = event.target as Element | null
  if (target?.closest('a, button, input, textarea, select, [data-reader-highlight]')) return
  const chapter = contentRef.value
  if (!chapter) return

  const { left, width } = chapter.getBoundingClientRect()
  if (width === 0) return
  const offsetX = event.clientX - left
  if (offsetX <= width / 3) {
    event.stopPropagation()
    if (!await turnPaginationPage('backward')) await toPreChapter('end')
  } else if (offsetX >= (width * 2) / 3) {
    event.stopPropagation()
    if (!await turnPaginationPage('forward')) await toNextChapter()
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
  pageTransitionDirection?: PageTransitionDirection,
  paginationTargetPage: 'start' | 'end' = 'start',
): Promise<boolean> => {
  if (index < 0 || index >= chapters.value.length) return false

  clearPageOverlay()
  const generation = reloadChapter ? ++contentGeneration : contentGeneration
  chapterLoading.value = true

  if (reloadChapter && !forceRefresh) {
    window.scrollTo(0, 0)
    store.revokeChapterAssets()
    chapterData.value = []
    rawChapterData.value = []
    if (!isPaginationMode.value || paginationTargetPage !== 'end') {
      await store.saveProgress(index).catch(console.error)
    }
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
          paginationTargetPage !== 'end' &&
          payload.format !== 'images' &&
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
      if (reloadChapter && isPaginationMode.value) {
        suppressPageTransition.value = true
        await nextTick()
        measurePagination()
        paginationPageIndex.value = paginationTargetPage === 'end'
          ? Math.max(0, paginationPageCount.value - 1)
          : 0
        await nextTick()
        suppressPageTransition.value = false
        updateReadingProgress()
      }
      await playChapterTransition(pageTransitionDirection)
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
const toTop = async () => {
  if (isPaginationMode.value) {
    paginationPageIndex.value = 0
    await nextTick()
    updateReadingProgress()
    return
  }
  if (topRef.value) jump(topRef.value, { duration: settings.value.jumpDuration })
}

const toBottom = async () => {
  if (isPaginationMode.value) {
    measurePagination()
    paginationPageIndex.value = paginationPageCount.value - 1
    await nextTick()
    updateReadingProgress()
    return
  }
  if (bottomRef.value) jump(bottomRef.value, { duration: settings.value.jumpDuration })
}

const toShelf = () => {
  router.push('/bookshelf')
}

const toBookDetail = () => {
  if (!currentBook.value) return
  router.push({
    path: '/book-detail',
    query: {
      id: currentBook.value.id,
      name: currentBook.value.name,
      author: currentBook.value.author,
      bookUrl: currentBook.value.bookUrl,
      coverUrl: currentBook.value.coverUrl,
      intro: currentBook.value.intro,
      kind: currentBook.value.kind,
      latestChapter: currentBook.value.latestChapterTitle,
      sourceUrl: currentBook.value.sourceUrl,
      sourceName: currentBook.value.sourceName,
      tocUrl: currentBook.value.tocUrl,
    },
  })
}

// 章节前后切换
const toPreChapter = async (targetPage: 'start' | 'end' | MouseEvent = 'start') => {
  const resolvedTarget = targetPage === 'end' ? 'end' : 'start'
  if (isFirstChapter.value) {
    ElMessage.warning('已经是第一章')
    return
  }
  await getContent(currentChapterIndex.value - 1, true, false, 'backward', resolvedTarget)
}

const toNextChapter = async () => {
  if (isLastChapter.value) {
    ElMessage.warning('已经是最后一章')
    return
  }
  await getContent(currentChapterIndex.value + 1, true, false, 'forward', 'start')
}

// 键盘事件
let canJump = true
const handleKeyPress = async (event: KeyboardEvent) => {
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
      toPreChapter('start')
      break
    case 'ArrowRight':
      event.stopPropagation()
      event.preventDefault()
      toNextChapter()
      break
    case 'ArrowUp':
      event.stopPropagation()
      event.preventDefault()
      if (isPaginationMode.value) {
        if (!await turnPaginationPage('backward')) await toPreChapter('end')
        break
      }
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
      if (isPaginationMode.value) {
        if (!await turnPaginationPage('forward')) await toNextChapter()
        break
      }
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
  syncBookmarkState(position).catch(console.error)
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
  schedulePaginationMeasurement()
}

watch(isPaginationMode, enabled => {
  clearPageOverlay()
  if (enabled) {
    if (chapterData.value.length > 1) {
      const currentIndex = currentChapterIndex.value
      const visibleChapter = chapterData.value.find(chapter => chapter.index === currentIndex)
        ?? chapterData.value[chapterData.value.length - 1]
      const rawChapter = rawChapterData.value.find(chapter => chapter.index === visibleChapter?.index)
      chapterData.value = visibleChapter ? [visibleChapter] : []
      rawChapterData.value = rawChapter ? [rawChapter] : []
    }
    paginationPageIndex.value = 0
    schedulePaginationMeasurement()
  }
})

watch(
  () => [
    settings.value.fontSize,
    settings.value.readWidth,
    settings.value.spacing.letter,
    settings.value.spacing.line,
    settings.value.spacing.paragraph,
    renderRevision.value,
  ],
  schedulePaginationMeasurement,
)

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
    if (currentBook.value) store.saveProgress(undefined, undefined, true).catch(console.error)
    flushReadingSession().catch(console.error)
  } else if (currentBook.value && readingSessionStartedAt === 0) {
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
    if (bookshelfStore.books.length === 0) {
      await bookshelfStore.loadBooks().catch(console.error)
    }
    await store.loadBook(bookId)
    replaceRules.value = await getAllReplaceRules().catch(() => [])
    await loadCurrentBookHighlights()
    if (currentBook.value) {
      await addReadingTime(currentBook.value, 0).catch(console.error)
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
            schedulePaginationMeasurement()
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
      if (target) {
        if (isPaginationMode.value) {
          await revealPaginationTarget(target)
        } else {
          jump(target, { duration: 0 })
        }
      }
    }
    await syncBookmarkState()

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
  clearPageOverlay()
  flushReadingSession(false).catch(console.error)
  window.removeEventListener('keyup', handleKeyPress)
  window.removeEventListener('keydown', ignoreKeyPress)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerup', onSelectionPointerUp)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (progressFrame !== null) window.cancelAnimationFrame(progressFrame)
  if (paginationMeasureFrame !== undefined) window.cancelAnimationFrame(paginationMeasureFrame)
  popCataVisible.value = false
  readSettingsVisible.value = false
  scrollObserver?.disconnect()
  scrollObserver = null
  store.flushProgress().catch(console.error)
  store.cleanup()
})

let isLeavingConfirmed = false

onBeforeRouteLeave(async (to, from) => {
  // 如果只是在当前阅读器内部切换 query（如跳转到特定书签或章节位置），不触发离开逻辑
  if (to.name === 'reader' && to.params.id === from.params.id) {
    return true
  }

  if (!isLeavingConfirmed && currentBook.value?.format === 'online' && !isBookInShelf.value) {
    try {
      await ElMessageBox.confirm(
        `是否把《${currentBook.value.name}》加入到书架？`,
        '提示',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'info',
          distinguishCancelAndClose: true,
        }
      )
      // 用户点击“确定”：加入书架
      currentBook.value.inShelf = true
      await updateBookMeta(currentBook.value.id, { inShelf: true })
      await bookshelfStore.loadBooks().catch(console.warn)
      ElMessage.success('已加入书架')
    } catch (action) {
      if (action === 'cancel') {
        // 用户点击“取消”：不加入书架，清理试读产生的临时书籍数据
        const bookId = currentBook.value.id
        await deleteBookFromDB(bookId).catch(console.warn)
        await bookshelfStore.loadBooks().catch(console.warn)
      } else {
        // 用户点击右上角 X、遮罩层或按 ESC：取消退出，留在当前阅读界面
        return false
      }
    }
  }

  isLeavingConfirmed = true
  window.removeEventListener('keyup', handleKeyPress)
  document.removeEventListener('pointerup', onSelectionPointerUp)
  if (currentBook.value && isBookInShelf.value) {
    store.saveProgress(undefined, undefined, true).catch(console.error)
    flushReadingSession(false).catch(console.error)
  }
  return true
})
</script>

<style lang="scss" scoped>
// App.vue 为桌面端路由根节点设置了 height: 100%。此选择器必须比该规则
// 更具体，阅读正文超出首屏时才能按内容撑开，不露出全局主题背景。
:global(.desktop-app .app-content > .chapter-wrapper.chapter-wrapper) {
  height: auto !important;
}

:global(.desktop-app .app-content > .chapter-wrapper.chapter-wrapper.pagination-mode) {
  height: 100% !important;
}

.chapter-wrapper {
  padding: 0;
  width: 100%;
  min-height: 100vh;
  position: relative;

  &.pagination-mode {
    height: 100vh;
    min-height: 0;
    overflow: hidden;

    .chapter.pagination-chapter {
      height: 100%;
      min-height: 0;
      overflow: hidden;

      .page-viewport {
        height: 100%;
        overflow: hidden;
        position: relative;
      }

      .content {
        height: 100%;
        column-width: var(--reader-pagination-page-width);
        column-gap: 0;
        column-fill: auto;
        transition: transform var(--reader-page-transition-duration) cubic-bezier(0.25, 1, 0.5, 1);
        will-change: transform;
      }

      .page-transition-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
        background-color: var(--reader-chapter-bg, inherit);
        z-index: 10;
        will-change: transform, opacity;

        .page-transition-overlay-content {
          height: 100%;
          column-width: var(--reader-pagination-page-width);
          column-gap: 0;
          column-fill: auto;
          pointer-events: none;
          transition: none !important;
        }

        &.page-transition--cover-forward {
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.22);
          animation: reader-page-cover-forward var(--reader-page-transition-duration) cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        &.page-transition--cover-backward {
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.22);
          animation: reader-page-cover-backward var(--reader-page-transition-duration) cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        &.page-transition--sim-forward {
          transform-origin: left center;
          backface-visibility: hidden;
          animation: reader-page-sim-forward var(--reader-page-transition-duration) cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        &.page-transition--sim-backward {
          transform-origin: left center;
          backface-visibility: hidden;
          animation: reader-page-sim-backward var(--reader-page-transition-duration) cubic-bezier(0.25, 1, 0.5, 1) both;
        }

        .page-transition-shadow-gradient {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          background: linear-gradient(to right, rgba(0, 0, 0, 0.16) 0%, rgba(0, 0, 0, 0.04) 15%, transparent 40%);
        }
      }
    }
  }

  .tool-bar {
    position: fixed;
    top: var(--reader-toolbar-top, 0px);
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

    &.page-transition--chapter-fade {
      animation: reader-chapter-fade 200ms ease-out both;
    }

    .content,
    .page-transition-overlay-content {
      font-size: 18px;
      line-height: var(--reader-line-height, 1.8);

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

@keyframes reader-page-cover-forward {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0%);
  }
}

@keyframes reader-page-cover-backward {
  from {
    transform: translateX(0%);
  }
  to {
    transform: translateX(100%);
  }
}

@keyframes reader-page-sim-forward {
  from {
    transform: perspective(1600px) rotateY(0deg);
    box-shadow: 0 0 0 rgba(0, 0, 0, 0);
  }
  to {
    transform: perspective(1600px) rotateY(-88deg) scale(0.96);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
    opacity: 0.15;
  }
}

@keyframes reader-page-sim-backward {
  from {
    transform: perspective(1600px) rotateY(-88deg) scale(0.96);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
    opacity: 0.15;
  }
  to {
    transform: perspective(1600px) rotateY(0deg) scale(1);
    box-shadow: 0 0 0 rgba(0, 0, 0, 0);
    opacity: 1;
  }
}

@keyframes reader-chapter-fade {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-transition-overlay,
  .chapter.pagination-chapter .content,
  .chapter[class*='page-transition--'] {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
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
