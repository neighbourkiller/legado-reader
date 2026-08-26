import { invoke } from '@tauri-apps/api/core'
import type { BookMeta, ReadSettings, StoredBook } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'
import type {
  BookmarkRecord,
  ChapterCacheSummary,
  DatabaseSnapshot,
  DatabaseStoreName,
  HighlightRecord,
  ReadingRecord,
  ReplaceRuleRecord,
  StorageBackend,
  StorageErrorPayload,
  StoredBookFileInfo,
  StoredChapterContent,
} from './types'
import { DATABASE_STORE_NAMES, StorageError } from './types'

let cachedDeviceId: string | null = null

export function setCachedDeviceId(deviceId: string) {
  cachedDeviceId = deviceId
}

export function getCachedDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  const suffix = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  cachedDeviceId = `tauri-${suffix}`
  return cachedDeviceId
}

function handleIpcError(operation: string, error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    throw new StorageError(error as StorageErrorPayload)
  }
  throw new StorageError({
    code: 'IO',
    operation,
    message: error instanceof Error ? error.message : String(error),
  })
}

// --- Books ---

export async function saveBook(book: StoredBook): Promise<void> {
  try {
    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({
        meta: book.meta,
        chapters: book.chapters,
        hasFileData: Boolean(book.fileData),
      }),
    )

    let fileBytes: Uint8Array
    if (!book.fileData) {
      fileBytes = new Uint8Array(0)
    } else if (book.fileData instanceof Uint8Array) {
      fileBytes = book.fileData
    } else if (book.fileData instanceof ArrayBuffer) {
      fileBytes = new Uint8Array(book.fileData)
    } else {
      fileBytes = new Uint8Array(0)
    }

    const totalLen = 4 + jsonBytes.byteLength + fileBytes.byteLength
    const buffer = new Uint8Array(totalLen)
    const view = new DataView(buffer.buffer)
    view.setUint32(0, jsonBytes.byteLength, true) // 4 字节小端 JSON 长度
    buffer.set(jsonBytes, 4)
    if (fileBytes.byteLength > 0) {
      buffer.set(fileBytes, 4 + jsonBytes.byteLength)
    }

    await invoke('storage_save_book', buffer)
  } catch (err) {
    handleIpcError('saveBook', err)
  }
}

export async function getBook(id: string): Promise<StoredBook | undefined> {
  try {
    const record = await invoke<{
      meta: BookMeta
      chapters: StoredBook['chapters']
      hasFileData: boolean
      fileSize: number
    } | null>('storage_get_book_record', { id })

    if (!record) return undefined

    let fileData: ArrayBuffer | undefined = undefined
    if (record.hasFileData) {
      const fileBytes = await invoke<ArrayBuffer | Uint8Array>('storage_get_book_file', { id })
      if (fileBytes instanceof ArrayBuffer) {
        fileData = fileBytes
      } else if (fileBytes instanceof Uint8Array) {
        fileData = fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength) as ArrayBuffer
      }
    }

    return {
      meta: record.meta,
      chapters: record.chapters,
      fileData,
    }
  } catch (err) {
    handleIpcError('getBook', err)
  }
}

export async function getAllBookMetas(): Promise<BookMeta[]> {
  try {
    return await invoke<BookMeta[]>('storage_get_all_book_metas')
  } catch (err) {
    handleIpcError('getAllBookMetas', err)
  }
}

export async function updateBookMeta(id: string, updates: Partial<BookMeta>): Promise<void> {
  try {
    await invoke('storage_update_book_meta', { id, updates })
  } catch (err) {
    handleIpcError('updateBookMeta', err)
  }
}

export async function deleteBookFromDB(id: string): Promise<void> {
  try {
    await invoke('storage_delete_book', { id })
  } catch (err) {
    handleIpcError('deleteBookFromDB', err)
  }
}

export async function getAllStoredBookFiles(): Promise<StoredBookFileInfo[]> {
  try {
    return await invoke<StoredBookFileInfo[]>('storage_get_all_stored_book_files')
  } catch (err) {
    handleIpcError('getAllStoredBookFiles', err)
  }
}

// --- Bookmarks ---

export async function saveBookmark(bookmark: BookmarkRecord): Promise<void> {
  try {
    await invoke('storage_save_bookmark', {
      bookmark: {
        ...bookmark,
        startOffset: Math.max(0, bookmark.startOffset || 0),
        endOffset: Math.max(bookmark.startOffset || 0, bookmark.endOffset || bookmark.startOffset || 0),
      },
    })
  } catch (err) {
    handleIpcError('saveBookmark', err)
  }
}

