export interface BookChapter {
  index: number
  title: string
  startOffset?: number
  endOffset?: number
  href?: string
  isVolume?: boolean
  isVip?: boolean
  isPay?: boolean
  updateTime?: string
  contentType?: 'text' | 'images'
  variableMap?: Record<string, string>
}

export interface BookMeta {
  id: string
  name: string
  author: string
  format: 'txt' | 'epub' | 'online'
  totalChapters: number
  currentChapter: number
  currentProgress: number
  /** Tauri 阅读器中的段落索引，用于桌面端精确恢复。 */
  currentChapterPos?: number
  /** 从 Android 导入、尚未换算为段落索引的章节字符偏移。 */
  legacyChapterCharPos?: number
  lastReadTime: number
  coverUrl?: string
  durChapterTitle?: string
  latestChapterTitle?: string
  sourceUrl?: string
  sourceName?: string
  bookUrl?: string
  tocUrl?: string
  intro?: string
  kind?: string
  /** 是否已加入书架（对于在线书籍，仅浏览或试读未加入书架时为 false） */
  inShelf?: boolean
  /** Android Book.variableMap 兼容字段，随 meta_json/备份自然持久化。 */
  variableMap?: Record<string, string>
}

export interface ParsedBook {
  meta: BookMeta
  chapters: BookChapter[]
}

export interface ChapterContentResult {
  html: string
  blobUrls: string[]
}

export interface SpacingConfig {
  letter: number
  line: number
  paragraph: number
}

export type ReaderPageAnimation = 'cover' | 'slide' | 'simulation' | 'scroll' | 'none'

export interface ReadSettings {
  theme: number
  font: number
  customFontName: string
  customFontUrl?: string
  favoriteFonts?: string[]
  fontSize: number
  spacing: SpacingConfig
  readWidth: number
  contentPaddingTop: number
  contentPaddingBottom: number
  dockHeight: number
  pageAnimation: ReaderPageAnimation
  jumpDuration: number
  progressDisplayMode?: 'percentage' | 'page'
  lineHeight?: number
  backgroundColor?: string
  textColor?: string
  fontFamily?: string
}

export const DEFAULT_READ_SETTINGS: ReadSettings = {
  theme: 1,
  font: 0,
  customFontName: '',
  favoriteFonts: [],
  fontSize: 18,
  spacing: {
    letter: 0,
    line: 0.8,
    paragraph: 1.0,
  },
  readWidth: 800,
  contentPaddingTop: 38,
  contentPaddingBottom: 72,
  dockHeight: 64,
  pageAnimation: 'scroll',
  jumpDuration: 1000,
  progressDisplayMode: 'percentage',
  lineHeight: 1.8,
  backgroundColor: '#ede7da',
  textColor: '#333333',
  fontFamily: 'Microsoft YaHei, PingFangSC-Regular, HelveticaNeue-Light, Helvetica Neue Light, sans-serif',
}

export interface StoredBook {
  meta: BookMeta
  chapters: BookChapter[]
  fileData?: ArrayBuffer | null
}
