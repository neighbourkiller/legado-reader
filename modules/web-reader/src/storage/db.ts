import type { BookMeta, ReadSettings, StoredBook } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'

const DB_NAME = 'legado-web-reader'
const DB_VERSION = 5

const STORE_BOOKS = 'books'
const STORE_SETTINGS = 'settings'
const STORE_BOOK_SOURCES = 'bookSources'
const STORE_REMOTE_BOOKS = 'remoteBooks'
const STORE_CHAPTER_CONTENTS = 'chapterContents'
const STORE_BOOKMARKS = 'bookmarks'
const STORE_READING_RECORDS = 'readingRecords'

export const DATABASE_STORE_NAMES = [
  STORE_BOOKS,
  STORE_SETTINGS,
  STORE_BOOK_SOURCES,
  STORE_REMOTE_BOOKS,
  STORE_CHAPTER_CONTENTS,
  STORE_BOOKMARKS,
  STORE_READING_RECORDS,
] as const

export type DatabaseStoreName = (typeof DATABASE_STORE_NAMES)[number]
export type DatabaseSnapshot = Partial<Record<DatabaseStoreName, unknown[]>>

const DEVICE_ID_KEY = 'legado_tauri_device_id'

export function getLocalDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)?.trim()
  if (existing) return existing
  const suffix = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const deviceId = `tauri-${suffix}`
  localStorage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}

export interface BookmarkRecord {
  id: string
  bookId: string
  bookName: string
  bookAuthor: string
  chapterIndex: number
  chapterPos: number
  chapterTitle: string
  content: string
  /** Android 书签备注；正文摘录仍保存在 content。 */
  note?: string
  /** Android 的原始章节字符位置，正文加载后再换算为段落索引。 */
  androidChapterPos?: number
  createdAt: number
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
}

let cachedDb: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (cachedDb) {
    try {
      // 检查连接是否可用
      cachedDb.transaction(STORE_SETTINGS, 'readonly')
      return Promise.resolve(cachedDb)
    } catch {
      // 连接已失效，重置并重新建立
      cachedDb = null
    }
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion

      // v0 -> v1: 原有 Store
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'meta.id' })
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
        }
      }

      // v1 -> v2: 新增书源和远程书籍 Store（Desktop 模式使用）
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_BOOK_SOURCES)) {
          db.createObjectStore(STORE_BOOK_SOURCES, { keyPath: 'bookSourceUrl' })
        }
        if (!db.objectStoreNames.contains(STORE_REMOTE_BOOKS)) {
          db.createObjectStore(STORE_REMOTE_BOOKS, { keyPath: 'id' })
        }
      }

      // v2 -> v3: 网络书籍章节正文离线缓存
      if (oldVersion < 3 && !db.objectStoreNames.contains(STORE_CHAPTER_CONTENTS)) {
        const store = db.createObjectStore(STORE_CHAPTER_CONTENTS, { keyPath: 'key' })
        store.createIndex('bookId', 'bookId', { unique: false })
      }

      // v3 -> v4: 书签与阅读时长记录
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains(STORE_BOOKMARKS)) {
          const store = db.createObjectStore(STORE_BOOKMARKS, { keyPath: 'id' })
          store.createIndex('bookId', 'bookId', { unique: false })
          store.createIndex('location', ['bookId', 'chapterIndex', 'chapterPos'], { unique: true })
        }
        if (!db.objectStoreNames.contains(STORE_READING_RECORDS)) {
          db.createObjectStore(STORE_READING_RECORDS, { keyPath: 'bookId' })
        }
      }

      // v4 -> v5: 阅读时长保留各设备贡献，保证 Android 备份重复导入幂等。
      if (oldVersion < 5 && db.objectStoreNames.contains(STORE_READING_RECORDS)) {
        const store = request.transaction?.objectStore(STORE_READING_RECORDS)
        const cursorRequest = store?.openCursor()
        if (cursorRequest) {
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) return
            const record = cursor.value as ReadingRecord
            if (!record.devices || Object.keys(record.devices).length === 0) {
              record.devices = {
                [getLocalDeviceId()]: {
                  readTime: Math.max(0, record.readTime || 0),
                  lastRead: record.lastRead || Date.now(),
                  author: record.bookAuthor || '',
                },
              }
              cursor.update(record)
            }
            cursor.continue()
          }
        }
      }
    }

    request.onsuccess = () => {
      const db = request.result
      cachedDb = db

      db.onversionchange = () => {
        db.close()
        cachedDb = null
      }
      db.onclose = () => {
        cachedDb = null
      }
      db.onerror = () => {
        cachedDb = null
      }

      resolve(db)
    }

    request.onerror = () => {
      cachedDb = null
      reject(request.error)
    }
  })
}