export async function getBookmarkAt(
  bookId: string,
  chapterIndex: number,
  chapterPos: number,
  startOffset = 0,
): Promise<BookmarkRecord | undefined> {
  try {
    const res = await invoke<BookmarkRecord | null>('storage_get_bookmark_at', {
      bookId,
      chapterIndex,
      chapterPos,
      startOffset: Math.max(0, startOffset),
    })
    return res ?? undefined
  } catch (err) {
    handleIpcError('getBookmarkAt', err)
  }
}

export async function getAllBookmarks(): Promise<BookmarkRecord[]> {
  try {
    return await invoke<BookmarkRecord[]>('storage_get_all_bookmarks')
  } catch (err) {
    handleIpcError('getAllBookmarks', err)
  }
}

export async function getBookmarksByBookId(bookId: string): Promise<BookmarkRecord[]> {
  try {
    return await invoke<BookmarkRecord[]>('storage_get_bookmarks_by_book_id', { bookId })
  } catch (err) {
    handleIpcError('getBookmarksByBookId', err)
  }
}

export async function deleteBookmark(id: string): Promise<void> {
  try {
    await invoke('storage_delete_bookmark', { id })
  } catch (err) {
    handleIpcError('deleteBookmark', err)
  }
}

// --- Highlights ---

export async function saveHighlight(highlight: HighlightRecord): Promise<void> {
  try {
    await invoke('storage_save_highlight', { highlight })
  } catch (err) {
    handleIpcError('saveHighlight', err)
  }
}

export async function getHighlightsByBookId(bookId: string): Promise<HighlightRecord[]> {
  try {
    return await invoke<HighlightRecord[]>('storage_get_highlights_by_book_id', { bookId })
  } catch (err) {
    handleIpcError('getHighlightsByBookId', err)
  }
}

export async function getHighlightsByChapter(
  bookId: string,
  chapterIndex: number,
): Promise<HighlightRecord[]> {
  try {
    return await invoke<HighlightRecord[]>('storage_get_highlights_by_chapter', { bookId, chapterIndex })
  } catch (err) {
    handleIpcError('getHighlightsByChapter', err)
  }
}

export async function deleteHighlight(id: string): Promise<void> {
  try {
    await invoke('storage_delete_highlight', { id })
  } catch (err) {
    handleIpcError('deleteHighlight', err)
  }
}

// --- Replace Rules ---

export async function saveReplaceRule(rule: ReplaceRuleRecord): Promise<void> {
  try {
    await invoke('storage_save_replace_rule', { rule })
  } catch (err) {
    handleIpcError('saveReplaceRule', err)
  }
}

export async function getAllReplaceRules(): Promise<ReplaceRuleRecord[]> {
  try {
    return await invoke<ReplaceRuleRecord[]>('storage_get_all_replace_rules')
  } catch (err) {
    handleIpcError('getAllReplaceRules', err)
  }
}

export async function deleteReplaceRule(id: number): Promise<void> {
  try {
    await invoke('storage_delete_replace_rule', { id })
  } catch (err) {
    handleIpcError('deleteReplaceRule', err)
  }
}

// --- Reading Records ---

export async function addReadingTime(
  book: Pick<BookMeta, 'id' | 'name' | 'author'>,
  duration: number,
  timestamp = Date.now(),
): Promise<void> {
  try {
    await invoke('storage_add_reading_time', {
      args: {
        bookId: book.id,
        bookName: book.name,
        bookAuthor: book.author,
        duration: Math.max(0, duration),
        timestamp,
        deviceId: getCachedDeviceId(),
      },
    })
  } catch (err) {
    handleIpcError('addReadingTime', err)
  }
}

export async function getAllReadingRecords(): Promise<ReadingRecord[]> {
  try {
    return await invoke<ReadingRecord[]>('storage_get_all_reading_records')
  } catch (err) {
    handleIpcError('getAllReadingRecords', err)
  }
}

export async function deleteReadingRecord(bookId: string): Promise<void> {
  try {
    await invoke('storage_delete_reading_record', { bookId })
  } catch (err) {
    handleIpcError('deleteReadingRecord', err)
  }
}

export async function clearReadingRecords(): Promise<void> {
  try {
    await invoke('storage_clear_reading_records')
  } catch (err) {
    handleIpcError('clearReadingRecords', err)
  }
}

// --- Chapter Contents ---

export async function saveChapterContent(content: {
  bookId: string
  chapterIndex: number
  title: string
  content: string
  sourceUrl?: string
  chapterUrl?: string
}): Promise<void> {
  try {
    const key = `${content.bookId}:${content.chapterIndex}`
    await invoke('storage_save_chapter_content', {
      content: {
        ...content,
        key,
        downloadedAt: Date.now(),
      },
    })
  } catch (err) {
    handleIpcError('saveChapterContent', err)
  }
}

