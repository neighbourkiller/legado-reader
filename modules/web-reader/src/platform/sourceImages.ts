import { platform } from './capabilities'
import type { BookSource, ImageChapterPayload, ImageReference } from '@/source/types/BookSource'
import { SourceEngine } from '@/source/engine/SourceEngine'

interface NativeImageRecord {
  bookId: string
  chapterIndex: number
  imageIndex: number
  sourceUrl: string
  mime: string
  contentHash: string
  data: number[]
}

export interface MaterializedImageChapter {
  images: ImageReference[]
  blobUrls: string[]
  cached: boolean
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', source)
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
}

function recordsToImages(records: NativeImageRecord[]): MaterializedImageChapter {
  const blobUrls: string[] = []
  const images = records.sort((a, b) => a.imageIndex - b.imageIndex).map(record => {
    const bytes = new Uint8Array(record.data)
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: record.mime }))
    blobUrls.push(blobUrl)
    return { url: blobUrl, index: record.imageIndex, mime: record.mime, cacheKey: record.contentHash }
  })
  return { images, blobUrls, cached: true }
}

export async function loadCachedChapterImages(
  bookId: string,
  chapterIndex: number,
  expectedCount: number,
): Promise<MaterializedImageChapter | null> {
  if (!platform.isDesktop) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const records = await invoke<NativeImageRecord[]>('storage_get_chapter_images', { bookId, chapterIndex })
  if (records.length !== expectedCount) return null
  return recordsToImages(records)
}

export async function downloadAndCacheChapterImages(
  engine: SourceEngine,
  source: BookSource,
  bookId: string,
  chapterIndex: number,
  payload: ImageChapterPayload,
): Promise<MaterializedImageChapter> {
  if (!platform.isDesktop) return { images: payload.images, blobUrls: [], cached: false }

  const records: NativeImageRecord[] = new Array(payload.images.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < payload.images.length) {
      const position = cursor++
      const image = payload.images[position]!
      try {
        const response = await engine.fetchSourceAsset(source, image.url, payload.sourceUrl)
        records[position] = {
          bookId, chapterIndex, imageIndex: position, sourceUrl: image.url,
          mime: response.mime, contentHash: await sha256(response.body), data: Array.from(response.body),
        }
      } catch (cause) {
        throw new Error(`第 ${position + 1} 张图片下载失败: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, payload.images.length)) }, () => worker()))
  const { invoke } = await import('@tauri-apps/api/core')
  // 后端先删除旧数据、再写入全部图片并一次提交；失败不会留下“完整章节”的假象。
  await invoke('storage_replace_chapter_images', { images: records })
  return recordsToImages(records)
}
