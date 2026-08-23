import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BookMeta, BookChapter, ReadSettings } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'
import { getTxtChapterContent, getEpubChapterContent } from '@/parsers'
import {
  getBook,
  updateBookMeta,
  saveSettings,
  loadSettings,
} from '@/storage/db'
import { useBookSourceStore } from '@/stores/bookSource'
import { SourceEngine } from '@/source/engine/SourceEngine'

export interface ChapterPayload {
  index: number
  title: string
  content: string[] | string
  format: 'txt' | 'epub'
}

const SETTINGS_KEY = 'legado_web_reader_settings'

function normalizeSettings(
  ...sources: Array<Partial<ReadSettings> | null | undefined>
): ReadSettings {
  const availableSources = sources.filter(
    (source): source is Partial<ReadSettings> => Boolean(source)
  )

  return {
    ...DEFAULT_READ_SETTINGS,
    ...Object.assign({}, ...availableSources),
    spacing: {
      ...DEFAULT_READ_SETTINGS.spacing,
      ...Object.assign({}, ...availableSources.map(source => source.spacing || {})),
    },
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

export const useReadingStore = defineStore('reading', () => {
  const currentBook = ref<BookMeta | null>(null)
  const chapters = ref<BookChapter[]>([])
  const currentContent = ref('')
  const isLoading = ref(false)
  const fileData = ref<ArrayBuffer | null>(null)
  const settings = ref<ReadSettings>(normalizeSettings(loadLocalSettings()))
  const miniInterface = ref(false)
  const popCataVisible = ref(false)
  const readSettingsVisible = ref(false)

  let activeBlobUrls: string[] = []

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

      currentBook.value = stored.meta
      chapters.value = stored.chapters
      fileData.value = stored.fileData || null

      // Load settings
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
    } finally {
      isLoading.value = false
    }
  }

  async function fetchChapter(index: number): Promise<ChapterPayload | null> {
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
        const rawContent = await engine.getContent(source, chapterHref)
        let paragraphs = rawContent
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
          content: paragraphs.length > 0 ? paragraphs : ['[本章内容为空]'],
          format: 'txt',
        }
      } catch (err: any) {
        return {
          index,
          title: chapter.title,
          content: [`[章节正文加载失败: ${err.message || err}]`],
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

  async function saveProgress(chapterIndex?: number) {
    if (!currentBook.value) return
    const targetIndex = chapterIndex !== undefined ? chapterIndex : currentBook.value.currentChapter
    currentBook.value.currentChapter = targetIndex
    currentBook.value.currentProgress = Math.round(
      ((targetIndex + 1) / (chapters.value.length || 1)) * 100
    )
    currentBook.value.lastReadTime = Date.now()
    if (chapters.value[targetIndex]) {
      currentBook.value.durChapterTitle = chapters.value[targetIndex].title
    }

    await updateBookMeta(currentBook.value.id, {
      currentChapter: currentBook.value.currentChapter,
      currentProgress: currentBook.value.currentProgress,
      durChapterTitle: currentBook.value.durChapterTitle,
      lastReadTime: currentBook.value.lastReadTime,
    })
  }

  async function updateSettings(newSettings: Partial<ReadSettings>) {
    settings.value = normalizeSettings(settings.value, newSettings)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('Failed to write settings to localStorage', e)
    }
    await saveSettings(settings.value)
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
    updateSettings,
    setMiniInterface,
    cleanup,
  }
})