export async function getChapterContent(
  bookId: string,
  chapterIndex: number,
  sourceUrl?: string,
  chapterUrl?: string,
): Promise<string | null> {
  try {
    const res = await invoke<string | null>('storage_get_chapter_content', {
      bookId,
      chapterIndex,
      sourceUrl: sourceUrl || null,
      chapterUrl: chapterUrl || null,
    })
    return res ?? null
  } catch (err) {
    handleIpcError('getChapterContent', err)
  }
}

export async function getBookChapterContents(bookId: string): Promise<StoredChapterContent[]> {
  try {
    return await invoke<StoredChapterContent[]>('storage_get_book_chapter_contents', { bookId })
  } catch (err) {
    handleIpcError('getBookChapterContents', err)
  }
}

export async function getChapterCacheSummaries(): Promise<ChapterCacheSummary[]> {
  try {
    return await invoke<ChapterCacheSummary[]>('storage_get_chapter_cache_summaries')
  } catch (err) {
    handleIpcError('getChapterCacheSummaries', err)
  }
}

export async function deleteBookChapterContents(bookId: string): Promise<void> {
  try {
    await invoke('storage_delete_book_chapter_contents', { bookId })
  } catch (err) {
    handleIpcError('deleteBookChapterContents', err)
  }
}

export async function clearChapterContents(): Promise<void> {
  try {
    await invoke('storage_clear_chapter_contents')
  } catch (err) {
    handleIpcError('clearChapterContents', err)
  }
}

// --- Settings ---

export async function saveSettings(settings: ReadSettings): Promise<void> {
  try {
    await invoke('storage_save_settings', { settings })
  } catch (err) {
    handleIpcError('saveSettings', err)
  }
}

export async function loadSettings(): Promise<ReadSettings> {
  try {
    const res = await invoke<ReadSettings | null>('storage_load_settings')
    if (res) {
      return {
        ...DEFAULT_READ_SETTINGS,
        ...res,
        spacing: {
          ...DEFAULT_READ_SETTINGS.spacing,
          ...(res.spacing || {}),
        },
      }
    }
    return { ...DEFAULT_READ_SETTINGS }
  } catch (err) {
    handleIpcError('loadSettings', err)
  }
}

// --- Book Sources ---

export async function saveBookSource(source: Record<string, unknown>): Promise<void> {
  try {
    await invoke('storage_save_book_source', { source })
  } catch (err) {
    handleIpcError('saveBookSource', err)
  }
}

export async function getAllBookSources(): Promise<Record<string, unknown>[]> {
  try {
    return await invoke<Record<string, unknown>[]>('storage_get_all_book_sources')
  } catch (err) {
    handleIpcError('getAllBookSources', err)
  }
}

export async function deleteBookSource(bookSourceUrl: string): Promise<void> {
  try {
    await invoke('storage_delete_book_source', { bookSourceUrl })
  } catch (err) {
    handleIpcError('deleteBookSource', err)
  }
}

export async function importBookSources(sources: Record<string, unknown>[]): Promise<number> {
  try {
    return await invoke<number>('storage_import_book_sources', { sources })
  } catch (err) {
    handleIpcError('importBookSources', err)
  }
}

// --- Snapshot & Session Export / Staging Import ---

