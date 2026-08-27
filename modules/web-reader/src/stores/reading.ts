import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BookMeta, BookChapter, ReadSettings } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'
import { getTxtChapterContent, getEpubChapterContent } from '@/parsers'
import {
  getBook,
  getChapterContent,
  getBookmarksByBookId,
  saveBook,
  saveBookmark,
  saveChapterContent,
  updateBookMeta,
  saveSettings,
  loadSettings,
} from '@/storage/db'
import { useBookSourceStore } from '@/stores/bookSource'
import { SourceEngine } from '@/source/engine/SourceEngine'
import { deserializeOnlineChapterPayload, serializeOnlineChapterPayload } from '@/source/engine/ChapterPayload'
import type { ImageReference } from '@/source/types/BookSource'
import { characterOffsetToParagraphIndex } from '@/backup/compat'
import { platform } from '@/platform/capabilities'
import { downloadAndCacheChapterImages, loadCachedChapterImages } from '@/platform/sourceImages'

export interface ChapterPayload {
  index: number
  title: string
  content: string[] | string | ImageReference[]
  format: 'txt' | 'epub' | 'images'
  embeddedImages?: ImageReference[]
}

export function resolveSyncedReaderTheme(currentTheme: number, dark: boolean): number {
  if (dark) return 6
  return currentTheme === 6 ? 1 : currentTheme
}

const SETTINGS_KEY = 'legado_web_reader_settings'
const READER_PAGE_ANIMATIONS = new Set<ReadSettings['pageAnimation']>([
  'cover',
  'slide',
  'simulation',
  'scroll',
  'none',
])

function normalizeSettings(
  ...sources: Array<Partial<ReadSettings> | null | undefined>
): ReadSettings {
  const availableSources = sources.filter(
    (source): source is Partial<ReadSettings> => Boolean(source)
  )

  const normalized = {
    ...DEFAULT_READ_SETTINGS,
    ...Object.assign({}, ...availableSources),
    spacing: {
      ...DEFAULT_READ_SETTINGS.spacing,
      ...Object.assign({}, ...availableSources.map(source => source.spacing || {})),
    },
  }

  return {
    ...normalized,
    pageAnimation: READER_PAGE_ANIMATIONS.has(normalized.pageAnimation)
      ? normalized.pageAnimation
      : DEFAULT_READ_SETTINGS.pageAnimation,
  }
}

function loadLocalSettings(): Partial<ReadSettings> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed as Partial<ReadSettings>
      }
    }
  } catch (e) {
    console.warn('Failed to read settings from localStorage', e)
  }
  return null
}

function normalizeOnlineContent(rawContent: string, chapterTitle: string): string[] {
  let paragraphs = rawContent
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  if (
    paragraphs.length > 0 &&
    (paragraphs[0] === chapterTitle.trim() ||
      paragraphs[0].replace(/\s+/g, '') === chapterTitle.replace(/\s+/g, ''))
  ) {
    paragraphs = paragraphs.slice(1)
  }

  return paragraphs.length > 0 ? paragraphs : ['[本章内容为空]']
}

async function resolveImportedBookmarkPositions(
  bookId: string,
  chapterIndex: number,
  content: string,
): Promise<void> {
  const bookmarks = await getBookmarksByBookId(bookId)
  const unresolved = bookmarks.filter(
    bookmark => bookmark.chapterIndex === chapterIndex && bookmark.androidChapterPos !== undefined,
  )
  for (const bookmark of unresolved) {
    const chapterPos = characterOffsetToParagraphIndex(
      content,
      bookmark.androidChapterPos || 0,
      bookmark.content,
    )
    await saveBookmark({ ...bookmark, chapterPos, androidChapterPos: undefined }).catch(error => {
      console.warn('换算 Android 书签位置失败', error)
    })
  }
}

let cachedDesktopReadSettings: ReadSettings | null = null

export function setCachedDesktopReadSettings(s: ReadSettings): void {
  cachedDesktopReadSettings = s
}

