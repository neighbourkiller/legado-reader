import type { BookMeta, ReadSettings, StoredBook } from '@/parsers/types'

export const DATABASE_STORE_NAMES = [
  'books',
  'settings',
  'bookSources',
  'remoteBooks',
  'chapterContents',
  'bookmarks',
  'readingRecords',
  'highlights',
  'replaceRules',
] as const

export type DatabaseStoreName = (typeof DATABASE_STORE_NAMES)[number]
export type DatabaseSnapshot = Partial<Record<DatabaseStoreName, unknown[]>>

export interface BookmarkRecord {
  id: string
  bookId: string
  bookName: string
  bookAuthor: string
  chapterIndex: number
  chapterPos: number
  /** 当前显示正文内的精确字符起点；旧书签迁移为 0。 */
  startOffset?: number
  /** 选中文字的精确字符终点。 */
  endOffset?: number
  chapterTitle: string
  content: string
  /** Android 书签备注；正文摘录仍保存在 content。 */
  note?: string
  /** Android 的原始章节字符位置，正文加载后再换算为段落索引。 */
  androidChapterPos?: number
  createdAt: number
}

export type HighlightStyleKind = 'background' | 'underline'

export interface HighlightStyleRecord {
  kind: HighlightStyleKind
  color: string
  lineStyle?: 'solid' | 'wavy'
}

export interface HighlightRecord {
  id: string
  bookId: string
  bookName: string
  bookAuthor: string
  bookUrl?: string
  chapterUrl?: string
  chapterIndex: number
  chapterTitle: string
  startOffset: number
  endOffset: number
  startParagraph: number
  endParagraph: number
  text: string
  style: HighlightStyleRecord
  note?: string
  createdAt: number
}

export interface ReplaceRuleRecord {
  id: number
  name: string
  group?: string
  pattern: string
  replacement: string
  scope?: string
  scopeTitle: boolean
  scopeSource: boolean
  scopeContent: boolean
  excludeScope?: string
  isEnabled: boolean
  isRegex: boolean
  timeoutMillisecond: number
  order: number
}

export interface ReadingDeviceContribution {
  readTime: number
  lastRead: number
  author: string
}

export interface ReadingRecord {
  bookId: string
  bookName: string
  bookAuthor: string
  readTime: number
  lastRead: number
  devices?: Record<string, ReadingDeviceContribution>
}

export interface StoredBookFileInfo {
  id: string
  name: string
  author: string
  format: 'txt' | 'epub'
  size: number
  totalChapters: number
  lastReadTime: number
}

export interface StoredChapterContent {
  key: string
  bookId: string
  chapterIndex: number
  title: string
  content: string
  sourceUrl?: string
  chapterUrl?: string
  downloadedAt: number
}

export interface ChapterCacheSummary {
  bookId: string
  bookName: string
  bookAuthor: string
  chapterCount: number
  size: number
  imageCount?: number
  imageSize?: number
}

export interface StorageErrorPayload {
  code: 'INIT_FAILED' | 'NOT_FOUND' | 'INVALID_DATA' | 'CONSTRAINT' | 'IO' | 'TRANSACTION'
  operation: string
  message: string
  entity?: string
}

export class StorageError extends Error {
  code: StorageErrorPayload['code']
  operation: string
  entity?: string

  constructor(payload: StorageErrorPayload) {
    super(`[${payload.code}] ${payload.operation}: ${payload.message}`)
    this.name = 'StorageError'
    this.code = payload.code
    this.operation = payload.operation
    this.entity = payload.entity
  }
}

export function normalizeReadingDevices(
  record: ReadingRecord | undefined,
  fallbackDeviceId?: string,
): Record<string, ReadingDeviceContribution> {
  if (record?.devices && Object.keys(record.devices).length > 0) {
    return JSON.parse(JSON.stringify(record.devices)) as Record<string, ReadingDeviceContribution>
  }
  if (!record) return {}
  const deviceId = fallbackDeviceId || 'unknown-device'
  return {
    [deviceId]: {
      readTime: Math.max(0, record.readTime || 0),
      lastRead: record.lastRead || Date.now(),
      author: record.bookAuthor || '',
    },
  }
}

export function aggregateReadingDevices(
  devices: Record<string, ReadingDeviceContribution>,
): Pick<ReadingRecord, 'readTime' | 'lastRead'> {
  return Object.values(devices).reduce(
    (result, item) => ({
      readTime: result.readTime + Math.max(0, item.readTime || 0),
      lastRead: Math.max(result.lastRead, item.lastRead || 0),
    }),
    { readTime: 0, lastRead: 0 },
  )
}