// --- Book Storage ---

export async function saveBook(book: StoredBook): Promise<void> {
  const db = await openDB()
  const plainRecord = {
    meta: JSON.parse(JSON.stringify(book.meta)),
    chapters: JSON.parse(JSON.stringify(book.chapters)),
    fileData: book.fileData ?? null,
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKS, 'readwrite')
      tx.objectStore(STORE_BOOKS).put(plainRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getBook(id: string): Promise<StoredBook | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKS).get(id)
      request.onsuccess = () => resolve(request.result ?? undefined)
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllBookMetas(): Promise<BookMeta[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKS).getAll()
      request.onsuccess = () => {
        const books = (request.result || []) as StoredBook[]
        resolve(books.map(b => b.meta).filter(Boolean))
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function updateBookMeta(id: string, updates: Partial<BookMeta>): Promise<void> {
  const book = await getBook(id)
  if (!book) return
  book.meta = { ...book.meta, ...updates }
  await saveBook(book)
}

export async function deleteBookFromDB(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_BOOKS, STORE_CHAPTER_CONTENTS], 'readwrite')
      tx.objectStore(STORE_BOOKS).delete(id)
      const chapterStore = tx.objectStore(STORE_CHAPTER_CONTENTS)
      const chapterKeys = chapterStore.index('bookId').getAllKeys(id)
      chapterKeys.onsuccess = () => {
        chapterKeys.result.forEach(key => chapterStore.delete(key))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllStoredBookFiles(): Promise<StoredBookFileInfo[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKS).getAll()
      request.onsuccess = () => {
        const books = (request.result || []) as StoredBook[]
        resolve(
          books
            .filter(book => book.meta?.format !== 'online' && book.fileData)
            .map(book => ({
              id: book.meta.id,
              name: book.meta.name,
              author: book.meta.author,
              format: book.meta.format as 'txt' | 'epub',
              size: book.fileData?.byteLength || 0,
              totalChapters: book.meta.totalChapters,
              lastReadTime: book.meta.lastReadTime,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        )
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Bookmark Storage ---

export async function saveBookmark(bookmark: BookmarkRecord): Promise<void> {
  const db = await openDB()
  const record = JSON.parse(JSON.stringify(bookmark)) as BookmarkRecord
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readwrite')
      tx.objectStore(STORE_BOOKMARKS).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getBookmarkAt(
  bookId: string,
  chapterIndex: number,
  chapterPos: number,
): Promise<BookmarkRecord | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKMARKS).index('location').get([
        bookId,
        chapterIndex,
        chapterPos,
      ])
      request.onsuccess = () => resolve(request.result ?? undefined)
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllBookmarks(): Promise<BookmarkRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKMARKS).getAll()
      request.onsuccess = () => {
        const bookmarks = (request.result || []) as BookmarkRecord[]
        bookmarks.sort((a, b) => b.createdAt - a.createdAt)
        resolve(bookmarks)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getBookmarksByBookId(bookId: string): Promise<BookmarkRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKMARKS).index('bookId').getAll(bookId)
      request.onsuccess = () => {
        const bookmarks = (request.result || []) as BookmarkRecord[]
        bookmarks.sort(
          (a, b) => a.chapterIndex - b.chapterIndex || a.chapterPos - b.chapterPos,
        )
        resolve(bookmarks)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readwrite')
      tx.objectStore(STORE_BOOKMARKS).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Reading Record Storage ---

export async function addReadingTime(
  book: Pick<BookMeta, 'id' | 'name' | 'author'>,
  duration: number,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_READING_RECORDS, 'readwrite')
      const store = tx.objectStore(STORE_READING_RECORDS)
      const request = store.get(book.id)
      request.onsuccess = () => {
        const current = request.result as ReadingRecord | undefined
        const deviceId = getLocalDeviceId()
        const devices = normalizeReadingDevices(current)
        const currentDevice = devices[deviceId]
        devices[deviceId] = {
          readTime: Math.max(0, currentDevice?.readTime || 0) + Math.max(0, duration),
          lastRead: Date.now(),
          author: book.author,
        }
        const aggregate = aggregateReadingDevices(devices)
        store.put({
          bookId: book.id,
          bookName: book.name,
          bookAuthor: book.author,
          readTime: aggregate.readTime,
          lastRead: aggregate.lastRead,
          devices,
        } satisfies ReadingRecord)
      }
      request.onerror = () => reject(request.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllReadingRecords(): Promise<ReadingRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_READING_RECORDS, 'readonly')
      const request = tx.objectStore(STORE_READING_RECORDS).getAll()
      request.onsuccess = () => {
        const records = ((request.result || []) as ReadingRecord[]).map(normalizeReadingRecord)
        records.sort((a, b) => b.lastRead - a.lastRead)
        resolve(records)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export function normalizeReadingDevices(
  record: ReadingRecord | undefined,
): Record<string, ReadingDeviceContribution> {
  if (record?.devices && Object.keys(record.devices).length > 0) {
    return JSON.parse(JSON.stringify(record.devices)) as Record<string, ReadingDeviceContribution>
  }
  if (!record) return {}
  return {
    [getLocalDeviceId()]: {
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

export function normalizeReadingRecord(record: ReadingRecord): ReadingRecord {
  const devices = normalizeReadingDevices(record)
  const aggregate = aggregateReadingDevices(devices)
  return {
    ...record,
    readTime: aggregate.readTime,
    lastRead: aggregate.lastRead,
    devices,
  }
}

export async function deleteReadingRecord(bookId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_READING_RECORDS, 'readwrite')
      tx.objectStore(STORE_READING_RECORDS).delete(bookId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function clearReadingRecords(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_READING_RECORDS, 'readwrite')
      tx.objectStore(STORE_READING_RECORDS).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Online Chapter Content Storage ---

function chapterContentKey(bookId: string, chapterIndex: number): string {
  return `${bookId}:${chapterIndex}`
}

export async function saveChapterContent(
  content: Omit<StoredChapterContent, 'key' | 'downloadedAt'>,
): Promise<void> {
  const db = await openDB()
  const record: StoredChapterContent = {
    ...JSON.parse(JSON.stringify(content)),
    key: chapterContentKey(content.bookId, content.chapterIndex),
    downloadedAt: Date.now(),
  }

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readwrite')
      tx.objectStore(STORE_CHAPTER_CONTENTS).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getChapterContent(
  bookId: string,
  chapterIndex: number,
  sourceUrl?: string,
  chapterUrl?: string,
): Promise<StoredChapterContent | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readonly')
      const request = tx.objectStore(STORE_CHAPTER_CONTENTS).get(
        chapterContentKey(bookId, chapterIndex),
      )
      request.onsuccess = () => {
        const record = request.result as StoredChapterContent | undefined
        if (!record) return resolve(undefined)
        if (sourceUrl && record.sourceUrl && record.sourceUrl !== sourceUrl) {
          return resolve(undefined)
        }
        if (chapterUrl && record.chapterUrl && record.chapterUrl !== chapterUrl) {
          return resolve(undefined)
        }
        resolve(record)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getBookChapterContents(bookId: string): Promise<StoredChapterContent[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readonly')
      const request = tx.objectStore(STORE_CHAPTER_CONTENTS).index('bookId').getAll(bookId)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

function estimateChapterContentSize(record: StoredChapterContent): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength
}

export async function getChapterCacheSummaries(): Promise<ChapterCacheSummary[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_BOOKS, STORE_CHAPTER_CONTENTS], 'readonly')
      const booksRequest = tx.objectStore(STORE_BOOKS).getAll()
      const contentsRequest = tx.objectStore(STORE_CHAPTER_CONTENTS).getAll()
      let books: StoredBook[] = []
      let contents: StoredChapterContent[] = []

      booksRequest.onsuccess = () => { books = booksRequest.result || [] }
      contentsRequest.onsuccess = () => { contents = contentsRequest.result || [] }
      tx.oncomplete = () => {
        const bookMetas = new Map(books.map(book => [book.meta.id, book.meta]))
        const summaries = new Map<string, ChapterCacheSummary>()

        for (const record of contents) {
          const existing = summaries.get(record.bookId)
          if (existing) {
            existing.chapterCount += 1
            existing.size += estimateChapterContentSize(record)
            continue
          }

          const meta = bookMetas.get(record.bookId)
          summaries.set(record.bookId, {
            bookId: record.bookId,
            bookName: meta?.name || '',
            bookAuthor: meta?.author || '',
            chapterCount: 1,
            size: estimateChapterContentSize(record),
          })
        }

        resolve([...summaries.values()].sort((a, b) =>
          (a.bookName || a.bookId).localeCompare(b.bookName || b.bookId, 'zh-CN'),
        ))
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function deleteBookChapterContents(bookId: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readwrite')
      const store = tx.objectStore(STORE_CHAPTER_CONTENTS)
      const chapterKeys = store.index('bookId').getAllKeys(bookId)
      chapterKeys.onsuccess = () => {
        chapterKeys.result.forEach(key => store.delete(key))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function clearChapterContents(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readwrite')
      tx.objectStore(STORE_CHAPTER_CONTENTS).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Settings Storage ---

export async function saveSettings(settings: ReadSettings): Promise<void> {
  const db = await openDB()
  const plainRecord = {
    key: 'readSettings',
    ...JSON.parse(JSON.stringify(settings)),
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite')
      tx.objectStore(STORE_SETTINGS).put(plainRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function loadSettings(): Promise<ReadSettings> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_SETTINGS, 'readonly')
      const request = tx.objectStore(STORE_SETTINGS).get('readSettings')
      request.onsuccess = () => {
        if (request.result) {
          const { key, ...settings } = request.result
          resolve({
            ...DEFAULT_READ_SETTINGS,
            ...settings,
            spacing: {
              ...DEFAULT_READ_SETTINGS.spacing,
              ...(settings.spacing || {}),
            },
          })
        } else {
          resolve({ ...DEFAULT_READ_SETTINGS })
        }
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Book Source Storage (Desktop) ---

export async function saveBookSource(source: Record<string, unknown>): Promise<void> {
  const db = await openDB()
  const plainSource = JSON.parse(JSON.stringify(source))
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite')
      tx.objectStore(STORE_BOOK_SOURCES).put(plainSource)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllBookSources(): Promise<Record<string, unknown>[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOK_SOURCES, 'readonly')
      const request = tx.objectStore(STORE_BOOK_SOURCES).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function deleteBookSource(bookSourceUrl: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite')
      tx.objectStore(STORE_BOOK_SOURCES).delete(bookSourceUrl)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function importBookSources(sources: Record<string, unknown>[]): Promise<number> {
  const db = await openDB()
  const plainSources = JSON.parse(JSON.stringify(sources)) as Record<string, unknown>[]
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite')
      const store = tx.objectStore(STORE_BOOK_SOURCES)
      const uniqueUrls = new Set<string>()
      for (const source of plainSources) {
        store.put(source)
        if (source.bookSourceUrl) {
          uniqueUrls.add(String(source.bookSourceUrl))
        }
      }
      tx.oncomplete = () => resolve(uniqueUrls.size)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

/**
 * 在同一个只读事务中导出全部持久化 store，避免备份跨 store 读取到不一致状态。
 */
export async function exportDatabaseSnapshot(): Promise<DatabaseSnapshot> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([...DATABASE_STORE_NAMES], 'readonly')
      const snapshot: DatabaseSnapshot = {}
      let pending: number = DATABASE_STORE_NAMES.length
      for (const storeName of DATABASE_STORE_NAMES) {
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => {
          snapshot[storeName] = request.result || []
          pending -= 1
        }
        request.onerror = () => reject(request.error)
      }
      tx.oncomplete = () => {
        if (pending === 0) resolve(snapshot)
        else reject(new Error('数据库快照读取不完整'))
      }
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

/**
 * 在一个多 store 事务内写入备份。clearStores 只清理由调用方明确选择的类别。
 */
export async function importDatabaseSnapshot(
  snapshot: DatabaseSnapshot,
  clearStores: DatabaseStoreName[] = [],
): Promise<void> {
  const targetStores = DATABASE_STORE_NAMES.filter(
    storeName => clearStores.includes(storeName) || snapshot[storeName] !== undefined,
  )
  if (targetStores.length === 0) return

  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(targetStores, 'readwrite')
      for (const storeName of targetStores) {
        const store = tx.objectStore(storeName)
        if (clearStores.includes(storeName)) store.clear()
        for (const record of snapshot[storeName] || []) {
          store.put(record)
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}
