import type { StoredBook } from '@/parsers/types'
import type {
  BookmarkRecord,
  DatabaseSnapshot,
  HighlightRecord,
  ReplaceRuleRecord,
  ReadingRecord,
  StoredChapterContent,
} from '@/storage/db'

export const BACKUP_FORMAT = 'legado-tauri-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_ENTRIES = 10_000
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 512 * 1024 * 1024

export const ANDROID_BACKUP_FILES = [
  'bookSource.json',
  'bookshelf.json',
  'bookmark.json',
  'readRecord.json',
] as const

export const ANDROID_OPTIONAL_BACKUP_FILES = ['highlight.json', 'replaceRule.json'] as const

export const TAURI_DATA_FILE = 'tauri/data.json'
export const TAURI_MANIFEST_FILE = 'tauri/manifest.json'

export type AndroidBackupFile = (typeof ANDROID_BACKUP_FILES)[number]
export type RestoreMode = 'merge' | 'overwrite'
export type BackupKind = 'tauri' | 'android' | 'newer-tauri'

export interface BackupManifestV1 {
  format: typeof BACKUP_FORMAT
  version: 1
  appVersion: string
  createdAt: string
  categories: string[]
  counts: {
    bookSources: number
    onlineBooks: number
    localBooks: number
    bookmarks: number
    readingRecords: number
    chapterContents: number
    highlights: number
    replaceRules: number
  }
  checksums: Record<string, string>
}

export interface TauriBackupBook extends Omit<StoredBook, 'fileData'> {
  fileData?: null
  fileEntry?: string
}

export interface TauriBackupDataV1 {
  version: 1
  database: Omit<DatabaseSnapshot, 'books'> & { books?: TauriBackupBook[] }
  localStorage: Record<string, string | null>
}

export interface AndroidBook {
  bookUrl: string
  tocUrl?: string
  origin: string
  originName?: string
  name: string
  author?: string
  kind?: string | null
  coverUrl?: string | null
  intro?: string | null
  type?: number
  latestChapterTitle?: string | null
  latestChapterTime?: number
  lastCheckTime?: number
  totalChapterNum?: number
  durChapterTitle?: string | null
  durChapterIndex?: number
  durChapterPos?: number
  durChapterTime?: number
  canUpdate?: boolean
  order?: number
  originOrder?: number
  syncTime?: number
  [key: string]: unknown
}

export interface AndroidBookmark {
  time: number
  bookName: string
  bookAuthor: string
  chapterIndex: number
  chapterPos: number
  chapterName: string
  bookText: string
  content: string
}

export interface AndroidReadRecord {
  deviceId: string
  bookName: string
  author?: string
  readTime: number
  lastRead: number
}

export interface AndroidBookHighlight {
  time: number
  bookUrl: string
  chapterUrl: string
  bookName: string
  bookAuthor: string
  chapterIndex: number
  chapterPos: number
  chapterPosEnd: number
  layoutTitleLength: number
  chapterName: string
  bookText: string
  style: string
  note: string
}

export type AndroidReplaceRule = ReplaceRuleRecord

export interface AndroidBackupData {
  bookSources: Record<string, unknown>[]
  books: AndroidBook[]
  bookmarks: AndroidBookmark[]
  readingRecords: AndroidReadRecord[]
  highlights: AndroidBookHighlight[]
  replaceRules: AndroidReplaceRule[]
}

export interface BackupPreview {
  kind: BackupKind
  version?: number
  appVersion?: string
  createdAt?: string
  counts: BackupManifestV1['counts']
  warnings: string[]
  canRestoreTauriData: boolean
  androidData: AndroidBackupData
}

export interface RestoreReport {
  mode: RestoreMode
  restored: BackupManifestV1['counts']
  skippedLocalAndroidBooks: number
  positionFallbacks: number
  warnings: string[]
}

export interface ParsedBackup {
  preview: BackupPreview
  tauriData?: TauriBackupDataV1
  localBookFiles: Map<string, ArrayBuffer>
}

export interface AndroidConversionContext {
  books: StoredBook[]
  chapterContents: StoredChapterContent[]
  bookmarks: BookmarkRecord[]
  readingRecords: ReadingRecord[]
  highlights: HighlightRecord[]
  replaceRules: ReplaceRuleRecord[]
}
