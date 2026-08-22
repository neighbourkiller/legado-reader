import type { ParsedBook } from './types'
import { parseTxt } from './txt-parser'
import { parseEpub } from './epub-parser'

export { getTxtChapterContent } from './txt-parser'
export { getEpubChapterContent } from './epub-parser'
export type { BookChapter, BookMeta, ChapterContentResult, ParsedBook, ReadSettings, StoredBook } from './types'
export { DEFAULT_READ_SETTINGS } from './types'

/**
 * Parse a book file based on its extension.
 */
export async function parseBook(file: File): Promise<ParsedBook> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'txt':
      return parseTxt(file)
    case 'epub':
      return parseEpub(file)
    default:
      throw new Error(`不支持的文件格式: .${ext}\n目前支持: .txt, .epub`)
  }
}