export const useReadingStore = defineStore('reading', () => {
  const currentBook = ref<BookMeta | null>(null)
  const chapters = ref<BookChapter[]>([])
  const currentContent = ref('')
  const isLoading = ref(false)
  const fileData = ref<ArrayBuffer | null>(null)
  const initialSettings = platform.isDesktop && cachedDesktopReadSettings
    ? cachedDesktopReadSettings
    : normalizeSettings(loadLocalSettings())
  const settings = ref<ReadSettings>(initialSettings)
  const miniInterface = ref(false)
  const popCataVisible = ref(false)
  const readSettingsVisible = ref(false)

  let activeBlobUrls: string[] = []
  let settingsHydrated = false

  function revokeActiveBlobUrls() {
    if (activeBlobUrls.length > 0) {
      activeBlobUrls.forEach(url => URL.revokeObjectURL(url))
      activeBlobUrls = []
    }
  }

  const currentChapterTitle = computed(() => {
    if (!currentBook.value || chapters.value.length === 0) return ''
    const idx = currentBook.value.currentChapter
    return chapters.value[idx]?.title ?? ''
  })

  async function hydrateSettings() {
    if (settingsHydrated) return
    if (platform.isDesktop) {
      if (cachedDesktopReadSettings) {
        settings.value = cachedDesktopReadSettings
      } else {
        settings.value = await loadSettings()
        cachedDesktopReadSettings = settings.value
      }
      settingsHydrated = true
      return
    }

    const dbSettings = await loadSettings()
    const localSettings = loadLocalSettings()
    // localStorage is written synchronously before IndexedDB. Prefer it when
    // present so a failed/older IndexedDB record cannot erase recent changes.
    settings.value = normalizeSettings(dbSettings, localSettings)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('Failed to sync settings to localStorage', e)
    }
    // Migrate settings that older versions only managed to persist locally.
    if (localSettings) {
      await saveSettings(settings.value).catch(err => {
        console.warn('Failed to save migrated settings to IndexedDB', err)
      })
    }
    settingsHydrated = true
  }

  const progress = computed(() => {
    if (!currentBook.value || currentBook.value.totalChapters === 0) return 0
    return Math.round(
      ((currentBook.value.currentChapter + 1) / currentBook.value.totalChapters) * 100
    )
  })

  async function loadBook(id: string) {
    isLoading.value = true
    try {
      const stored = await getBook(id)
      if (!stored) throw new Error('书籍未找到')

      // Android 备份不包含章节目录。网络书第一次打开时使用对应书源补齐，
      // 后续仍走本地缓存，不要求修改 Android 端的生产备份逻辑。
      if (stored.meta.format === 'online' && stored.chapters.length === 0) {
        const sourceUrl = stored.meta.sourceUrl
        if (!sourceUrl || !stored.meta.bookUrl) {
          throw new Error('从安卓恢复的网络书籍缺少书源或详情页地址')
        }
        const bookSourceStore = useBookSourceStore()
        if (bookSourceStore.sources.length === 0) await bookSourceStore.loadSources()
        const source = bookSourceStore.sources.find(item => item.bookSourceUrl === sourceUrl)
        if (!source) {
          throw new Error(`无法补齐目录：未找到对应书源 ${stored.meta.sourceName || sourceUrl}`)
        }
        const engine = new SourceEngine()
        let tocUrl = stored.meta.tocUrl || stored.meta.bookUrl
        try {
          const info = await engine.getBookInfo(source, stored.meta.bookUrl)
          if (info.tocUrl) tocUrl = info.tocUrl
          if (info.coverUrl) stored.meta.coverUrl = info.coverUrl
          if (info.intro) stored.meta.intro = info.intro
        } catch (error) {
          console.warn('恢复书籍时刷新详情失败，继续尝试已有目录地址', error)
        }
        const rawChapters = await engine.getToc(source, tocUrl)
        if (rawChapters.length === 0) throw new Error('对应书源未返回章节目录')
        stored.chapters = rawChapters.map((chapter, index) => ({
          index,
          title: chapter.name,
          href: chapter.url,
          isVolume: chapter.isVolume,
          isVip: chapter.isVip,
          isPay: chapter.isPay,
          updateTime: chapter.updateTime,
          contentType: source.bookSourceType === 2 ? 'images' : 'text',
        }))
        stored.meta.tocUrl = tocUrl
        stored.meta.totalChapters = stored.chapters.length
        stored.meta.currentChapter = Math.min(
          Math.max(0, stored.meta.currentChapter),
          stored.chapters.length - 1,
        )
        stored.meta.latestChapterTitle = stored.chapters[stored.chapters.length - 1]?.title
        await saveBook(stored)
      }

      currentBook.value = stored.meta
      chapters.value = stored.chapters
      fileData.value = stored.fileData || null

      await hydrateSettings()
    } finally {
      isLoading.value = false
    }
  }

  async function fetchChapter(
    index: number,
    options: { forceRefresh?: boolean } = {},
  ): Promise<ChapterPayload | null> {
    if (!currentBook.value) return null
    if (currentBook.value.format !== 'online' && !fileData.value) return null
    if (index < 0 || index >= chapters.value.length) return null

    const chapter = chapters.value[index]
    if (!chapter) return null

    if (currentBook.value.format === 'online') {
      const sourceUrl = currentBook.value.sourceUrl
      const chapterHref = chapter.href
      if (!sourceUrl || !chapterHref) {
        return {
          index,
          title: chapter.title,
          content: ['[该章节暂无有效链接或书源信息缺失]'],
          format: 'txt',
        }
      }

      if (!options.forceRefresh) {
        const cached = await getChapterContent(
          currentBook.value.id,
          index,
          sourceUrl,
          chapterHref,
        )
        if (cached) {
          const cachedPayload = deserializeOnlineChapterPayload(cached)
          if (cachedPayload.type === 'images') {
            const materialized = await loadCachedChapterImages(
              currentBook.value.id, index, cachedPayload.images.length,
            )
            if (materialized) {
              activeBlobUrls.push(...materialized.blobUrls)
              return {
                index, title: cachedPayload.title || chapter.title,
                content: materialized.images, format: 'images',
              }
            }
          }
          let embeddedImages: ImageReference[] | undefined
          if (cachedPayload.type === 'text' && cachedPayload.embeddedImages?.length) {
            const materialized = await loadCachedChapterImages(
              currentBook.value.id, index, cachedPayload.embeddedImages.length,
            )
            if (materialized) {
              activeBlobUrls.push(...materialized.blobUrls)
              embeddedImages = materialized.images
            } else if (platform.isDesktop) {
              // 清单存在而 BLOB 缺失时重新走网络，不把章节误判为完整离线。
              embeddedImages = undefined
            }
          }
          if (cachedPayload.type === 'text' && (!cachedPayload.embeddedImages?.length || embeddedImages)) {
          await resolveImportedBookmarkPositions(
            currentBook.value.id,
            index,
            normalizeOnlineContent(cachedPayload.text, chapter.title).join('\n'),
          )
          return {
            index,
            title: chapter.title,
            content: normalizeOnlineContent(cachedPayload.text, chapter.title),
            format: 'txt',
            embeddedImages,
          }
          }
        }
      }

      const bookSourceStore = useBookSourceStore()
      if (bookSourceStore.sources.length === 0) {
        await bookSourceStore.loadSources()
      }
      const source = bookSourceStore.sources.find(s => s.bookSourceUrl === sourceUrl)
      if (!source) {
        return {
          index,
          title: chapter.title,
          content: [`[未找到对应书源: ${currentBook.value.sourceName || sourceUrl}，请检查书源是否已启用]`],
          format: 'txt',
        }
      }

      try {
        const engine = new SourceEngine()
        const onlinePayload = await engine.getContent(source, chapterHref)
        if (onlinePayload.type === 'images') {
          const materialized = await downloadAndCacheChapterImages(
            engine, source, currentBook.value.id, index, onlinePayload,
          )
          activeBlobUrls.push(...materialized.blobUrls)
          await saveChapterContent({
            bookId: currentBook.value.id,
            chapterIndex: index,
            title: chapter.title,
            content: serializeOnlineChapterPayload(onlinePayload),
            sourceUrl,
            chapterUrl: chapterHref,
          })
          return {
            index, title: onlinePayload.title || chapter.title,
            content: materialized.images, format: 'images',
          }
        }
        const serialized = serializeOnlineChapterPayload(onlinePayload)
        let embeddedImages = onlinePayload.embeddedImages
        if (embeddedImages?.length) {
          const materialized = await downloadAndCacheChapterImages(engine, source, currentBook.value.id, index, {
            type: 'images', images: embeddedImages, sourceUrl: chapterHref,
          })
          activeBlobUrls.push(...materialized.blobUrls)
          embeddedImages = materialized.images
        }
        if (onlinePayload.text.trim()) {
          await saveChapterContent({
            bookId: currentBook.value.id,
            chapterIndex: index,
            title: chapter.title,
            content: serialized,
            sourceUrl,
            chapterUrl: chapterHref,
          })
        }

        await resolveImportedBookmarkPositions(currentBook.value.id, index,
          normalizeOnlineContent(onlinePayload.text, chapter.title).join('\n'))

        return {
          index,
          title: chapter.title,
          content: normalizeOnlineContent(onlinePayload.text, chapter.title),
          format: 'txt',
          embeddedImages,
        }
      } catch (err: unknown) {
        if (options.forceRefresh) throw err
        const message = err instanceof Error ? err.message : String(err)
        return {
          index,
          title: chapter.title,
          content: [`[章节正文加载失败: ${message}]`],
          format: 'txt',
        }
      }
    }

    if (currentBook.value.format === 'txt' && fileData.value) {
      const raw = getTxtChapterContent(fileData.value, chapter)
      let paragraphs = raw
        .split(/\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)

      // 去除第一行重复的章节标题
      if (
        paragraphs.length > 0 &&
        (paragraphs[0] === chapter.title.trim() ||
          paragraphs[0].replace(/\s+/g, '') === chapter.title.replace(/\s+/g, ''))
      ) {
        paragraphs = paragraphs.slice(1)
      }

      return {
        index,
        title: chapter.title,
        content: paragraphs.length > 0 ? paragraphs : [chapter.title],
        format: 'txt',
      }
    } else if (currentBook.value.format === 'epub' && fileData.value) {
      const result = await getEpubChapterContent(fileData.value, chapter)
      activeBlobUrls.push(...result.blobUrls)
      return {
        index,
        title: chapter.title,
        content: result.html,
        format: 'epub',
      }
    }

    return null
  }

  async function loadChapter(index: number) {
    if (!currentBook.value || !fileData.value) return
    if (index < 0 || index >= chapters.value.length) return

    isLoading.value = true
    try {
      const chapter = chapters.value[index]

      if (currentBook.value.format === 'txt') {
        revokeActiveBlobUrls()
        currentContent.value = getTxtChapterContent(fileData.value, chapter)
      } else if (currentBook.value.format === 'epub') {
        const result = await getEpubChapterContent(fileData.value, chapter)
        revokeActiveBlobUrls()
        activeBlobUrls = result.blobUrls
        currentContent.value = result.html
      }

      currentBook.value.currentChapter = index
      currentBook.value.currentProgress = Math.round(
        ((index + 1) / chapters.value.length) * 100
      )
      currentBook.value.durChapterTitle = chapter.title
      currentBook.value.lastReadTime = Date.now()

      await saveProgress(index)
    } finally {
      isLoading.value = false
    }
  }

  async function nextChapter() {
    if (!currentBook.value) return
    const next = currentBook.value.currentChapter + 1
    if (next < chapters.value.length) {
      await loadChapter(next)
    }
  }

  async function prevChapter() {
    if (!currentBook.value) return
    const prev = currentBook.value.currentChapter - 1
    if (prev >= 0) {
      await loadChapter(prev)
    }
  }

  let progressThrottleTimer: ReturnType<typeof setTimeout> | null = null
  let pendingProgressMeta: { id: string; updates: Partial<BookMeta> } | null = null

  async function flushProgress(): Promise<void> {
    if (progressThrottleTimer) {
      clearTimeout(progressThrottleTimer)
      progressThrottleTimer = null
    }
    if (pendingProgressMeta) {
      const { id, updates } = pendingProgressMeta
      pendingProgressMeta = null
      await updateBookMeta(id, updates).catch(err => {
        console.warn('刷新最新阅读进度失败:', err)
      })
    }
  }

  async function saveProgress(
    chapterIndex?: number,
    chapterPos?: number,
    immediate = false,
  ) {
    if (!currentBook.value) return
    const prevChapter = currentBook.value.currentChapter
    const targetIndex = chapterIndex !== undefined ? chapterIndex : currentBook.value.currentChapter
    currentBook.value.currentChapter = targetIndex
    currentBook.value.currentProgress = Math.round(
      ((targetIndex + 1) / (chapters.value.length || 1)) * 100
    )
    currentBook.value.lastReadTime = Date.now()
    if (chapterPos !== undefined && Number.isInteger(chapterPos) && chapterPos >= 0) {
      currentBook.value.currentChapterPos = chapterPos
      currentBook.value.legacyChapterCharPos = undefined
    }
    if (chapters.value[targetIndex]) {
      currentBook.value.durChapterTitle = chapters.value[targetIndex].title
    }

    const updates: Partial<BookMeta> = {
      currentChapter: currentBook.value.currentChapter,
      currentProgress: currentBook.value.currentProgress,
      durChapterTitle: currentBook.value.durChapterTitle,
      currentChapterPos: currentBook.value.currentChapterPos,
      legacyChapterCharPos: currentBook.value.legacyChapterCharPos,
      lastReadTime: currentBook.value.lastReadTime,
    }

    // 章节切换或指定 immediate 时立即落盘
    if (immediate || prevChapter !== targetIndex) {
      await flushProgress()
      await updateBookMeta(currentBook.value.id, updates)
      return
    }

    pendingProgressMeta = { id: currentBook.value.id, updates }

    // 500ms leading / trailing 节流：若定时器未激活，先立即保存一次（leading），并在 500ms 后补提最新一次（trailing）
    if (!progressThrottleTimer) {
      await updateBookMeta(currentBook.value.id, updates).catch(err => {
        console.warn('保存阅读进度失败:', err)
      })
      progressThrottleTimer = setTimeout(async () => {
        progressThrottleTimer = null
        if (pendingProgressMeta) {
          const p = pendingProgressMeta
          pendingProgressMeta = null
          await updateBookMeta(p.id, p.updates).catch(console.warn)
        }
      }, 500)
    }
  }

  async function updateSettings(newSettings: Partial<ReadSettings>) {
    settings.value = normalizeSettings(settings.value, newSettings)
    if (platform.isDesktop) {
      cachedDesktopReadSettings = settings.value
    } else {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
      } catch (e) {
        console.warn('Failed to write settings to localStorage', e)
      }
    }
    await saveSettings(settings.value)
  }

  async function syncThemeWithGlobal(dark: boolean) {
    await hydrateSettings()
    const theme = resolveSyncedReaderTheme(settings.value.theme, dark)
    if (theme === settings.value.theme) return
    await updateSettings({ theme })
  }

  function setMiniInterface(val: boolean) {
    miniInterface.value = val
  }

  function cleanup() {
    revokeActiveBlobUrls()
    currentBook.value = null
    chapters.value = []
    currentContent.value = ''
    fileData.value = null
  }

  function revokeChapterAssets() {
    revokeActiveBlobUrls()
  }

  return {
    currentBook,
    chapters,
    currentContent,
    isLoading,
    settings,
    miniInterface,
    popCataVisible,
    readSettingsVisible,
    currentChapterTitle,
    progress,
    loadBook,
    fetchChapter,
    loadChapter,
    nextChapter,
    prevChapter,
    saveProgress,
    flushProgress,
    updateSettings,
    syncThemeWithGlobal,
    setMiniInterface,
    cleanup,
    revokeChapterAssets,
  }
})