export function normalizeReadingRecord(
  record: ReadingRecord,
  fallbackDeviceId?: string,
): ReadingRecord {
  const devices = normalizeReadingDevices(record, fallbackDeviceId)
  const aggregate = aggregateReadingDevices(devices)
  return {
    ...record,
    readTime: aggregate.readTime,
    lastRead: aggregate.lastRead,
    devices,
  }
}

export interface ExportSessionHandler {
  snapshot: DatabaseSnapshot
  preferences: Record<string, string>
  readBookFile: (bookId: string) => Promise<ArrayBuffer>
  closeSession: () => Promise<void>
}

export interface StorageBackend {
  // Books
  saveBook(book: StoredBook): Promise<void>
  getBook(id: string): Promise<StoredBook | undefined>
  getAllBookMetas(): Promise<BookMeta[]>
  updateBookMeta(id: string, updates: Partial<BookMeta>): Promise<void>
  deleteBookFromDB(id: string): Promise<void>
  getAllStoredBookFiles(): Promise<StoredBookFileInfo[]>

  // Bookmarks
  saveBookmark(bookmark: BookmarkRecord): Promise<void>
  getBookmarkAt(
    bookId: string,
    chapterIndex: number,
    chapterPos: number,
    startOffset?: number,
  ): Promise<BookmarkRecord | undefined>
  getAllBookmarks(): Promise<BookmarkRecord[]>
  getBookmarksByBookId(bookId: string): Promise<BookmarkRecord[]>
  deleteBookmark(id: string): Promise<void>

  // Highlights
  saveHighlight(highlight: HighlightRecord): Promise<void>
  getHighlightsByBookId(bookId: string): Promise<HighlightRecord[]>
  getHighlightsByChapter(bookId: string, chapterIndex: number): Promise<HighlightRecord[]>
  deleteHighlight(id: string): Promise<void>

  // Replace Rules
  saveReplaceRule(rule: ReplaceRuleRecord): Promise<void>
  getAllReplaceRules(): Promise<ReplaceRuleRecord[]>
  deleteReplaceRule(id: number): Promise<void>

  // Reading Records
  addReadingTime(
    book: Pick<BookMeta, 'id' | 'name' | 'author'>,
    duration: number,
    timestamp?: number,
  ): Promise<void>
  getAllReadingRecords(): Promise<ReadingRecord[]>
  deleteReadingRecord(bookId: string): Promise<void>
  clearReadingRecords(): Promise<void>

  // Chapter Contents
  saveChapterContent(content: {
    bookId: string
    chapterIndex: number
    title: string
    content: string
    sourceUrl?: string
    chapterUrl?: string
  }): Promise<void>
  getChapterContent(
    bookId: string,
    chapterIndex: number,
    sourceUrl?: string,
    chapterUrl?: string
  ): Promise<string | null>
  getBookChapterContents(bookId: string): Promise<StoredChapterContent[]>
  getChapterCacheSummaries(): Promise<ChapterCacheSummary[]>
  deleteBookChapterContents(bookId: string): Promise<void>
  clearChapterContents(): Promise<void>
  clearChapterImages(bookId?: string): Promise<void>

  // Settings
  saveSettings(settings: ReadSettings): Promise<void>
  loadSettings(): Promise<ReadSettings>

  // Book Sources
  saveBookSource(source: Record<string, unknown>): Promise<void>
  getAllBookSources(): Promise<Record<string, unknown>[]>
  deleteBookSource(bookSourceUrl: string): Promise<void>
  importBookSources(sources: Record<string, unknown>[]): Promise<number>

  // Snapshot
  exportDatabaseSnapshot(): Promise<DatabaseSnapshot>
  importDatabaseSnapshot(
    snapshot: DatabaseSnapshot,
    clearStores?: DatabaseStoreName[],
  ): Promise<void>

  exportSnapshotViaSession?(): Promise<ExportSessionHandler>
  importSnapshotViaStaging?(
    snapshot: DatabaseSnapshot,
    clearStores: DatabaseStoreName[],
    preferences?: Record<string, string | null>,
    bookFiles?: Map<string, ArrayBuffer | Uint8Array>,
    expectedBookChecksums?: Record<string, string>,
  ): Promise<void>
}
