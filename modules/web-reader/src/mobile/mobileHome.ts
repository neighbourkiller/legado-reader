import type { BookMeta } from '@/parsers/types'

export function clampBookProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, Math.round(progress)))
}

export function selectMostRecentBook(books: readonly BookMeta[]): BookMeta | null {
  return books.reduce<BookMeta | null>((mostRecent, book) => {
    if (!mostRecent || book.lastReadTime > mostRecent.lastReadTime) return book
    return mostRecent
  }, null)
}