export async function exportSnapshotViaSession(): Promise<{
  snapshot: DatabaseSnapshot
  preferences: Record<string, string>
  readBookFile: (bookId: string) => Promise<ArrayBuffer>
  closeSession: () => Promise<void>
}> {
  try {
    const token = await invoke<string>('storage_backup_export_begin')
    const closeSession = async () => {
      await invoke('storage_backup_export_end', { token }).catch(() => {})
    }

    try {
      const snapshot: DatabaseSnapshot = {}
      const PAGE_SIZE = 500

      for (const storeName of DATABASE_STORE_NAMES) {
        const records: any[] = []
        let offset = 0
        while (true) {
          const batch = await invoke<any[]>('storage_backup_export_read_store', {
            token,
            storeName,
            offset,
            limit: PAGE_SIZE,
          })
          records.push(...batch)
          if (batch.length < PAGE_SIZE) break
          offset += batch.length
        }
        snapshot[storeName] = records as any
      }

      const preferences = await invoke<Record<string, string>>(
        'storage_backup_export_read_app_preferences',
        { token },
      )

      const readBookFile = async (bookId: string): Promise<ArrayBuffer> => {
        const res = await invoke<ArrayBuffer | Uint8Array>('storage_backup_export_read_book_file', {
          token,
          bookId,
        })
        if (res instanceof ArrayBuffer) return res
        return res.buffer.slice(res.byteOffset, res.byteOffset + res.byteLength) as ArrayBuffer
      }

      return { snapshot, preferences, readBookFile, closeSession }
    } catch (err) {
      await closeSession()
      throw err
    }
  } catch (err) {
    handleIpcError('exportSnapshotViaSession', err)
  }
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function importSnapshotViaStaging(
  snapshot: DatabaseSnapshot,
  clearStores: DatabaseStoreName[],
  preferences: Record<string, string | null> = {},
  bookFiles: Map<string, ArrayBuffer | Uint8Array> = new Map(),
  expectedBookChecksums?: Record<string, string>,
): Promise<void> {
  let committed = false
  let token: string | null = null

  try {
    token = await invoke<string>('storage_staging_create')
    const BATCH_SIZE = 200
    const expectedCounts: Record<string, number> = {}

    for (const [storeName, records] of Object.entries(snapshot)) {
      if (Array.isArray(records) && records.length > 0) {
        expectedCounts[storeName] = records.length
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE)
          await invoke('storage_staging_write_store', {
            token,
            storeName,
            records: batch,
          })
        }
      }
    }

    const calculatedChecksums: Record<string, string> = { ...(expectedBookChecksums ?? {}) }

    // 写入本地书原始 BLOB 数据
    for (const [bookId, fileData] of bookFiles.entries()) {
      const tokenBytes = new TextEncoder().encode(token)
      const idBytes = new TextEncoder().encode(bookId)
      const rawData = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData)
      if (!calculatedChecksums[bookId]) {
        calculatedChecksums[bookId] = await sha256Hex(rawData)
      }
      const totalLen = 4 + tokenBytes.byteLength + 4 + idBytes.byteLength + rawData.byteLength
      const buffer = new Uint8Array(totalLen)
      const view = new DataView(buffer.buffer)
      let offset = 0
      view.setUint32(offset, tokenBytes.byteLength, true)
      offset += 4
      buffer.set(tokenBytes, offset)
      offset += tokenBytes.byteLength
      view.setUint32(offset, idBytes.byteLength, true)
      offset += 4
      buffer.set(idBytes, offset)
      offset += idBytes.byteLength
      buffer.set(rawData, offset)

      await invoke('storage_staging_write_book_file', buffer)
    }

    // 偏好设置：只保留非 null 的 string
    const appPreferences: Record<string, string> = {}
    for (const [k, v] of Object.entries(preferences)) {
      if (typeof v === 'string') {
        appPreferences[k] = v
      }
    }

    // 若存在 legado_web_reader_settings，在同一事务中归一化到 SQLite settings 表
    if (appPreferences['legado_web_reader_settings']) {
      try {
        const parsed = JSON.parse(appPreferences['legado_web_reader_settings'])
        await invoke('storage_staging_write_store', {
          token,
          storeName: 'settings',
          records: [{ key: 'readSettings', ...DEFAULT_READ_SETTINGS, ...parsed }],
        })
        expectedCounts['settings'] = (expectedCounts['settings'] ?? 0) + 1
      } catch (e) {
        console.warn('归一化 legado_web_reader_settings 失败', e)
      }
    }

    await invoke('storage_staging_commit', {
      token,
      clearStores,
      appPreferences,
      expectedCounts: Object.keys(expectedCounts).length > 0 ? expectedCounts : undefined,
      expectedBookChecksums: Object.keys(calculatedChecksums).length > 0 ? calculatedChecksums : undefined,
    })
    committed = true
  } catch (err) {
    handleIpcError('importSnapshotViaStaging', err)
  } finally {
    if (!committed && token) {
      await invoke('storage_staging_abort', { token }).catch(() => {})
    }
  }
}

export async function exportDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const session = await exportSnapshotViaSession()
  try {
    return session.snapshot
  } finally {
    await session.closeSession()
  }
}

export async function importDatabaseSnapshot(
  snapshot: DatabaseSnapshot,
  clearStores: DatabaseStoreName[] = [],
): Promise<void> {
  await importSnapshotViaStaging(snapshot, clearStores)
}

export const sqliteBackend: StorageBackend = {
  saveBook,
  getBook,
  getAllBookMetas,
  updateBookMeta,
  deleteBookFromDB,
  getAllStoredBookFiles,
  saveBookmark,
  getBookmarkAt,
  getAllBookmarks,
  getBookmarksByBookId,
  deleteBookmark,
  saveHighlight,
  getHighlightsByBookId,
  getHighlightsByChapter,
  deleteHighlight,
  saveReplaceRule,
  getAllReplaceRules,
  deleteReplaceRule,
  addReadingTime,
  getAllReadingRecords,
  deleteReadingRecord,
  clearReadingRecords,
  saveChapterContent,
  getChapterContent,
  getBookChapterContents,
  getChapterCacheSummaries,
  deleteBookChapterContents,
  clearChapterContents,
  saveSettings,
  loadSettings,
  saveBookSource,
  getAllBookSources,
  deleteBookSource,
  importBookSources,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  exportSnapshotViaSession,
  importSnapshotViaStaging,
}
