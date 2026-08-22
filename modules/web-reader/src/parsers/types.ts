export interface BookChapter {
  index: number
  title: string
  startOffset?: number
  endOffset?: number
  href?: string
}

export interface BookMeta {
  id: string
  name: string
  author: string
  format: 'txt' | 'epub'
  totalChapters: number
  currentChapter: number
  currentProgress: number
  lastReadTime: number
  coverUrl?: string
}

export interface ParsedBook {
  meta: BookMeta
  chapters: BookChapter[]
}

export interface ChapterContentResult {
  html: string
  blobUrls: string[]
}

export interface ReadSettings {
  fontSize: number
  lineHeight: number
  backgroundColor: string
  textColor: string
  fontFamily: string
}

export const DEFAULT_READ_SETTINGS: ReadSettings = {
  fontSize: 18,
  lineHeight: 1.8,
  backgroundColor: '#ffffff',
  textColor: '#333333',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

export interface StoredBook {
  meta: BookMeta
  chapters: BookChapter[]
  fileData: ArrayBuffer
}

