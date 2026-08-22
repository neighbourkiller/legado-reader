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

export const useReadingStore = defineStore('reading', () => {
  const currentBook = ref<BookMeta | null>(null)
  const chapters = ref<BookChapter[]>([])
  const currentContent = ref('')
  const isLoading = ref(false)
  const fileData = ref<ArrayBuffer | null>(null)
  const settings = ref<ReadSettings>({ ...DEFAULT_READ_SETTINGS })
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
      fileData.value = stored.fileData

      // Load settings
      settings.value = await loadSettings()

      // Load the chapter content
      await loadChapter(stored.meta.currentChapter)
    } finally {
      isLoading.value = false
    }
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
      currentBook.value.lastReadTime = Date.now()

      await saveProgress()
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

  async function saveProgress() {
    if (!currentBook.value) return
    await updateBookMeta(currentBook.value.id, {
      currentChapter: currentBook.value.currentChapter,
      currentProgress: currentBook.value.currentProgress,
      lastReadTime: currentBook.value.lastReadTime,
    })
  }

  async function updateSettings(newSettings: Partial<ReadSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    await saveSettings(settings.value)
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
    currentChapterTitle,
    progress,
    loadBook,
    loadChapter,
    nextChapter,
    prevChapter,
    saveProgress,
    updateSettings,
    cleanup,
  }
})

