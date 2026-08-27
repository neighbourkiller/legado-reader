import JSZip from 'jszip'
import { deserializeOnlineChapterPayload } from '@/source/engine/ChapterPayload'
import type { StoredChapterContent } from '@/storage/types'

/**
 * 过滤文件名中的非法字符并去空格
 */
export function sanitizeFileName(name: string): string {
  const sanitized = name
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || '未命名'
}

/**
 * 构建默认的书籍 txt 文件名
 */
export function buildBookTxtFileName(bookName: string, author?: string): string {
  const safeName = sanitizeFileName(bookName || '未知书籍')
  const safeAuthor = author ? sanitizeFileName(author) : ''
  if (safeAuthor && safeAuthor !== '未知作者' && safeAuthor !== '佚名') {
    return `${safeName} - ${safeAuthor}.txt`
  }
  return `${safeName}.txt`
}

export interface NovelMetaInfo {
  name: string
  author?: string
  intro?: string
}

/**
 * 将章节缓存和书籍信息格式化为小说 TXT 文本
 */
export function generateBookTxtContent(
  meta: NovelMetaInfo,
  chapters: StoredChapterContent[],
): string {
  const sorted = [...chapters].sort((a, b) => a.chapterIndex - b.chapterIndex)
  const lines: string[] = []

  // 书籍元信息头部
  lines.push(`《${meta.name || '未知书籍'}》`)
  if (meta.author) {
    lines.push(`作者：${meta.author}`)
  }
  if (meta.intro?.trim()) {
    lines.push('')
    lines.push('【内容简介】')
    lines.push(meta.intro.trim())
  }
  lines.push('')
  lines.push('==================================================')
  lines.push('')

  // 章节正文
  for (const chapter of sorted) {
    const title = chapter.title?.trim() || `第 ${chapter.chapterIndex + 1} 章`
    lines.push(title)
    lines.push('')

    const payload = deserializeOnlineChapterPayload(chapter.content || '')
    if (payload.type === 'text') {
      const text = (payload.text || '').trim()
      if (text) {
        lines.push(text)
      }
    } else if (payload.type === 'images') {
      const imgCount = payload.images?.length || 0
      lines.push(`[图片章节，共 ${imgCount} 张图片]`)
    }

    lines.push('')
    lines.push('')
  }

  return lines.join('\n')
}

export interface NovelExportItem {
  fileName: string
  content: string
}

/**
 * 打包多个小说 TXT 为 ZIP 压缩包
 */
export async function createBatchNovelZip(items: NovelExportItem[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const usedNames = new Set<string>()

  for (const item of items) {
    let name = item.fileName.trim() || '小说.txt'
    if (!name.toLowerCase().endsWith('.txt')) {
      name = `${name}.txt`
    }

    // 防止同名覆盖，添加序号
    if (usedNames.has(name)) {
      const baseName = name.replace(/\.txt$/i, '')
      let index = 2
      let uniqueName = `${baseName} (${index}).txt`
      while (usedNames.has(uniqueName)) {
        index++
        uniqueName = `${baseName} (${index}).txt`
      }
      name = uniqueName
    }
    usedNames.add(name)

    // 添加 UTF-8 BOM，保证各文本工具打开不乱码
    zip.file(name, `\ufeff${item.content}`)
  }

  return await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
