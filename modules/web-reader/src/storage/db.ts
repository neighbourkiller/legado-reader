import { platform } from '@/platform/capabilities'
import type { StorageBackend } from './types'
import { indexedDbBackend, getLocalDeviceId as getWebDeviceId } from './indexedDbBackend'
import { sqliteBackend, getCachedDeviceId } from './sqliteBackend'

export * from './types'
export { indexedDbBackend } from './indexedDbBackend'
export { sqliteBackend } from './sqliteBackend'

export const backend: StorageBackend = platform.isDesktop ? sqliteBackend : indexedDbBackend

export function getLocalDeviceId(): string {
  if (platform.isDesktop) {
    return getCachedDeviceId()
  }
  return getWebDeviceId()
}

// --- Books ---
export const saveBook = (...args: Parameters<StorageBackend['saveBook']>) => backend.saveBook(...args)
export const getBook = (...args: Parameters<StorageBackend['getBook']>) => backend.getBook(...args)
export const getAllBookMetas = (...args: Parameters<StorageBackend['getAllBookMetas']>) => backend.getAllBookMetas(...args)
export const updateBookMeta = (...args: Parameters<StorageBackend['updateBookMeta']>) => backend.updateBookMeta(...args)
export const deleteBookFromDB = (...args: Parameters<StorageBackend['deleteBookFromDB']>) => backend.deleteBookFromDB(...args)
export const getAllStoredBookFiles = (...args: Parameters<StorageBackend['getAllStoredBookFiles']>) => backend.getAllStoredBookFiles(...args)

// --- Bookmarks ---
export const saveBookmark = (...args: Parameters<StorageBackend['saveBookmark']>) => backend.saveBookmark(...args)
export const getBookmarkAt = (...args: Parameters<StorageBackend['getBookmarkAt']>) => backend.getBookmarkAt(...args)
export const getAllBookmarks = (...args: Parameters<StorageBackend['getAllBookmarks']>) => backend.getAllBookmarks(...args)
export const getBookmarksByBookId = (...args: Parameters<StorageBackend['getBookmarksByBookId']>) => backend.getBookmarksByBookId(...args)
export const deleteBookmark = (...args: Parameters<StorageBackend['deleteBookmark']>) => backend.deleteBookmark(...args)

// --- Highlights ---
export const saveHighlight = (...args: Parameters<StorageBackend['saveHighlight']>) => backend.saveHighlight(...args)
export const getHighlightsByBookId = (...args: Parameters<StorageBackend['getHighlightsByBookId']>) => backend.getHighlightsByBookId(...args)
export const getHighlightsByChapter = (...args: Parameters<StorageBackend['getHighlightsByChapter']>) => backend.getHighlightsByChapter(...args)
export const deleteHighlight = (...args: Parameters<StorageBackend['deleteHighlight']>) => backend.deleteHighlight(...args)

// --- Replace Rules ---
export const saveReplaceRule = (...args: Parameters<StorageBackend['saveReplaceRule']>) => backend.saveReplaceRule(...args)
export const getAllReplaceRules = (...args: Parameters<StorageBackend['getAllReplaceRules']>) => backend.getAllReplaceRules(...args)
export const deleteReplaceRule = (...args: Parameters<StorageBackend['deleteReplaceRule']>) => backend.deleteReplaceRule(...args)

// --- Reading Records ---
export const addReadingTime = (...args: Parameters<StorageBackend['addReadingTime']>) => backend.addReadingTime(...args)
export const getAllReadingRecords = (...args: Parameters<StorageBackend['getAllReadingRecords']>) => backend.getAllReadingRecords(...args)
export const deleteReadingRecord = (...args: Parameters<StorageBackend['deleteReadingRecord']>) => backend.deleteReadingRecord(...args)
export const clearReadingRecords = (...args: Parameters<StorageBackend['clearReadingRecords']>) => backend.clearReadingRecords(...args)

// --- Chapter Contents ---
export const saveChapterContent = (...args: Parameters<StorageBackend['saveChapterContent']>) => backend.saveChapterContent(...args)
export const getChapterContent = (...args: Parameters<StorageBackend['getChapterContent']>) => backend.getChapterContent(...args)
export const getBookChapterContents = (...args: Parameters<StorageBackend['getBookChapterContents']>) => backend.getBookChapterContents(...args)
export const getChapterCacheSummaries = (...args: Parameters<StorageBackend['getChapterCacheSummaries']>) => backend.getChapterCacheSummaries(...args)
export const deleteBookChapterContents = (...args: Parameters<StorageBackend['deleteBookChapterContents']>) => backend.deleteBookChapterContents(...args)
export const clearChapterContents = (...args: Parameters<StorageBackend['clearChapterContents']>) => backend.clearChapterContents(...args)
export const clearChapterImages = (...args: Parameters<StorageBackend['clearChapterImages']>) => backend.clearChapterImages(...args)

// --- Settings ---
export const saveSettings = (...args: Parameters<StorageBackend['saveSettings']>) => backend.saveSettings(...args)
export const loadSettings = (...args: Parameters<StorageBackend['loadSettings']>) => backend.loadSettings(...args)

// --- Book Sources ---
export const saveBookSource = (...args: Parameters<StorageBackend['saveBookSource']>) => backend.saveBookSource(...args)
export const getAllBookSources = (...args: Parameters<StorageBackend['getAllBookSources']>) => backend.getAllBookSources(...args)
export const deleteBookSource = (...args: Parameters<StorageBackend['deleteBookSource']>) => backend.deleteBookSource(...args)
export const importBookSources = (...args: Parameters<StorageBackend['importBookSources']>) => backend.importBookSources(...args)

// --- Snapshots ---
export const exportDatabaseSnapshot = (...args: Parameters<StorageBackend['exportDatabaseSnapshot']>) => backend.exportDatabaseSnapshot(...args)
export const importDatabaseSnapshot = (...args: Parameters<StorageBackend['importDatabaseSnapshot']>) => backend.importDatabaseSnapshot(...args)

// --- Sessions & Staging ---
export const exportSnapshotViaSession = () =>
  backend.exportSnapshotViaSession
    ? backend.exportSnapshotViaSession()
    : indexedDbBackend.exportSnapshotViaSession!()

export const importSnapshotViaStaging = (
  ...args: Parameters<NonNullable<StorageBackend['importSnapshotViaStaging']>>
) =>
  backend.importSnapshotViaStaging
    ? backend.importSnapshotViaStaging(...args)
    : indexedDbBackend.importSnapshotViaStaging!(...args)
