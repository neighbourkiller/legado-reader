import type { OnlineChapterPayload } from '@/source/types/BookSource'

const PAYLOAD_PREFIX = '__LEGADO_CHAPTER_PAYLOAD_V1__:'
const LEGACY_IMAGE_PAYLOAD_PREFIX = '__LEGADO_IMAGE_CHAPTER_V1__:'

export function serializeOnlineChapterPayload(payload: OnlineChapterPayload): string {
  if (payload.type === 'text' && !payload.title && !payload.embeddedImages?.length) return payload.text
  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`
}

export function deserializeOnlineChapterPayload(content: string): OnlineChapterPayload {
  const prefix = content.startsWith(PAYLOAD_PREFIX) ? PAYLOAD_PREFIX
    : content.startsWith(LEGACY_IMAGE_PAYLOAD_PREFIX) ? LEGACY_IMAGE_PAYLOAD_PREFIX : ''
  if (!prefix) return { type: 'text', text: content }
  try {
    const value = JSON.parse(content.slice(prefix.length)) as OnlineChapterPayload
    if (value.type === 'images' && Array.isArray(value.images)) return value
    if (value.type === 'text' && typeof value.text === 'string') return value
  } catch (err) {
    console.warn('[ChapterPayload] 损坏或旧版本缓存作为普通文本展示，避免静默丢失', err)
  }
  return { type: 'text', text: content }
}
