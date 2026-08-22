import type { BookMeta, ReadSettings, StoredBook } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'

const DB_NAME = 'legado-web-reader'
const DB_VERSION = 1

const STORE_BOOKS = 'books'
const STORE_SETTINGS = 'settings'

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

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'meta.id' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
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
    fileData: book.fileData,
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
      const tx = db.transaction(STORE_BOOKS, 'readwrite')
      tx.objectStore(STORE_BOOKS).delete(id)
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
