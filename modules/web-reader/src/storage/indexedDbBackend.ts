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
  StoredBookFileInfo,
  StoredChapterContent,
  ExportSessionHandler,
} from './types'
import {
  DATABASE_STORE_NAMES,
  StorageError,
  aggregateReadingDevices,
  normalizeReadingDevices,
  normalizeReadingRecord,
} from './types'

const DB_NAME = 'legado-web-reader'
const DB_VERSION = 6

const STORE_BOOKS = 'books'
const STORE_SETTINGS = 'settings'
const STORE_BOOK_SOURCES = 'bookSources'
const STORE_REMOTE_BOOKS = 'remoteBooks'
const STORE_CHAPTER_CONTENTS = 'chapterContents'
const STORE_BOOKMARKS = 'bookmarks'
const STORE_READING_RECORDS = 'readingRecords'
const STORE_HIGHLIGHTS = 'highlights'
const STORE_REPLACE_RULES = 'replaceRules'

const DEVICE_ID_KEY = 'legado_tauri_device_id'

export function getLocalDeviceId(): string {
  const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_ID_KEY)?.trim() : null
  if (existing) return existing
  const suffix = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const deviceId = `tauri-${suffix}`
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

let cachedDb: IDBDatabase | null = null

export function openDB(): Promise<IDBDatabase> {
  if (cachedDb) {
    try {
      cachedDb.transaction(STORE_SETTINGS, 'readonly')
      return Promise.resolve(cachedDb)
    } catch {
      cachedDb = null
    }
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion

      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'meta.id' })
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
        }
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_BOOK_SOURCES)) {
          db.createObjectStore(STORE_BOOK_SOURCES, { keyPath: 'bookSourceUrl' })
        }
        if (!db.objectStoreNames.contains(STORE_REMOTE_BOOKS)) {
          db.createObjectStore(STORE_REMOTE_BOOKS, { keyPath: 'id' })
        }
      }

      if (oldVersion < 3 && !db.objectStoreNames.contains(STORE_CHAPTER_CONTENTS)) {
        const store = db.createObjectStore(STORE_CHAPTER_CONTENTS, { keyPath: 'key' })
        store.createIndex('bookId', 'bookId', { unique: false })
      }

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

      if (oldVersion < 6) {
        if (db.objectStoreNames.contains(STORE_BOOKMARKS)) {
          const store = request.transaction?.objectStore(STORE_BOOKMARKS)
          if (store) {
            if (store.indexNames.contains('location')) store.deleteIndex('location')
            store.createIndex('location', ['bookId', 'chapterIndex', 'chapterPos'], { unique: false })
            store.createIndex(
              'anchor',
              ['bookId', 'chapterIndex', 'chapterPos', 'startOffset'],
              { unique: true },
            )
            const cursorRequest = store.openCursor()
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result
              if (!cursor) return
              const bookmark = cursor.value as BookmarkRecord
              bookmark.startOffset = Math.max(0, bookmark.startOffset || 0)
              bookmark.endOffset = Math.max(bookmark.startOffset, bookmark.endOffset || bookmark.startOffset)
              cursor.update(bookmark)
              cursor.continue()
            }
          }
        }
        if (!db.objectStoreNames.contains(STORE_HIGHLIGHTS)) {
          const store = db.createObjectStore(STORE_HIGHLIGHTS, { keyPath: 'id' })
          store.createIndex('bookId', 'bookId', { unique: false })
          store.createIndex('bookChapter', ['bookId', 'chapterIndex'], { unique: false })
        }
        if (!db.objectStoreNames.contains(STORE_REPLACE_RULES)) {
          const store = db.createObjectStore(STORE_REPLACE_RULES, { keyPath: 'id' })
          store.createIndex('order', 'order', { unique: false })
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
  const record = JSON.parse(JSON.stringify({
    ...bookmark,
    startOffset: Math.max(0, bookmark.startOffset || 0),
    endOffset: Math.max(bookmark.startOffset || 0, bookmark.endOffset || bookmark.startOffset || 0),
  })) as BookmarkRecord
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
  startOffset = 0,
): Promise<BookmarkRecord | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_BOOKMARKS, 'readonly')
      const request = tx.objectStore(STORE_BOOKMARKS).index('anchor').get([
        bookId,
        chapterIndex,
        chapterPos,
        Math.max(0, startOffset),
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
        const list = (request.result || []) as BookmarkRecord[]
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        resolve(list)
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
        bookmarks.sort((a, b) => {
          if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex
          if (a.chapterPos !== b.chapterPos) return a.chapterPos - b.chapterPos
          const aOffset = a.startOffset ?? 0
          const bOffset = b.startOffset ?? 0
          if (aOffset !== bOffset) return aOffset - bOffset
          return (a.createdAt || 0) - (b.createdAt || 0)
        })
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

// --- Highlight Storage ---

export async function saveHighlight(highlight: HighlightRecord): Promise<void> {
  const db = await openDB()
  const plainRecord = JSON.parse(JSON.stringify(highlight)) as HighlightRecord
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_HIGHLIGHTS, 'readwrite')
      tx.objectStore(STORE_HIGHLIGHTS).put(plainRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getHighlightsByBookId(bookId: string): Promise<HighlightRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_HIGHLIGHTS, 'readonly')
      const request = tx.objectStore(STORE_HIGHLIGHTS).index('bookId').getAll(bookId)
      request.onsuccess = () => {
        const highlights = (request.result || []) as HighlightRecord[]
        highlights.sort((a, b) => {
          if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex
          if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
          return (a.createdAt || 0) - (b.createdAt || 0)
        })
        resolve(highlights)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getHighlightsByChapter(
  bookId: string,
  chapterIndex: number,
): Promise<HighlightRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_HIGHLIGHTS, 'readonly')
      const request = tx.objectStore(STORE_HIGHLIGHTS).index('bookChapter').getAll([bookId, chapterIndex])
      request.onsuccess = () => {
        const highlights = (request.result || []) as HighlightRecord[]
        highlights.sort((a, b) => {
          if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
          return (a.createdAt || 0) - (b.createdAt || 0)
        })
        resolve(highlights)
      }
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_HIGHLIGHTS, 'readwrite')
      tx.objectStore(STORE_HIGHLIGHTS).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

// --- Replace Rule Storage ---

export async function saveReplaceRule(rule: ReplaceRuleRecord): Promise<void> {
  const db = await openDB()
  const plainRule = JSON.parse(JSON.stringify(rule)) as ReplaceRuleRecord
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_REPLACE_RULES, 'readwrite')
      tx.objectStore(STORE_REPLACE_RULES).put(plainRule)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function getAllReplaceRules(): Promise<ReplaceRuleRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_REPLACE_RULES, 'readonly')
      const request = tx.objectStore(STORE_REPLACE_RULES).index('order').getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    } catch (err) {
      cachedDb = null
      reject(err)
    }
  })
}

export async function deleteReplaceRule(id: number): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_REPLACE_RULES, 'readwrite')
      tx.objectStore(STORE_REPLACE_RULES).delete(id)
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
  timestamp = Date.now(),
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
        const devices = normalizeReadingDevices(current, deviceId)
        const currentDevice = devices[deviceId]
        devices[deviceId] = {
          readTime: Math.max(0, currentDevice?.readTime || 0) + Math.max(0, duration),
          lastRead: timestamp,
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
        const records = ((request.result || []) as ReadingRecord[]).map(r => normalizeReadingRecord(r))
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

export async function saveChapterContent(content: {
  bookId: string
  chapterIndex: number
  title: string
  content: string
  sourceUrl?: string
  chapterUrl?: string
}): Promise<void> {
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
): Promise<string | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readonly')
      const request = tx.objectStore(STORE_CHAPTER_CONTENTS).get(
        chapterContentKey(bookId, chapterIndex),
      )
      request.onsuccess = () => {
        const record = request.result as StoredChapterContent | undefined
        if (!record) return resolve(null)
        if (sourceUrl && record.sourceUrl && record.sourceUrl !== sourceUrl) {
          return resolve(null)
        }
        if (chapterUrl && record.chapterUrl && record.chapterUrl !== chapterUrl) {
          return resolve(null)
        }
        resolve(record.content)
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

export async function clearChapterImages(_bookId?: string): Promise<void> {
  // Web IndexedDB 模式下无独立原生 chapter_image_cache 表
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

export async function exportSnapshotViaSession(): Promise<ExportSessionHandler> {
  const snapshot = await exportDatabaseSnapshot()
  const preferences: Record<string, string> = {}
  for (const key of ['legado_app_settings', 'legado_web_reader_settings', 'legado_theme', 'legado_theme_accent']) {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(key)
      if (val !== null) preferences[key] = val
    }
  }
  return {
    snapshot,
    preferences,
    readBookFile: async (bookId: string) => {
      const book = await getBook(bookId)
      if (book?.fileData) return book.fileData
      throw new StorageError({ code: 'NOT_FOUND', operation: 'readBookFile', message: '书籍无文件' })
    },
    closeSession: async () => {},
  }
}

export async function importSnapshotViaStaging(
  snapshot: DatabaseSnapshot,
  clearStores: DatabaseStoreName[],
  preferences: Record<string, string | null> = {},
  bookFiles: Map<string, ArrayBuffer | Uint8Array> = new Map(),
  _expectedBookChecksums?: Record<string, string>,
): Promise<void> {
  const target: DatabaseSnapshot = { ...snapshot }
  if (target.books && bookFiles.size > 0) {
    target.books = target.books.map((b: any) => {
      if (b && b.meta?.id && bookFiles.has(b.meta.id)) {
        const file = bookFiles.get(b.meta.id)!
        return {
          ...b,
          fileData:
            file instanceof ArrayBuffer
              ? file
              : (file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer),
        }
      }
      return b
    })
  }
  await importDatabaseSnapshot(target, clearStores)
  for (const [k, v] of Object.entries(preferences)) {
    if (typeof localStorage !== 'undefined') {
      if (v !== null) localStorage.setItem(k, v)
      else localStorage.removeItem(k)
    }
  }
}

export const indexedDbBackend: StorageBackend = {
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
  clearChapterImages,
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
